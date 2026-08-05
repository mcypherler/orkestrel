import { createServerClient } from "@/lib/supabase/server";
import { classifyArtistMatchBatchCached } from "@/lib/integrations/openai";

interface MatchEvent {
  id: string;
  title: string;
  event_type: string;
  artist_name: string | null;
  inspired_artist: string | null;
  performer: string | null;
  venue_name: string | null;
  venue_postcode: string | null;
  venue_city: string | null;
  starts_at: string | null;
  official_url: string | null;
  observed_at: string;
}

interface MatchInput {
  event: MatchEvent;
  offers: {
    price_amount: number | null;
    price_currency: string;
    price_type: string | null;
    seat_quality: string;
    section: string | null;
    is_adjacent: boolean | null;
    seller: string | null;
  }[];
  userPrefs: {
    home_postcode: string | null;
    preferred_cities: string[];
    max_price_gbp: number | null;
    ticket_count: number;
    reject_restricted_view: boolean;
    allow_tributes: boolean;
  };
  followedArtists: {
    name: string;
    relationship: string;
  }[];
  aiMatchedArtist?: string | null;
}

interface MatchResult {
  eligible: boolean;
  score: number;
  alertType: "new_event" | "announcement";
  status: "eligible" | "rejected" | "watching_for_dates";
  reasons: string[];
  warnings: string[];
}

const RESTRICTED_TERMS = ["restricted view", "obstructed view", "side view"];

export function matchEvent(input: MatchInput): MatchResult {
  const { event, offers, userPrefs, followedArtists } = input;
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  let rejected = false;

  if (event.event_type === "tour_announcement") {
    const artistMatch = findArtistMatch(
      event.artist_name,
      event.inspired_artist,
      followedArtists,
      event.title
    );
    if (artistMatch) {
      reasons.push(`Followed artist: ${artistMatch.name}`);
    }
    return {
      eligible: false,
      score: 0,
      alertType: "announcement",
      status: "watching_for_dates",
      reasons,
      warnings: ["Tour dates not yet announced", "No tickets available"],
    };
  }

  if (
    event.event_type === "tribute_concert" ||
    event.event_type === "recurring_experience"
  ) {
    if (!userPrefs.allow_tributes) {
      return {
        eligible: false,
        score: 0,
        alertType: "new_event",
        status: "rejected",
        reasons: ["Tribute/inspired events disabled in preferences"],
        warnings: [],
      };
    }
  }

  const artistMatch = findArtistMatch(
    event.artist_name,
    event.inspired_artist,
    followedArtists,
    event.title
  );
  if (artistMatch) {
    score += 40;
    if (event.event_type === "tribute_concert") {
      reasons.push(`Followed artist: ${artistMatch.name} (tribute)`);
    } else if (event.event_type === "recurring_experience") {
      reasons.push(`Followed artist: ${artistMatch.name} (inspired experience)`);
    } else {
      reasons.push(`Followed artist: ${artistMatch.name}`);
    }
  } else if (input.aiMatchedArtist) {
    score += 35;
    if (event.event_type === "tribute_concert") {
      reasons.push(`AI matched: ${input.aiMatchedArtist} (tribute)`);
    } else if (event.event_type === "recurring_experience") {
      reasons.push(`AI matched: ${input.aiMatchedArtist} (inspired experience)`);
    } else {
      reasons.push(`AI matched: ${input.aiMatchedArtist}`);
    }
  }

  if (
    (artistMatch || input.aiMatchedArtist) &&
    (event.event_type === "tribute_concert" || event.event_type === "recurring_experience")
  ) {
    score -= 20;
    warnings.push("Tribute/experience — not the original artist");
  }

  const cityMatch = findCityMatch(
    event.venue_city,
    event.venue_postcode,
    userPrefs.preferred_cities,
    userPrefs.home_postcode
  );
  if (cityMatch) {
    score += 20;
    reasons.push(cityMatch);
  }

  const bestOffer = offers
    .filter((o) => o.price_amount != null)
    .sort((a, b) => (a.price_amount ?? 0) - (b.price_amount ?? 0))[0];

  if (bestOffer && userPrefs.max_price_gbp != null) {
    if ((bestOffer.price_amount ?? 0) <= userPrefs.max_price_gbp) {
      score += 20;
      reasons.push(`Within £${userPrefs.max_price_gbp} price cap`);
    } else {
      rejected = true;
      reasons.push(
        `Price £${bestOffer.price_amount} exceeds £${userPrefs.max_price_gbp} cap`
      );
    }
  } else if (!bestOffer || bestOffer.price_amount == null) {
    warnings.push("Price not supplied — check seller");
  }

  let hasClearView = false;
  let hasUnknownView = false;

  for (const offer of offers) {
    if (
      userPrefs.reject_restricted_view &&
      RESTRICTED_TERMS.includes(offer.seat_quality)
    ) {
      rejected = true;
      reasons.push(`Rejected: ${offer.seat_quality}`);
    }

    if (
      offer.section &&
      RESTRICTED_TERMS.some((term) =>
        offer.section!.toLowerCase().includes(term)
      )
    ) {
      if (userPrefs.reject_restricted_view) {
        rejected = true;
        reasons.push(`Rejected: section "${offer.section}"`);
      }
    }

    if (offer.is_adjacent) {
      score += 10;
    }

    if (offer.seat_quality === "clear") {
      hasClearView = true;
      score += 10;
    } else if (offer.seat_quality === "unknown") {
      hasUnknownView = true;
    }
  }

  if (hasClearView) {
    // at least one offer has a verified clear view
  } else if (offers.length === 0 || hasUnknownView) {
    warnings.push("View not verified");
  }

  if (event.event_type === "recurring_experience") {
    warnings.push("Availability must be checked");
  }

  const hasArtistMatch = !!artistMatch || !!input.aiMatchedArtist;
  return {
    eligible: !rejected && hasArtistMatch && score > 0,
    score,
    alertType: "new_event",
    status: rejected ? "rejected" : hasArtistMatch && score > 0 ? "eligible" : "rejected",
    reasons,
    warnings,
  };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.,''&!?()]/g, "");
}

