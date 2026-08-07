import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import {
  buildArtistCard,
  buildEventCard,
  cosineSimilarity,
  getOrCreateEmbeddings,
} from "@/lib/integrations/embeddings";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const SIMILARITY_THRESHOLD = parseFloat(
  process.env.SEMANTIC_SIMILARITY_THRESHOLD || "0.72"
);
const SHORTLIST_SIZE = parseInt(
  process.env.SEMANTIC_SHORTLIST_SIZE || "15",
  10
);
const MAX_SUPPORTING_ARTISTS = 3;

interface TasteArtist {
  id: string;
  name: string;
  genres: string[];
  spotifyScore: number;
  relationship: string;
}

interface UnmatchedEvent {
  id: string;
  title: string;
  artistName: string | null;
  genres: string[];
  lineup: string[];
  eventType: string;
}

interface SemanticCandidate {
  eventId: string;
  topArtists: { artistId: string; name: string; similarity: number }[];
  weightedScore: number;
  breadth: number;
}

export interface SemanticResult {
  eventId: string;
  decision: "recommend" | "uncertain" | "reject";
  semanticFit: number;
  supportingArtists: { artistId: string; name: string; similarity: number }[];
  reasonCodes: string[];
  explanation: string;
  caveats: string[];
}

interface SemanticRunStats {
  embeddingTokensUsed: number;
  llmInputTokens: number;
  llmOutputTokens: number;
  embeddingsCached: number;
  embeddingsGenerated: number;
  eventsShortlisted: number;
  eventsRecommended: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

function hashArtistList(artists: string[]): string {
  const sorted = [...artists].sort((a, b) => a.localeCompare(b));
  return createHash("sha256").update(sorted.join("\0")).digest("hex").slice(0, 16);
}

async function checkCostBudget(
  supabase: ReturnType<typeof createServerClient>
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: budgets } = await supabase
    .from("semantic_cost_budget")
    .select("budget_period, max_cost_usd, kill_switch");

  if (!budgets) return { allowed: true };

  for (const budget of budgets) {
    if (budget.kill_switch) {
      return { allowed: false, reason: "Semantic matching kill switch is active" };
    }
  }

  const dailyBudget = budgets.find((b) => b.budget_period === "daily");
  const monthlyBudget = budgets.find((b) => b.budget_period === "monthly");

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  if (dailyBudget) {
    const { data: dailyUsage } = await supabase
      .from("semantic_usage_log")
      .select("estimated_cost_usd")
      .gte("created_at", todayStart.toISOString());

    const dailyTotal = (dailyUsage || []).reduce(
      (sum, r) => sum + (r.estimated_cost_usd || 0), 0
    );
    if (dailyTotal >= dailyBudget.max_cost_usd) {
      return { allowed: false, reason: `Daily cost budget exceeded ($${dailyTotal.toFixed(4)} / $${dailyBudget.max_cost_usd})` };
    }
  }

  if (monthlyBudget) {
    const { data: monthlyUsage } = await supabase
      .from("semantic_usage_log")
      .select("estimated_cost_usd")
      .gte("created_at", monthStart.toISOString());

    const monthlyTotal = (monthlyUsage || []).reduce(
      (sum, r) => sum + (r.estimated_cost_usd || 0), 0
    );
    if (monthlyTotal >= monthlyBudget.max_cost_usd) {
      return { allowed: false, reason: `Monthly cost budget exceeded ($${monthlyTotal.toFixed(4)} / $${monthlyBudget.max_cost_usd})` };
    }
  }

  return { allowed: true };
}

