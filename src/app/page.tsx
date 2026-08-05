"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { StatCardSkeleton, Skeleton, Spinner } from "@/components/loading";

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
    event_offers: {
      price_amount: number | null;
      price_currency: string;
      price_type: string | null;
    }[];
  };
}

interface DashboardData {
  user: { userId: string; displayName: string; spotifyId: string } | null;
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
  const [manualName, setManualName] = useState("");
  const [creating, setCreating] = useState(false);

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

  async function handleManualStart(e: React.FormEvent) {
    e.preventDefault();
    if (!manualName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/auth/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: manualName.trim() }),
    });
    if (res.ok) {
      window.location.reload();
    }
    setCreating(false);
  }

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

  if (!data.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
        <Image
          src="/logo.png"
          alt="Orkestrel"
          width={64}
          height={64}
          className="dark:invert mb-4"
        />
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          Orkestrel
        </h1>
        <p className="text-muted max-w-md mb-8">
          Never miss the events you&apos;ll love. Orkestrel watches for events
          from your favourite artists and alerts you before tickets sell out.
        </p>

        <a
          href="/api/auth/spotify"
          className="inline-flex items-center gap-2 bg-accent text-white font-medium px-6 py-3 rounded-lg hover:bg-accent-hover transition-colors text-sm"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Connect with Spotify
        </a>
        <p className="text-xs text-muted mt-2 max-w-sm">
          Import your top artists automatically and get personalised event recommendations.
        </p>

        <div className="mt-8 pt-6 border-t border-border w-full max-w-sm">
          <p className="text-sm text-muted mb-3">
            Don&apos;t use Spotify? Add artists manually instead.
          </p>
          <form onSubmit={handleManualStart} className="flex gap-2">
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Your name"
              maxLength={50}
              className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <button
              type="submit"
              disabled={creating || !manualName.trim()}
              className="text-sm bg-surface border border-border px-4 py-2 rounded-lg hover:bg-surface-alt transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {creating ? <><Spinner size={14} /> Starting...</> : "Get started"}
            </button>
          </form>
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
          value={String(data.artistCount)}
          note="followed"
        />
        <StatCard
          label="Events"
          value={String(data.eventCount)}
          note={data.eventCount > 0 ? "discovered" : "Poll to fetch"}
        />
        <StatCard
          label="Matches"
          value={String(data.matchCount)}
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
