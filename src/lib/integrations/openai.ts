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
- The event features a followed artist (same real-world person or group)
- The event artist is a verified alias, side project, or current/former band member of a followed artist (you must be certain of this musical relationship)
- The event title references a followed artist's specific album, tour, or signature song
- The performer is a known tribute act for a followed artist

Do NOT match when:
- Two artists merely share a first name, last name, or word in their name (e.g. Roger Taylor is NOT Taylor Swift; James Brown is NOT James Bay; The Weeknd is NOT Weekend Wars)
- The connection is only a shared genre, era, or musical style
- The artist name appears as a substring of an unrelated name
- You are not certain the artists are musically related — when in doubt, do NOT match

Classify your confidence:
- 0.9-1.0 = Strong Match (same artist, confirmed alias, or official tribute)
- 0.7-0.85 = Plausible Discovery (confirmed side project, ex-band member, or clearly related)
- 0.3-0.65 = Weak Match (same genre, vague connection — do NOT match)
- 0-0.25 = No Relationship

Only return matched:true for Strong Match or Plausible Discovery (confidence >= 0.7).

Respond with JSON: {"matched": boolean, "artistName": string|null, "confidence": number 0-1, "reasoning": string (max 20 words)}`;

const BATCH_SYSTEM_PROMPT = `You match music events to a user's followed artists. For each numbered event, determine if it is relevant to any followed artist.

Match when:
- The event features a followed artist (same real-world person or group)
- The event artist is a verified alias, side project, or current/former band member of a followed artist (you must be certain of this musical relationship)
- The event title references a followed artist's specific album, tour, or signature song
- The performer is a known tribute act for a followed artist

Do NOT match when:
- Two artists merely share a first name, last name, or word in their name (e.g. Roger Taylor is NOT Taylor Swift; James Brown is NOT James Bay; The Weeknd is NOT Weekend Wars)
- The connection is only a shared genre, era, or musical style
- The artist name appears as a substring of an unrelated name
- You are not certain the artists are musically related — when in doubt, do NOT match

Only return matched:true when confidence >= 0.7 (Strong Match or Plausible Discovery).

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

export interface BigStoryCandidate {
  index: number;
  title: string;
  artistName: string | null;
  eventType: string;
  venueName: string | null;
  venueCity: string | null;
  startsAt: string | null;
  score: number;
  reasons: string[];
  priceLabel: string;
  status?: string;
  createdAt?: string;
}

export interface BigStoryResult {
  pickedIndex: number;
  headline: string;
  reasoning: string;
}

export async function pickBigStory(
  candidates: BigStoryCandidate[]
): Promise<BigStoryResult | null> {
  const apiKey = process.env.OPENAI_API_SECRET;
  if (!apiKey || candidates.length === 0) return null;

  if (candidates.length === 1) {
    return {
      pickedIndex: candidates[0].index,
      headline: candidates[0].title,
      reasoning: "Only eligible alert",
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  const eventSummaries = candidates
    .map((c, i) => {
      const parts = [
        `[${i}] "${c.title}"`,
        c.artistName && `  Artist: ${c.artistName}`,
        `  Type: ${c.eventType}`,
        c.venueName && `  Venue: ${c.venueName}${c.venueCity ? `, ${c.venueCity}` : ""}`,
        c.startsAt && `  Date: ${c.startsAt}`,
        `  Price: ${c.priceLabel}`,
        `  Match score: ${c.score}, reasons: ${c.reasons.join("; ")}`,
        c.status && `  Status: ${c.status}`,
        c.createdAt && `  First seen: ${c.createdAt.slice(0, 10)}`,
      ];
      return parts.filter(Boolean).join("\n");
    })
    .join("\n\n");

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You help fans never miss seeing their favourite artists live. Pick the single alert that demands action TODAY — the one thing they'd regret not doing tomorrow.

"Big Story of the Day" does NOT mean "event happening today." It means: "the most important action the user should take right now so they don't miss a future event."

Rank by these factors (most to least important):
1. NEWLY AVAILABLE — tickets just released, event just announced, or newly discovered. Fresh opportunities beat stale ones every time.
2. URGENCY — tickets expected to sell out, limited availability, event date approaching fast. The fan might miss out if they wait.
3. Original artist performing live — especially a rare tour, comeback, reunion, or one-off show. Once-in-a-lifetime moments.
4. VALUE — great pricing for a big act. "£45 for Adele" is more exciting than "£200 for a tribute act."
5. Match strength — direct artist match over AI-inferred. Higher score wins ties.

IMPORTANT: Never pick the same event day after day. If multiple candidates exist, prefer:
- Events the user hasn't been alerted about yet (status "eligible" over "sent")
- Newly created candidates (recent created_at) over older ones
- Different artists over the same artist appearing repeatedly

Tributes and experiences are only the lead story if there is genuinely nothing else.
Today's date is ${today}. Events within 30 days are more urgent. Events just announced are the most actionable.

Respond with JSON: {"pickedIndex": number, "headline": string (max 80 chars — urgent, personal, as if texting a friend who might miss out, e.g. "Coldplay tickets just dropped — your city, next month!" or "Don't sleep on this — Radiohead are back!"), "reasoning": string (max 30 words)}`,
        },
        {
          role: "user",
          content: `Pick the single most interesting alert to lead with:\n\n${eventSummaries}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as BigStoryResult;
    if (parsed.pickedIndex >= 0 && parsed.pickedIndex < candidates.length) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
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
