const OPENAI_MODEL = "gpt-4.1-mini";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

interface ArtistMatchRequest {
  eventTitle: string;
  eventArtistName: string | null;
  eventInspiredArtist: string | null;
  eventType: string;
  followedArtists: string[];
}

interface ArtistMatchResponse {
  matched: boolean;
  artistName: string | null;
  confidence: number;
  reasoning: string;
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

  const artistList = request.followedArtists.join(", ");
  const eventDesc = [
    `Title: "${request.eventTitle}"`,
    request.eventArtistName && `Artist: "${request.eventArtistName}"`,
    request.eventInspiredArtist && `Inspired by: "${request.eventInspiredArtist}"`,
    `Type: ${request.eventType}`,
  ]
    .filter(Boolean)
    .join("\n");

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
        {
          role: "system",
          content: `You match music events to a user's followed artists. Given an event and a list of followed artists, determine if the event is relevant to any of them.

Match when:
- The event features, tributes, or is inspired by a followed artist
- The event artist is a known alias, side project, or band member of a followed artist
- The event title clearly references a followed artist's work (album names, signature songs)

Do NOT match when:
- The connection is only a shared genre or era
- The artist name appears as a substring of an unrelated word

Respond with JSON: {"matched": boolean, "artistName": string|null, "confidence": number 0-1, "reasoning": string (max 20 words)}`,
        },
        {
          role: "user",
          content: `Event:\n${eventDesc}\n\nFollowed artists: ${artistList}`,
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

export async function classifyArtistMatchBatch(
  events: ArtistMatchRequest[]
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

  const BATCH_SIZE = 10;
  const results: ArtistMatchResponse[] = [];

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);

    const eventLines = batch
      .map((req, idx) => {
        const parts = [
          `[${idx}] Title: "${req.eventTitle}"`,
          req.eventArtistName && `  Artist: "${req.eventArtistName}"`,
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
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        max_tokens: 50 * batch.length + 50,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You match music events to a user's followed artists. For each numbered event, determine if it is relevant to any followed artist.

Match when:
- The event features, tributes, or is inspired by a followed artist
- The event artist is a known alias, side project, or band member of a followed artist
- The event title clearly references a followed artist's work (album names, signature songs)

Do NOT match when:
- The connection is only a shared genre or era
- The artist name appears as a substring of an unrelated word

Respond with JSON: {"results": [{"index": number, "matched": boolean, "artistName": string|null, "confidence": number 0-1, "reasoning": string (max 15 words)}]}`,
          },
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
