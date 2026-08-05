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
  southampton: { lat: 50.9097, lng: -1.4044 },
  winchester: { lat: 51.0632, lng: -1.3080 },
  salisbury: { lat: 51.0688, lng: -1.7945 },
  brighton: { lat: 50.8225, lng: -0.1372 },
  portsmouth: { lat: 50.8198, lng: -1.0880 },
  bath: { lat: 51.3811, lng: -2.3590 },
  bristol: { lat: 51.4545, lng: -2.5879 },
  exeter: { lat: 50.7236, lng: -3.5275 },
  cardiff: { lat: 51.4816, lng: -3.1791 },
  manchester: { lat: 53.4808, lng: -2.2426 },
  birmingham: { lat: 52.4862, lng: -1.8904 },
  leeds: { lat: 53.8008, lng: -1.5491 },
  liverpool: { lat: 53.4084, lng: -2.9916 },
  newcastle: { lat: 54.9783, lng: -1.6178 },
  sheffield: { lat: 53.3811, lng: -1.4701 },
  nottingham: { lat: 52.9548, lng: -1.1581 },
  edinburgh: { lat: 55.9533, lng: -3.1883 },
  glasgow: { lat: 55.8642, lng: -4.2518 },
  oxford: { lat: 51.7520, lng: -1.2577 },
  cambridge: { lat: 52.2053, lng: 0.1218 },
  reading: { lat: 51.4543, lng: -0.9781 },
  guildford: { lat: 51.2362, lng: -0.5704 },
  dorchester: { lat: 50.7155, lng: -2.4384 },
  plymouth: { lat: 50.3755, lng: -4.1427 },
  swindon: { lat: 51.5558, lng: -1.7797 },
  york: { lat: 53.9600, lng: -1.0873 },
  coventry: { lat: 52.4068, lng: -1.5197 },
  norwich: { lat: 52.6309, lng: 1.2974 },
  ipswich: { lat: 52.0567, lng: 1.1482 },
  aberdeen: { lat: 57.1497, lng: -2.0943 },
  belfast: { lat: 54.5973, lng: -5.9301 },
  swansea: { lat: 51.6214, lng: -3.9436 },
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
): Promise<{ events: NormalizedEvent[]; errors: string[] }> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) throw new Error("TICKETMASTER_API_KEY not set");

  const events: NormalizedEvent[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  for (const city of cities) {
    const geo = CITY_GEOPOINTS[city.toLowerCase()];
    if (!geo) {
      errors.push(`No geopoint for city: ${city}`);
      continue;
    }

    const geoPoint = toGeohash(geo.lat, geo.lng);

    const perCitySize = Math.min(
      Math.max(Math.floor(200 / cities.length), 20),
      100
    );

    const params = new URLSearchParams({
      apikey: apiKey,
      countryCode: "GB",
      classificationName: "music",
      geoPoint,
      radius: String(radiusMiles),
      unit: "miles",
      startDateTime: now,
      sort: "relevance,desc",
      size: String(perCitySize),
    });

    if (artistNames && artistNames.length > 0) {
      params.set("keyword", artistNames.slice(0, 5).join(" OR "));
    }

    try {
      const url = `${API_BASE}/events.json?${params}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (res.status === 429) {
        errors.push(`${city}: rate limited`);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        errors.push(`${city}: HTTP ${res.status} - ${body.slice(0, 200)}`);
        continue;
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
      errors.push(`${city}: ${String(err)}`);
    }
  }

  return { events, errors };
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
    source_payload: tm as Record<string, unknown>,
    observed_at: new Date().toISOString(),
    offers,
  };
}