export async function runSemanticMatching(
  userId: string,
  tasteArtists: TasteArtist[],
  unmatchedEvents: UnmatchedEvent[]
): Promise<{ results: SemanticResult[]; stats: SemanticRunStats }> {
  const startTime = Date.now();

  const stats: SemanticRunStats = {
    embeddingTokensUsed: 0,
    llmInputTokens: 0,
    llmOutputTokens: 0,
    embeddingsCached: 0,
    embeddingsGenerated: 0,
    eventsShortlisted: 0,
    eventsRecommended: 0,
    estimatedCostUsd: 0,
    latencyMs: 0,
  };

  if (tasteArtists.length === 0 || unmatchedEvents.length === 0) {
    stats.latencyMs = Date.now() - startTime;
    return { results: [], stats };
  }

  const supabase = createServerClient();

  const budgetCheck = await checkCostBudget(supabase);
  if (!budgetCheck.allowed) {
    console.warn(`Semantic matching skipped: ${budgetCheck.reason}`);
    stats.latencyMs = Date.now() - startTime;
    return { results: [], stats };
  }
  const artistHash = hashArtistList(tasteArtists.map((a) => a.name));

  // Check semantic_match_cache for already-processed events
  const eventIds = unmatchedEvents.map((e) => e.id);
  const { data: cachedMatches } = await supabase
    .from("semantic_match_cache")
    .select("*")
    .eq("artist_list_hash", artistHash)
    .in("event_id", eventIds);

  const cachedMap = new Map<string, SemanticResult>();
  for (const row of cachedMatches || []) {
    cachedMap.set(row.event_id, {
      eventId: row.event_id,
      decision: row.decision as SemanticResult["decision"],
      semanticFit: row.semantic_fit,
      supportingArtists: row.supporting_artists as SemanticResult["supportingArtists"],
      reasonCodes: row.reason_codes || [],
      explanation: row.explanation || "",
      caveats: [],
    });
  }

  const uncachedEvents = unmatchedEvents.filter((e) => !cachedMap.has(e.id));
  const cachedResults = unmatchedEvents
    .filter((e) => cachedMap.has(e.id))
    .map((e) => cachedMap.get(e.id)!);

  if (uncachedEvents.length === 0) {
    stats.latencyMs = Date.now() - startTime;
    return { results: cachedResults, stats };
  }

  // Step 1: Build and embed artist cards
  const artistCards = tasteArtists.map((a) => ({
    entityId: a.id,
    entityType: "artist" as const,
    cardText: buildArtistCard({
      id: a.id,
      name: a.name,
      genres: a.genres,
      spotifyScore: a.spotifyScore,
      relationship: a.relationship,
    }),
  }));

  const artistEmbResult = await getOrCreateEmbeddings(artistCards);
  stats.embeddingTokensUsed += artistEmbResult.tokensUsed;
  stats.embeddingsCached += artistEmbResult.cached;
  stats.embeddingsGenerated += artistEmbResult.generated;

  // Step 2: Build and embed event cards
  const eventCards = uncachedEvents.map((e) => ({
    entityId: e.id,
    entityType: "event" as const,
    cardText: buildEventCard({
      id: e.id,
      title: e.title,
      artistName: e.artistName,
      genres: e.genres,
      lineup: e.lineup,
      eventType: e.eventType,
    }),
  }));

  const eventEmbResult = await getOrCreateEmbeddings(eventCards);
  stats.embeddingTokensUsed += eventEmbResult.tokensUsed;
  stats.embeddingsCached += eventEmbResult.cached;
  stats.embeddingsGenerated += eventEmbResult.generated;

  // Build lookup maps
  const artistEmbMap = new Map<string, number[]>();
  for (const r of artistEmbResult.results) {
    artistEmbMap.set(r.entityId, r.embedding);
  }

  const eventEmbMap = new Map<string, number[]>();
  for (const r of eventEmbResult.results) {
    eventEmbMap.set(r.entityId, r.embedding);
  }

  // Step 3: Compute vector similarity for each event against all taste artists
  const candidates: SemanticCandidate[] = [];

  for (const event of uncachedEvents) {
    const eventEmb = eventEmbMap.get(event.id);
    if (!eventEmb) continue;

    const artistSimilarities: { artistId: string; name: string; similarity: number; weight: number }[] = [];

    for (const artist of tasteArtists) {
      const artistEmb = artistEmbMap.get(artist.id);
      if (!artistEmb) continue;

      const sim = cosineSimilarity(eventEmb, artistEmb);
      artistSimilarities.push({
        artistId: artist.id,
        name: artist.name,
        similarity: sim,
        weight: artist.spotifyScore,
      });
    }

    artistSimilarities.sort((a, b) => b.similarity - a.similarity);
    const topArtists = artistSimilarities.slice(0, MAX_SUPPORTING_ARTISTS);

    if (topArtists.length === 0 || topArtists[0].similarity < SIMILARITY_THRESHOLD) {
      continue;
    }

    // Weighted aggregate: sum(sim * weight) / sum(weight) for top artists
    const totalWeight = topArtists.reduce((sum, a) => sum + a.weight, 0);
    const weightedScore = totalWeight > 0
      ? topArtists.reduce((sum, a) => sum + a.similarity * a.weight, 0) / totalWeight
      : topArtists[0].similarity;

    const strongSupporting = topArtists.filter((a) => a.similarity >= SIMILARITY_THRESHOLD);

    candidates.push({
      eventId: event.id,
      topArtists: topArtists.map((a) => ({
        artistId: a.artistId,
        name: a.name,
        similarity: Math.round(a.similarity * 1000) / 1000,
      })),
      weightedScore,
      breadth: strongSupporting.length,
    });
  }

  // Sort by weighted score and take top-K for LLM review
  candidates.sort((a, b) => b.weightedScore - a.weightedScore);
  const shortlist = candidates.slice(0, SHORTLIST_SIZE);
  stats.eventsShortlisted = shortlist.length;

  if (shortlist.length === 0) {
    stats.latencyMs = Date.now() - startTime;
    return { results: cachedResults, stats };
  }

  // Step 4: LLM review of shortlist
  const eventMap = new Map(uncachedEvents.map((e) => [e.id, e]));
  const llmResults = await reviewShortlist(shortlist, eventMap, tasteArtists);
  stats.llmInputTokens = llmResults.inputTokens;
  stats.llmOutputTokens = llmResults.outputTokens;

  // Cache all results (including rejects)
  const cacheRows = llmResults.results.map((r) => ({
    event_id: r.eventId,
    artist_list_hash: artistHash,
    decision: r.decision,
    semantic_fit: r.semanticFit,
    supporting_artists: r.supportingArtists,
    reason_codes: r.reasonCodes,
    explanation: r.explanation,
    model_version: `gpt-4.1-mini/v${1}`,
  }));

  if (cacheRows.length > 0) {
    await supabase
      .from("semantic_match_cache")
      .upsert(cacheRows, { onConflict: "event_id,artist_list_hash" });
  }

  const recommended = llmResults.results.filter(
    (r) => r.decision === "recommend" && r.semanticFit >= 0.7
  );
  stats.eventsRecommended = recommended.length;

  // Cost estimate
  const embeddingCost = (stats.embeddingTokensUsed / 1_000_000) * 0.02;
  const llmInputCost = (stats.llmInputTokens / 1_000_000) * 0.4;
  const llmOutputCost = (stats.llmOutputTokens / 1_000_000) * 1.6;
  stats.estimatedCostUsd = Math.round((embeddingCost + llmInputCost + llmOutputCost) * 10000) / 10000;
  stats.latencyMs = Date.now() - startTime;

  // Log usage
  await supabase.from("semantic_usage_log").insert({
    run_id: crypto.randomUUID(),
    user_id: userId,
    embedding_tokens_used: stats.embeddingTokensUsed,
    llm_input_tokens: stats.llmInputTokens,
    llm_output_tokens: stats.llmOutputTokens,
    embeddings_cached: stats.embeddingsCached,
    embeddings_generated: stats.embeddingsGenerated,
    events_shortlisted: stats.eventsShortlisted,
    events_recommended: stats.eventsRecommended,
    estimated_cost_usd: stats.estimatedCostUsd,
    latency_ms: stats.latencyMs,
  });

  return {
    results: [...cachedResults, ...llmResults.results],
    stats,
  };
}

