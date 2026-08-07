import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase/server";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || "1536", 10);
const CARD_VERSION = 1;

interface ArtistCardInput {
  id: string;
  name: string;
  genres: string[];
  spotifyScore: number | null;
  relationship: string;
}

interface EventCardInput {
  id: string;
  title: string;
  artistName: string | null;
  genres: string[];
  lineup: string[];
  eventType: string;
}

interface EmbeddingResult {
  entityId: string;
  entityType: "artist" | "event";
  embedding: number[];
  cardText: string;
  cached: boolean;
}

export function buildArtistCard(artist: ArtistCardInput): string {
  const parts = [`Artist: ${artist.name}`];
  if (artist.genres.length > 0) {
    parts.push(`Genres: ${artist.genres.slice(0, 5).join(", ")}`);
  }
  if (artist.spotifyScore != null) {
    parts.push(`Taste weight: ${Math.round(artist.spotifyScore)} (${artist.relationship})`);
  }
  return parts.join("\n");
}

export function buildEventCard(event: EventCardInput): string {
  const parts = [`Event: ${event.title}`];
  if (event.artistName) {
    parts.push(`Artist: ${event.artistName}`);
  }
  if (event.lineup.length > 1) {
    parts.push(`Lineup: ${event.lineup.slice(0, 4).join(", ")}`);
  }
  if (event.genres.length > 0) {
    parts.push(`Genres: ${event.genres.slice(0, 5).join(", ")}`);
  }
  parts.push(`Type: ${event.eventType}`);
  return parts.join("\n");
}

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function fetchEmbeddings(
  texts: string[]
): Promise<{ embeddings: number[][]; tokensUsed: number }> {
  const apiKey = process.env.OPENAI_API_SECRET;
  if (!apiKey) throw new Error("OPENAI_API_SECRET not configured");

  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000));
      const retry = await fetch(OPENAI_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: texts,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      });
      if (!retry.ok) {
        throw new Error(`OpenAI Embeddings API error: ${retry.status}`);
      }
      const retryData = await retry.json();
      return {
        embeddings: retryData.data
          .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
          .map((d: { embedding: number[] }) => d.embedding),
        tokensUsed: retryData.usage?.total_tokens || 0,
      };
    }
    throw new Error(`OpenAI Embeddings API error: ${res.status}`);
  }

  const data = await res.json();
  return {
    embeddings: data.data
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((d: { embedding: number[] }) => d.embedding),
    tokensUsed: data.usage?.total_tokens || 0,
  };
}

export async function getOrCreateEmbeddings(
  items: {
    entityId: string;
    entityType: "artist" | "event";
    cardText: string;
  }[]
): Promise<{ results: EmbeddingResult[]; tokensUsed: number; cached: number; generated: number }> {
  if (items.length === 0) {
    return { results: [], tokensUsed: 0, cached: 0, generated: 0 };
  }

  const supabase = createServerClient();
  const hashes = items.map((item) => contentHash(item.cardText));

  const { data: existing } = await supabase
    .from("taste_embeddings")
    .select("entity_id, entity_type, embedding, card_text, content_hash")
    .eq("embedding_model", EMBEDDING_MODEL)
    .eq("card_version", CARD_VERSION)
    .in("entity_id", items.map((i) => i.entityId));

  const existingMap = new Map<string, { embedding: number[]; cardText: string; contentHash: string }>();
  for (const row of existing || []) {
    existingMap.set(`${row.entity_type}:${row.entity_id}`, {
      embedding: typeof row.embedding === "string" ? JSON.parse(row.embedding) : row.embedding,
      cardText: row.card_text,
      contentHash: row.content_hash,
    });
  }

  const results: EmbeddingResult[] = [];
  const needsEmbedding: { index: number; item: typeof items[0]; hash: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const hash = hashes[i];
    const key = `${item.entityType}:${item.entityId}`;
    const cached = existingMap.get(key);

    if (cached && cached.contentHash === hash) {
      results.push({
        entityId: item.entityId,
        entityType: item.entityType,
        embedding: cached.embedding,
        cardText: item.cardText,
        cached: true,
      });
    } else {
      needsEmbedding.push({ index: i, item, hash });
      results.push(null as unknown as EmbeddingResult);
    }
  }

  let tokensUsed = 0;

  if (needsEmbedding.length > 0) {
    const BATCH_SIZE = 100;
    for (let b = 0; b < needsEmbedding.length; b += BATCH_SIZE) {
      const batch = needsEmbedding.slice(b, b + BATCH_SIZE);
      const texts = batch.map((n) => n.item.cardText);

      const { embeddings, tokensUsed: batchTokens } = await fetchEmbeddings(texts);
      tokensUsed += batchTokens;

      const upsertRows = [];

      for (let j = 0; j < batch.length; j++) {
        const { index, item, hash } = batch[j];
        const embedding = embeddings[j];

        results[index] = {
          entityId: item.entityId,
          entityType: item.entityType,
          embedding,
          cardText: item.cardText,
          cached: false,
        };

        upsertRows.push({
          entity_type: item.entityType,
          entity_id: item.entityId,
          card_text: item.cardText,
          content_hash: hash,
          embedding_model: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
          embedding: `[${embedding.join(",")}]`,
          card_version: CARD_VERSION,
        });
      }

      if (upsertRows.length > 0) {
        await supabase
          .from("taste_embeddings")
          .upsert(upsertRows, {
            onConflict: "entity_type,entity_id,embedding_model,card_version",
          });
      }
    }
  }

  return {
    results: results.filter(Boolean),
    tokensUsed,
    cached: items.length - needsEmbedding.length,
    generated: needsEmbedding.length,
  };
}