function findArtistMatch(
  artistName: string | null,
  inspiredArtist: string | null,
  followedArtists: { name: string; relationship: string }[],
  eventTitle?: string
): { name: string } | null {
  const candidates = [inspiredArtist, artistName, eventTitle].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase();
    const candidateNorm = normalize(candidate);

    const exact = followedArtists.find(
      (a) =>
        a.relationship !== "remove" &&
        a.name.toLowerCase() === candidateLower
    );
    if (exact) return exact;

    const normalized = followedArtists.find(
      (a) =>
        a.relationship !== "remove" &&
        a.name.length >= 3 &&
        normalize(a.name) === candidateNorm
    );
    if (normalized) return normalized;

    const boundary = followedArtists.find((a) => {
      if (a.relationship === "remove" || a.name.length < 4) return false;
      const escaped = a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|[\\s,\\-—(])${escaped}([\\s,\\-—)!?]|$)`, "i");
      return re.test(candidate);
    });
    if (boundary) return boundary;
  }
  return null;
}

function findCityMatch(
  venueCity: string | null,
  venuePostcode: string | null,
  preferredCities: string[],
  homePostcode: string | null
): string | null {
  if (venueCity) {
    const match = preferredCities.find(
      (c) => c.toLowerCase() === venueCity.toLowerCase()
    );
    if (match) {
      if (
        homePostcode &&
        venuePostcode &&
        venuePostcode.startsWith(homePostcode.substring(0, 2))
      ) {
        return `Near ${homePostcode} / ${match}`;
      }
      return `In ${match}`;
    }
  }

  if (homePostcode && venuePostcode) {
    const homePrefix = homePostcode.substring(0, 2).toUpperCase();
    const venuePrefix = venuePostcode.substring(0, 2).toUpperCase();
    if (homePrefix === venuePrefix) {
      return `Near ${homePostcode}`;
    }
  }

  return null;
}

export async function runMatchingForUser(userId: string): Promise<{
  matched: number;
  rejected: number;
  watching: number;
  aiMatched: number;
}> {
  const supabase = createServerClient();

  const [prefsRes, artistsRes, eventsRes] = await Promise.all([
    supabase.from("preferences").select("*").eq("user_id", userId).single(),
    supabase
      .from("user_artists")
      .select("artists(name), relationship")
      .eq("user_id", userId)
      .neq("relationship", "remove"),
    supabase
      .from("events")
      .select("*, event_offers(*)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (!prefsRes.data || !eventsRes.data) {
    return { matched: 0, rejected: 0, watching: 0, aiMatched: 0 };
  }

  const prefs = prefsRes.data;
  const followedArtists = (artistsRes.data || []).map((ua) => ({
    name: (ua.artists as unknown as { name: string })?.name || "",
    relationship: ua.relationship as string,
  }));
  const artistNames = followedArtists.map((a) => a.name).filter(Boolean);

  let matched = 0;
  let rejected = 0;
  let watching = 0;
  let aiMatched = 0;

  // Pass 1: regex matching
  const unmatchedEvents: { event: MatchEvent; offers: MatchInput["offers"] }[] = [];

  for (const event of eventsRes.data) {
    const { data: existingCandidate } = await supabase
      .from("alert_candidates")
      .select("id")
      .eq("user_id", userId)
      .eq("event_id", event.id)
      .eq("alert_type", "new_event")
      .maybeSingle();

    if (existingCandidate) continue;

    const typedEvent = event as MatchEvent;
    const offers = (event.event_offers || []) as MatchInput["offers"];

    const regexMatch = findArtistMatch(
      typedEvent.artist_name,
      typedEvent.inspired_artist,
      followedArtists,
      typedEvent.title
    );

    if (regexMatch) {
      const result = matchEvent({
        event: typedEvent,
        offers,
        userPrefs: prefs as MatchInput["userPrefs"],
        followedArtists,
      });

      if (result.status === "rejected") {
        rejected++;
        continue;
      }

      await supabase.from("alert_candidates").insert({
        user_id: userId,
        event_id: event.id,
        alert_type: result.alertType,
        score: result.score,
        reasons: result.reasons,
        warnings: result.warnings,
        status: result.status,
      });

      if (result.status === "eligible") matched++;
      else if (result.status === "watching_for_dates") watching++;
    } else {
      unmatchedEvents.push({ event: typedEvent, offers });
    }
  }

  // Pass 2: send unmatched events to OpenAI for fuzzy classification (cached)
  if (unmatchedEvents.length > 0 && artistNames.length > 0 && process.env.OPENAI_API_SECRET) {
    const aiRequests = unmatchedEvents.map((item) => ({
      eventId: item.event.id,
      eventTitle: item.event.title,
      eventArtistName: item.event.artist_name,
      eventInspiredArtist: item.event.inspired_artist,
      eventPerformer: item.event.performer,
      eventType: item.event.event_type,
      followedArtists: artistNames,
    }));

    const aiResults = await classifyArtistMatchBatchCached(aiRequests, supabase);

    for (let i = 0; i < unmatchedEvents.length; i++) {
      const { event: typedEvent, offers } = unmatchedEvents[i];
      const aiResult = aiResults[i];

      const result = matchEvent({
        event: typedEvent,
        offers,
        userPrefs: prefs as MatchInput["userPrefs"],
        followedArtists,
        aiMatchedArtist: aiResult.matched ? aiResult.artistName : null,
      });

      if (result.status === "rejected") {
        rejected++;
        continue;
      }

      await supabase.from("alert_candidates").insert({
        user_id: userId,
        event_id: typedEvent.id,
        alert_type: result.alertType,
        score: result.score,
        reasons: result.reasons,
        warnings: result.warnings,
        status: result.status,
      });

      if (result.status === "eligible") {
        matched++;
        if (aiResult.matched) aiMatched++;
      } else if (result.status === "watching_for_dates") {
        watching++;
      }
    }
  } else {
    // No AI available — reject unmatched events
    rejected += unmatchedEvents.length;
  }

  return { matched, rejected, watching, aiMatched };
}
