import { createServerClient } from "@/lib/supabase/server";
import type { NormalizedEvent } from "@/lib/integrations/ticketmaster";
import { fetchTicketmasterEvents } from "@/lib/integrations/ticketmaster";
import { MOCK_EVENTS } from "@/lib/fixtures/mock-events";

type SourceMode = "ticketmaster" | "mock" | "hybrid";

function getSourceMode(): SourceMode {
  const mode = process.env.EVENT_SOURCE_MODE || "hybrid";
  if (mode === "ticketmaster" || mode === "mock" || mode === "hybrid")
    return mode;
  return "hybrid";
}

export async function fetchEvents(
  cities: string[],
  artistNames?: string[]
): Promise<NormalizedEvent[]> {
  const mode = getSourceMode();
  const events: NormalizedEvent[] = [];

  if (mode === "ticketmaster" || mode === "hybrid") {
    try {
      const tmEvents = await fetchTicketmasterEvents(cities, 30, artistNames);
      events.push(...tmEvents);
    } catch (err) {
      console.error("Ticketmaster fetch failed:", err);
    }
  }

  if (mode === "mock" || mode === "hybrid") {
    const mockEnabled = process.env.MOCK_DATA_ENABLED !== "false";
    if (mockEnabled) {
      events.push(...MOCK_EVENTS);
    }
  }

  return events;
}

export async function ingestEvents(
  events: NormalizedEvent[]
): Promise<{ created: number; updated: number; duplicates: number }> {
  const supabase = createServerClient();
  let created = 0;
  let updated = 0;
  let duplicates = 0;

  for (const event of events) {
    const { data: existing } = await supabase
      .from("events")
      .select("id")
      .eq("provider", event.provider)
      .eq("provider_event_id", event.provider_event_id)
      .maybeSingle();

    let eventId: string;

    if (existing) {
      eventId = existing.id;

      await supabase
        .from("events")
        .update({
          title: event.title,
          event_type: event.event_type,
          artist_name: event.artist_name,
          inspired_artist: event.inspired_artist,
          performer: event.performer,
          venue_name: event.venue_name,
          venue_postcode: event.venue_postcode,
          venue_city: event.venue_city,
          starts_at: event.starts_at,
          official_url: event.official_url,
          image_url: event.image_url,
          source_payload: event.source_payload,
          observed_at: event.observed_at,
        })
        .eq("id", eventId);

      updated++;
    } else {
      if (event.artist_name && event.venue_name && event.starts_at) {
        const { data: softDup } = await supabase
          .from("events")
          .select("id")
          .eq("artist_name", event.artist_name)
          .eq("venue_name", event.venue_name)
          .eq("starts_at", event.starts_at)
          .maybeSingle();

        if (softDup) {
          duplicates++;
          continue;
        }
      }

      const { data: newEvent, error } = await supabase
        .from("events")
        .insert({
          provider: event.provider,
          provider_event_id: event.provider_event_id,
          title: event.title,
          event_type: event.event_type,
          artist_name: event.artist_name,
          inspired_artist: event.inspired_artist,
          performer: event.performer,
          venue_name: event.venue_name,
          venue_postcode: event.venue_postcode,
          venue_city: event.venue_city,
          starts_at: event.starts_at,
          timezone: event.timezone,
          official_url: event.official_url,
          image_url: event.image_url,
          is_mock: event.is_mock,
          source_payload: event.source_payload,
          observed_at: event.observed_at,
        })
        .select("id")
        .single();

      if (error || !newEvent) {
        console.error("Event insert failed:", error);
        continue;
      }

      eventId = newEvent.id;
      created++;
    }

    for (const offer of event.offers) {
      await supabase.from("event_offers").insert({
        event_id: eventId,
        price_amount: offer.price_amount,
        price_currency: offer.price_currency,
        price_type: offer.price_type,
        section: offer.section,
        row_name: offer.row_name,
        seat_quality: offer.seat_quality,
        is_adjacent: offer.is_adjacent,
        seller: offer.seller,
        observed_at: offer.observed_at,
      });
    }
  }

  return { created, updated, duplicates };
}
