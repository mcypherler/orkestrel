"use client";

import { useEffect, useState, useCallback } from "react";

interface EventOffer {
  id: string;
  price_amount: number | null;
  price_currency: string;
  price_type: string | null;
  seat_quality: string;
  seller: string | null;
}

interface Event {
  id: string;
  title: string;
  event_type: string;
  artist_name: string | null;
  inspired_artist: string | null;
  performer: string | null;
  venue_name: string | null;
  venue_city: string | null;
  starts_at: string | null;
  official_url: string | null;
  is_mock: boolean;
  provider: string;
  observed_at: string;
  event_offers: EventOffer[];
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    const res = await fetch("/api/events");
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  async function handlePoll() {
    setPolling(true);
    setPollResult(null);
    const res = await fetch("/api/events/poll", { method: "POST" });
    const data = await res.json();
    const src = data.sources
      ? ` (TM: ${data.sources.ticketmaster}, mock: ${data.sources.mock})`
      : "";
    const tmNote = data.ticketmaster_configured === false
      ? " · TICKETMASTER_API_KEY not set!"
      : data.tm_error
        ? ` · TM error: ${data.tm_error}`
        : "";
    setPollResult(
      `Fetched ${data.total_fetched}${src}, created ${data.created}, updated ${data.updated}, duplicates ${data.duplicates}${tmNote}`
    );
    await fetchEvents();
    setPolling(false);
  }

  if (loading) {
    return <div className="py-12 text-center text-muted">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="text-muted mt-1">
            {events.length} event{events.length !== 1 ? "s" : ""} from
            Ticketmaster and fixtures.
          </p>
        </div>
        <button
          onClick={handlePoll}
          disabled={polling}
          className="text-sm bg-accent text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {polling ? "Polling..." : "Poll now"}
        </button>
      </div>

      {pollResult && (
        <div className="text-sm bg-surface-alt border border-border rounded-lg px-3 py-2 text-muted">
          {pollResult}
        </div>
      )}

      {events.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-muted">
            No events found yet. Click &quot;Poll now&quot; to fetch from
            configured sources.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: Event }) {
  const bestOffer = event.event_offers
    .filter((o) => o.price_amount != null)
    .sort((a, b) => (a.price_amount ?? 0) - (b.price_amount ?? 0))[0];

  const typeLabel = {
    concert: "Concert",
    tribute_concert: "Tribute",
    recurring_experience: "Experience",
    tour_announcement: "Announcement",
  }[event.event_type] || event.event_type;

  const dateStr = event.starts_at
    ? new Date(event.starts_at).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Date TBA";

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                event.event_type === "tribute_concert"
                  ? "bg-gold/20 text-gold"
                  : event.event_type === "tour_announcement"
                  ? "bg-accent/10 text-accent"
                  : event.event_type === "recurring_experience"
                  ? "bg-coral/10 text-coral"
                  : "bg-surface-alt text-muted"
              }`}
            >
              {typeLabel}
            </span>
            {event.is_mock && (
              <span className="text-xs font-mono bg-coral/10 text-coral px-1.5 py-0.5 rounded">
                Demo data
              </span>
            )}
            <span className="text-xs text-muted font-mono">{event.provider}</span>
          </div>

          <h3 className="font-medium">{event.title}</h3>

          {event.inspired_artist && (
            <p className="text-sm text-muted">
              {event.event_type === "tribute_concert"
                ? `${event.inspired_artist} tribute`
                : `Inspired by ${event.inspired_artist}`}
            </p>
          )}

          <p className="text-sm text-muted mt-1">
            {event.venue_name && `${event.venue_name}`}
            {event.venue_city && ` · ${event.venue_city}`}
            {" · "}
            {dateStr}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          {bestOffer ? (
            <div>
              <p className="text-sm font-medium">
                {bestOffer.price_type === "from" && "From "}
                &pound;{bestOffer.price_amount?.toFixed(2)}
              </p>
              <p className="text-xs text-muted">per person</p>
            </div>
          ) : (
            <p className="text-xs text-muted">Price not supplied</p>
          )}
        </div>
      </div>

      {event.official_url && (
        <div className="mt-2 pt-2 border-t border-border">
          <a
            href={event.official_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline"
          >
            View on source
          </a>
        </div>
      )}
    </div>
  );
}