const SEMANTIC_REVIEW_PROMPT = `You review music event recommendations for a user based on their musical taste. Each event has been identified as potentially relevant through embedding similarity to the user's listened artists.

Your job: confirm or reject each recommendation using the musical evidence provided.

RECOMMEND when:
- The event artist genuinely shares musical DNA with the supporting taste artists (same subgenre, scene, or era)
- Multiple strong supporting artists point to the same musical territory
- The connection is specific and explainable ("alt-rock from the 2000s UK scene")

REJECT when:
- The similarity is superficial (both just "pop" or "rock" with no deeper connection)
- The connection is only through a shared broad genre
- The event metadata is too sparse to make a confident judgement
- The event is a tribute act for an artist not in the user's taste profile

Mark UNCERTAIN when:
- Evidence is mixed — some supporting artists are relevant, others aren't
- The genre overlap is real but narrow (one subgenre match among diverse taste)

Respond with JSON: {"results": [{
  "event_id": "uuid",
  "semantic_fit": 0.0-1.0,
  "decision": "recommend" | "uncertain" | "reject",
  "supporting_artist_ids": ["uuid", ...],
  "reason_codes": ["genre_overlap", "era_match", "scene_proximity", "subgenre_match", "broad_genre_only", "sparse_metadata", "tribute_mismatch"],
  "explanation": "string (max 30 words)",
  "caveats": ["tribute", "sparse_metadata", "festival_lineup", ...]
}]}`;

