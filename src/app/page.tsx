"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatCardSkeleton, Skeleton } from "@/components/loading";

interface FeaturedMatch {
  id: string;
  score: number;
  reasons: string[];
  events: {
    title: string;
    artist_name: string | null;
    venue_name: string | null;
    venue_city: string | null;
    starts_at: string | null;
    official_url: string | null;
    event_type: string;
    is_mock: boolean;
    event_offers: {
      price_amount: number | null;
      price_currency: string;
      price_type: string | null;
    }[];
  };
}

interface DashboardData {
  user: { userId: string; displayName: string } | null;
  artistCount: number;
  eventCount: number;
  matchCount: number;
  sentCount: number;
  featured: FeaturedMatch[];
}

export default function Home() {
  const [data, setData] = useState<DashboardData>({
    user: null,
    artistCount: 0,
    eventCount: 0,
    matchCount: 0,
    sentCount: 0,
    featured: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [userRes, artistsRes, eventsRes, alertsRes] = await Promise.all([
        fetch("/api/auth/me").then((r) => r.json()),
        fetch("/api/artists")
          .then((r) => r.json())
          .catch(() => ({ artists: [] })),
        fetch("/api/events")
          .then((r) => r.json())
          .catch(() => ({ events: [] })),
        fetch("/api/alerts")
          .then((r) => r.json())
          .catch(() => ({ alerts: [] })),
      ]);

      const alerts = alertsRes.alerts || [];
      const eligible = alerts
        .filter(
          (a: FeaturedMatch & { status: string }) =>
            (a.status === "eligible" || a.status === "sent") && a.events
        )
        .sort((a: FeaturedMatch, b: FeaturedMatch) => {
          const dateA = a.events.starts_at
            ? new Date(a.events.starts_at).getTime()
            : Infinity;
          const dateB = b.events.starts_at
            ? new Date(b.events.starts_at).getTime()
            : Infinity;
          if (dateA !== dateB) return dateA - dateB;
          return b.score - a.score;
        });

      setData({
        user: userRes.user,
        artistCount: (artistsRes.artists || []).length,
        eventCount: (eventsRes.events || []).length,
        matchCount: alerts.filter(
          (a: { status: string }) =>
            a.status === "eligible" || a.status === "sent"
        ).length,
        sentCount: alerts.filter(
          (a: { status: string }) => a.status === "sent"
        ).length,
        featured: eligible.slice(0, 2),
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted mt-1">
          Never miss the events you&apos;ll love.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Artists"
          value={data.user ? String(data.artistCount) : "--"}
          note={data.user ? "followed" : "Connect Spotify to import"}
        />
        <StatCard
          label="Events"
          value={data.user ? String(data.eventCount) : "--"}
          note={data.eventCount > 0 ? "discovered" : "Poll to fetch"}
        />
        <StatCard
          label="Matches"
          value={data.user ? String(data.matchCount) : "--"}
          note={data.matchCount > 0 ? "eligible or sent" : "Run matching"}
        />
        <StatCard
          label="Alerts sent"
          value={String(data.sentCount)}
          note={data.sentCount > 0 ? "via WhatsApp" : "none yet"}
        />
      </div>

      {data.featured.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium">Upcoming matches</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.featured.map((match) => (
              <FeaturedCard key={match.id} match={match} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Getting started">
          <ChecklistItem
            done={!!data.user}
            label="Connect your Spotify account"
          />
          <ChecklistItem
            done={!!data.user}
            label="Set your event preferences"
          />
          <ChecklistItem
            done={data.eventCount > 0}
            label="Run first event poll"
          />
          <ChecklistItem
            done={data.matchCount > 0}
            label="Review alert previews"
          />
          <ChecklistItem
            done={data.sentCount > 0}
            label="Send your first alert"
          />
        </Section>

        <Section title="Quick actions">
          {!data.user ? (
            <a
              href="/api/auth/spotify"
              className="block text-sm text-accent hover:text-accent-hover py-1"
            >
              Connect Spotify to get started
            </a>
          ) : (
            <div className="space-y-1">
              <Link
                href="/artists"
                className="block text-sm text-accent hover:text-accent-hover py-1"
              >
                Manage your artists ({data.artistCount})
              </Link>
              <Link
                href="/events"
                className="block text-sm text-accent hover:text-accent-hover py-1"
              >
                View events ({data.eventCount})
              </Link>
              <Link
                href="/alerts"
                className="block text-sm text-accent hover:text-accent-hover py-1"
              >
                Review alerts ({data.matchCount})
              </Link>
              <Link
                href="/settings"
                className="block text-sm text-accent hover:text-accent-hover py-1"
              >
                Update preferences
              </Link>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function FeaturedCard({ match }: { match: FeaturedMatch }) {
  const event = match.events;
  const offers = event.event_offers || [];
  const priced = offers
    .filter((o) => o.price_amount != null)
    .sort((a, b) => (a.price_amount ?? 0) - (b.price_amount ?? 0));

  let priceLabel = "Price not yet available";
  if (priced.length > 0) {
    const best = priced[0];
    const prefix = best.price_type === "from" ? "From " : "";
    priceLabel = `${prefix}£${best.price_amount!.toFixed(2)}`;
  }

  let dateLabel = "Date TBA";
  if (event.starts_at) {
    const d = new Date(event.starts_at);
    dateLabel = d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="rounded-lg border border-accent/30 bg-surface p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium truncate">{event.title}</h3>
          <p className="text-sm text-muted truncate">
            {event.venue_name}
            {event.venue_city && ` · ${event.venue_city}`}
          </p>
        </div>
        {event.is_mock && (
          <span className="text-xs font-mono bg-coral/10 text-coral px-1.5 py-0.5 rounded flex-shrink-0">
            Demo
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">{dateLabel}</span>
        <span className="text-foreground font-medium">{priceLabel}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {match.reasons.slice(0, 2).map((r, i) => (
          <span
            key={i}
            className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded"
          >
            {r}
          </span>
        ))}
      </div>
      {event.official_url && (
        <a
          href={event.official_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-accent hover:text-accent-hover transition-colors"
        >
          View tickets
        </a>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted font-mono uppercase tracking-wider">
        {label}
      </p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      <p className="text-xs text-muted mt-1">{note}</p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="font-medium mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${
          done ? "bg-accent border-accent text-white" : "border-border"
        }`}
      >
        {done && "✓"}
      </span>
      <span className={done ? "text-muted line-through" : ""}>{label}</span>
    </div>
  );
}
