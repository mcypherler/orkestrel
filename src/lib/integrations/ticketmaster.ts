import type { EventType } from "@/lib/types/database";

export interface NormalizedEvent {
  provider: string;
  provider_event_id: string;
  title: string;
  event_type: EventType;
  artist_name: string | null;
  inspired_artist: string | null;
  performer: string | null;
  venue_name: string | null;
  venue_postcode: string | null;
  venue_city: string | null;
  starts_at: string | null;
  timezone: string;
  official_url: string | null;
  image_url: string | null;
  is_mock: boolean;
  source_payload: Record<string, unknown> | null;
  observed_at: string;
  offers: NormalizedOffer[];
}

export interface NormalizedOffer {
  price_amount: number | null;
  price_currency: string;
  price_type: "from" | "exact" | "range" | null;
  section: string | null;
  row_name: string | null;
  seat_quality: "unknown" | "clear" | "restricted" | "obstructed" | "side";
  is_adjacent: boolean | null;
  seller: string | null;
  observed_at: string;
}

const API_BASE = "https://app.ticketmaster.com/discovery/v2";

const CITY_GEOPOINTS: Record<string, { lat: number; lng: number }> = {
  poole: { lat: 50.7194, lng: -1.9811 },
  bournemouth: { lat: 50.7192, lng: -1.8808 },
  london: { lat: 51.5074, lng: -0.1278 },
};

function toGeohash(lat: number, lng: number): string {
  const chars = "0123456789bcdefghjkmnpqrstuvwxyz";
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180;
  let hash = "";
  let isLng = true;
  let bit = 0;
  let ch = 0;

  while (hash.length < 9) {
    if (isLng) {
      const mid = (minLng + maxLng) / 2;
      if (lng > mid) { ch |= 1 << (4 - bit); minLng = mid; } else { maxLng = mid; }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat > mid) { ch |= 1 << (4 - bit); minLat = mid; } else { maxLat = mid; }
    }
    isLng = !isLng;
    if (bit < 4) { bit++; } else { hash += chars[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

export async function fetchTicketmasterEvents(
  cities: string[],
  radiusMiles: number = 30,
  artistNames?: string[]
): Promise<NormalizedEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) throw new Error("TICKETMASTER_API_KEY not set");

  const events: NormalizedEvent[] = [];
  const seenIds = new Set<string>();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  for (const city of cities) {
    const geo = CITY_GEOPOINTS[city.toLowerCase()];
    if (!geo) continue;

    const geoPoint = toGeohash(geo.lat, geo.lng);

    const params = new URLSearchParams({
      apikey: apiKey,
      countryCode: "GB",
      classificationName: "music",
      geoPoint,
      radius: String(radiusMiles),
      unit: "miles",
      startDateTime: now,
      sort: "date,asc",
      size: "50",
    });

    if (artistNames && artistNames.length > 0) {
      params.set("keyword", artistNames.slice(0, 5).join(" OR "));
    }

    try {
      const res = await fetch(`${API_BASE}/events.json?${params}`, {
        headers: { Accept: "application/json" },
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        console.warn(`Ticketmaster rate limited, retry after ${retryAfter}s`);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Ticketmaster ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      const tmEvents = data?._embedded?.events || [];

      for (const tm of tmEvents) {
        if (seenIds.has(tm.id)) continue;
        seenIds.add(tm.id);

        const normalized = normalizeTicketmasterEvent(tm);
        if (normalized) events.push(normalized);
      }
    } catch (err) {
      console.error(`Ticketmaster fetch error for ${city}:`, err);
    }
  }

  return events;
}

function normalizeTicketmasterEvent(
  tm: Record<string, unknown>
): NormalizedEvent | null {
  const id = tm.id as string;
  const name = tm.name as string;
  if (!id || !name) return null;

  const venue =
    ((tm._embedded as Record<string, unknown>)?.venues as Record<string, unknown>[])?.[0];
  const attractions =
    ((tm._embedded as Record<string, unknown>)?.attractions as Record<string, unknown>[]) || [];
  const dates = tm.dates as Record<string, unknown> | undefined;
  const startDate = dates?.start as Record<string, unknown> | undefined;
  const priceRanges = (tm.priceRanges as Record<string, unknown>[]) || [];
  const images = (tm.images as Record<string, unknown>[]) || [];
  const sales = tm.sales as Record<string, unknown> | undefined;

  const artistName = attractions.length > 0
    ? (attractions[0].name as string)
    : null;

  let startsAt: string | null = null;
  if (startDate?.dateTime) {
    startsAt = startDate.dateTime as string;
  } else if (startDate?.localDate) {
    const time = (startDate.localTime as string) || "00:00:00";
    startsAt = `${startDate.localDate}T${time}`;
  }

  const saleInfo = sales?.public as Record<string, unknown> | undefined;
  const saleStatus = (dates?.status as Record<string, unknown>)?.code as string | undefined;

  if (saleStatus === "cancelled" || saleStatus === "postponed") return null;

  const offers: NormalizedOffer[] = [];
  for (const pr of priceRanges) {
    offers.push({
      price_amount: (pr.min as number) ?? null,
      price_currency: (pr.currency as string) || "GBP",
      price_type: pr.min !== undefined ? "from" : null,
      section: null,
      row_name: null,
      seat_quality: "unknown",
      is_adjacent: null,
      seller: "Ticketmaster",
      observed_at: new Date().toISOString(),
    });
  }

  const eventType: EventType =
    saleStatus === "offsale" && !saleInfo?.startDateTime
      ? "tour_announcement"
      : "concert";

  return {
    provider: "ticketmaster",
    provider_event_id: id,
    title: name,
    event_type: eventType,
    artist_name: artistName,
    inspired_artist: null,
    performer: artistName,
    venue_name: venue ? (venue.name as string) : null,
    venue_postcode: venue
      ? ((venue.postalCode as string) || null)
      : null,
    venue_city: venue
      ? ((venue.city as Record<string, unknown>)?.name as string) || null
      : null,
    starts_at: startsAt,
    timezone: (dates?.timezone as string) || "Europe/London",
    official_url: (tm.url as string) || null,
    image_url: images.length > 0 ? (images[0].url as string) : null,
    is_mock: false,
    source_payload: tm as Record<string, unknown>,
    observed_at: new Date().toISOString(),
    offers,
  };
}