async function reviewShortlist(
  shortlist: SemanticCandidate[],
  eventMap: Map<string, UnmatchedEvent>,
  tasteArtists: TasteArtist[]
): Promise<{ results: SemanticResult[]; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.OPENAI_API_SECRET;
  if (!apiKey) {
    return {
      results: shortlist.map((c) => ({
        eventId: c.eventId,
        decision: "uncertain" as const,
        semanticFit: 0,
        supportingArtists: c.topArtists,
        reasonCodes: ["api_unavailable"],
        explanation: "OpenAI API not configured",
        caveats: [],
      })),
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const artistNameMap = new Map(tasteArtists.map((a) => [a.id, a]));

  const eventDescriptions = shortlist.map((candidate) => {
    const event = eventMap.get(candidate.eventId);
    if (!event) return "";

    const supporting = candidate.topArtists
      .map((a) => {
        const artist = artistNameMap.get(a.artistId);
        return `${a.name} (similarity: ${a.similarity}, genres: ${artist?.genres.slice(0, 3).join(", ") || "unknown"})`;
      })
      .join("; ");

    return [
      `Event ID: ${event.id}`,
      `Title: "${event.title}"`,
      event.artistName && `Artist: "${event.artistName}"`,
      event.genres.length > 0 && `Genres: ${event.genres.join(", ")}`,
      event.lineup.length > 1 && `Lineup: ${event.lineup.slice(0, 4).join(", ")}`,
      `Type: ${event.eventType}`,
      `Supporting taste artists: ${supporting}`,
      `Weighted similarity: ${Math.round(candidate.weightedScore * 1000) / 1000}`,
      `Breadth (strong supporting artists): ${candidate.breadth}`,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const model = process.env.SEMANTIC_REVIEW_MODEL || "gpt-4.1-mini";

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 80 * shortlist.length + 100,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SEMANTIC_REVIEW_PROMPT },
        {
          role: "user",
          content: `Review these ${shortlist.length} events for recommendation:\n\n${eventDescriptions.join("\n\n---\n\n")}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    return {
      results: shortlist.map((c) => ({
        eventId: c.eventId,
        decision: "uncertain" as const,
        semanticFit: 0,
        supportingArtists: c.topArtists,
        reasonCodes: ["api_error"],
        explanation: `OpenAI API error: ${res.status}`,
        caveats: [],
      })),
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;

  if (!content) {
    return {
      results: shortlist.map((c) => ({
        eventId: c.eventId,
        decision: "uncertain" as const,
        semanticFit: 0,
        supportingArtists: c.topArtists,
        reasonCodes: ["empty_response"],
        explanation: "Empty OpenAI response",
        caveats: [],
      })),
      inputTokens,
      outputTokens,
    };
  }

  try {
    const parsed = JSON.parse(content) as {
      results: {
        event_id: string;
        semantic_fit: number;
        decision: string;
        supporting_artist_ids?: string[];
        reason_codes: string[];
        explanation: string;
        caveats?: string[];
      }[];
    };

    const validEventIds = new Set(shortlist.map((c) => c.eventId));
    const validDecisions = new Set(["recommend", "uncertain", "reject"]);
    const resultMap = new Map<string, SemanticResult>();

    for (const r of parsed.results) {
      if (!validEventIds.has(r.event_id)) continue;
      if (!validDecisions.has(r.decision)) continue;

      const fit = Math.max(0, Math.min(1, r.semantic_fit || 0));
      const candidate = shortlist.find((c) => c.eventId === r.event_id);

      resultMap.set(r.event_id, {
        eventId: r.event_id,
        decision: r.decision as SemanticResult["decision"],
        semanticFit: fit,
        supportingArtists: candidate?.topArtists || [],
        reasonCodes: r.reason_codes || [],
        explanation: (r.explanation || "").slice(0, 200),
        caveats: r.caveats || [],
      });
    }

    // Fill in any missing results as uncertain
    const results = shortlist.map(
      (c) =>
        resultMap.get(c.eventId) || {
          eventId: c.eventId,
          decision: "uncertain" as const,
          semanticFit: 0,
          supportingArtists: c.topArtists,
          reasonCodes: ["missing_from_response"],
          explanation: "Not included in LLM response",
          caveats: [],
        }
    );

    return { results, inputTokens, outputTokens };
  } catch {
    return {
      results: shortlist.map((c) => ({
        eventId: c.eventId,
        decision: "uncertain" as const,
        semanticFit: 0,
        supportingArtists: c.topArtists,
        reasonCodes: ["parse_error"],
        explanation: "Failed to parse LLM response",
        caveats: [],
      })),
      inputTokens,
      outputTokens,
    };
  }
}
