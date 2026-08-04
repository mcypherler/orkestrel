import { createHash } from "crypto";

const OPENAI_MODEL = "gpt-4.1-mini";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

interface ArtistMatchRequest {
  eventId: string;
  eventTitle: string;
  eventArtistName: string | null;
  eventInspiredArtist: string | null;
  eventPerformer: string | null;
  eventType: string;
  followedArtists: string[];
}

interface ArtistMatchResponse {
  matched: boolean;
  artistName: string | null;
  confidence: number;
  reasoning: string;
}

function hashArtistList(artists: string[]): string {
  const sorted = [...artists].sort((a, b) => a.localeCompare(b));
  return createHash("sha256").update(sorted.join("\0")).digest("hex").slice(0, 16);
}

const SYSTEM_PROMPT = `You match music events to a user's followed artists. Given an event and a list of followed artists, determine if the event is relevant to any of them.

Match when:
- The event features, tributes, or is inspired by a followed artist
- The event artist is a known alias, side project, or band member of a followed artist
- The event title clearly references a followed artist's work (album names, signature songs)
- The performer is a known tribute act for a followed artist

Do NOT match when:
- The connection is only a shared genre or era
- The artist name appears as a substring of an unrelated word

Respond with JSON: {"matched": boolean, "artistName": string|null, "confidence": number 0-1, "reasoning": string (max 20 words)}`;

const BATCH_SYSTEM_PROMPT = `You match music events to a user's followed artists. For each numbered event, determine if it is relevant to any followed artist.

Match when:
- The event features, tributes, or is inspired by a followed artist
- The event artist is a known alias, side project, or band member of a followed artist
- The event title clearly references a followed artist's work (album names, signature songs)
- The performer is a known tribute act for a followed artist

Do NOT match when:
- The connection is only a shared genre or era
- The artist name appears as a substring of an unrelated word

Respond with JSON: {"results": [{"index": number, "matched": boolean, "artistName": string|null, "confidence": number 0-1, "reasoning": string (max 15 words)}]}`;

function formatEventDesc(req: ArtistMatchRequest): string {
  return [
    `Title: "${req.eventTitle}"`,
    req.eventArtistName && `Artist: "${req.eventArtistName}"`,
    req.eventPerformer && `Performer: "${req.eventPerformer}"`,
    req.eventInspiredArtist && `Inspired by: "${req.eventInspiredArtist}"`,
    `Type: ${req.eventType}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function classifyArtistMatch(
  request: ArtistMatchRequest
): Promise<ArtistMatchResponse> {
  const apiKey = process.env.OPENAI_API_SECRET;
  if (!apiKey) {
    return { matched: false, artistName: null, confidence: 0, reasoning: "OPENAI_API_SECRET not configured" };
  }

  if (request.followedArtists.length === 0) {
    return { matched: false, artistName: null, confidence: 0, reasoning: "No followed artists" };
  }

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      max_tokens: 150,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Event:\n${formatEventDesc(request)}\n\nFollowed artists: ${request.followedArtists.join(", ")}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    return { matched: false, artistName: null, confidence: 0, reasoning: `OpenAI API error: ${res.status}` };
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return { matched: false, artistName: null, confidence: 0, reasoning: "Empty OpenAI response" };
  }

  try {
    const parsed = JSON.parse(content) as ArtistMatchResponse;
    return {
      matched: parsed.matched && parsed.confidence >= 0.7,
      artistName: parsed.artistName,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    };
  } catch {
    return { matched: false, artistName: null, confidence: 0, reasoning: "Failed to parse OpenAI response" };
  }
}

interface CachedResult {
  eventId: string;
  result: ArtistMatchResponse;
}

export async function classifyArtistMatchBatchCached(
  events: ArtistMatchRequest[],
  supabase: { from: (table: string) => unknown }
): Promise<ArtistMatchResponse[]> {
  const apiKey = process.env.OPENAI_API_SECRET;
  if (!apiKey || events.length === 0) {
    return events.map(() => ({
      matched: false,
      artistName: null,
      confidence: 0,
      reasoning: apiKey ? "Empty batch" : "OPENAI_API_SECRET not configured",
    }));
  }

  const artistHash = hashArtistList(events[0].followedArtists);

  // Check cache for all events
  const eventIds = events.map((e) => e.eventId);
  const db = supabase as ReturnType<typeof import("@/lib/supabase/server").createServerClient>;
  const { data: cached } = await db
    .from("ai_match_cache")
    .select("event_id, matched, artist_name, confidence, reasoning")
    .eq("artist_list_hash", artistHash)
    .in("event_id", eventIds);

  const cacheMap = new Map<string, ArtistMatchResponse>();
  for (const row of cached || []) {
    cacheMap.set(row.event_id, {
      matched: row.matched && row.confidence >= 0.7,
      artistName: row.artist_name,
      confidence: row.confidence,
      reasoning: row.reasoning || "",
    });
  }

  // Split into cached hits and misses
  const uncached: { index: number; request: ArtistMatchRequest }[] = [];
  const results: (ArtistMatchResponse | null)[] = events.map((e, i) => {
    const hit = cacheMap.get(e.eventId);
    if (hit) return hit;
    uncached.push({ index: i, request: e });
    return null;
  });

  if (uncached.length === 0) {
    return results as ArtistMatchResponse[];
  }

  // Batch classify uncached events
  const aiResults = await classifyBatchRaw(
    uncached.map((u) => u.request)
  );

  // Store results in cache and fill in the results array
  const cacheRows: {
    event_id: string;
    artist_list_hash: string;
    matched: boolean;
    artist_name: string | null;
    confidence: number;
    reasoning: string;
  }[] = [];

  for (let i = 0; i < uncached.length; i++) {
    const { index, request } = uncached[i];
    const aiResult = aiResults[i];
    results[index] = aiResult;

    cacheRows.push({
      event_id: request.eventId,
      artist_list_hash: artistHash,
      matched: aiResult.matched,
      artist_name: aiResult.artistName,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning,
    });
  }

  if (cacheRows.length > 0) {
    await db
      .from("ai_match_cache")
      .upsert(cacheRows, { onConflict: "event_id,artist_list_hash" });
  }

  return results as ArtistMatchResponse[];
}

async function classifyBatchRaw(
  events: ArtistMatchRequest[]
): Promise<ArtistMatchResponse[]> {
  const BATCH_SIZE = 10;
  const results: ArtistMatchResponse[] = [];

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);

    const eventLines = batch
      .map((req, idx) => {
        const parts = [
          `[${idx}] Title: "${req.eventTitle}"`,
          req.eventArtistName && `  Artist: "${req.eventArtistName}"`,
          req.eventPerformer && `  Performer: "${req.eventPerformer}"`,
          req.eventInspiredArtist && `  Inspired by: "${req.eventInspiredArtist}"`,
          `  Type: ${req.eventType}`,
        ];
        return parts.filter(Boolean).join("\n");
      })
      .join("\n\n");

    const artistList = batch[0].followedArtists.join(", ");

    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        max_tokens: 50 * batch.length + 50,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: BATCH_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Events:\n${eventLines}\n\nFollowed artists: ${artistList}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      for (const _ of batch) {
        results.push({ matched: false, artistName: null, confidence: 0, reasoning: `OpenAI API error: ${res.status}` });
      }
      continue;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;

    try {
      const parsed = JSON.parse(content) as {
        results: { index: number; matched: boolean; artistName: string | null; confidence: number; reasoning: string }[];
      };

      const resultMap = new Map(parsed.results.map((r) => [r.index, r]));
      for (let j = 0; j < batch.length; j++) {
        const r = resultMap.get(j);
        if (r) {
          results.push({
            matched: r.matched && r.confidence >= 0.7,
            artistName: r.artistName,
            confidence: r.confidence,
            reasoning: r.reasoning,
          });
        } else {
          results.push({ matched: false, artistName: null, confidence: 0, reasoning: "Missing from batch response" });
        }
      }
    } catch {
      for (const _ of batch) {
        results.push({ matched: false, artistName: null, confidence: 0, reasoning: "Failed to parse batch response" });
      }
    }
  }

  return results;
}
