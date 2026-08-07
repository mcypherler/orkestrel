"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { StatCardSkeleton, Skeleton, Spinner } from "@/components/loading";

interface EventOffer {
  price_amount: number | null;
  price_currency: string;
  price_type: string | null;
}

interface FeaturedMatch {
  id: string;
  score: number;
  reasons: string[];
  warnings: string[];
  status?: string;
  created_at?: string;
  events: {
    title: string;
    artist_name: string | null;
    inspired_artist: string | null;
    venue_name: string | null;
    venue_city: string | null;
    starts_at: string | null;
    official_url: string | null;
    event_type: string;
    provider: string | null;
    event_offers: EventOffer[];
  };
}

function formatPrice(offers: EventOffer[]): string {
  if (!offers || offers.length === 0) return "Price TBC";
  const priced = offers
    .filter((o) => o.price_amount != null)
    .sort((a, b) => (a.price_amount ?? 0) - (b.price_amount ?? 0));
  if (priced.length === 0) return "Price TBC";
  const best = priced[0];
  const prefix = best.price_type === "from" ? "From " : "";
  return `${prefix}£${best.price_amount!.toFixed(0)}`;
}

interface DashboardData {
  user: { userId: string; displayName: string; spotifyId: string } | null;
  artistCount: number;
  eventCount: number;
  matchCount: number;
  sentCount: number;
  featured: FeaturedMatch[];
  bigStoryHeadline: string | null;
}

const HYPE_LINES = [
  "These guys are going to slay brah!",
  "This one's going to be absolutely massive!",
  "Don't sleep on this one!",
  "You're going to want to be there for this!",
  "This is the one. Lock it in!",
  "Absolute scenes incoming!",
  "Front row energy right here!",
];

function pickHype(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return HYPE_LINES[Math.abs(hash) % HYPE_LINES.length];
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days <= 0) return "Today!";
  if (days === 1) return "Tomorrow!";
  if (days <= 7) return `${days} days away`;
  if (days <= 14) return "Next week";
  return null;
}

export default function Home() {
  const [data, setData] = useState<DashboardData>({
    user: null,
    artistCount: 0,
    eventCount: 0,
    matchCount: 0,
    sentCount: 0,
    featured: [],
    bigStoryHeadline: null,
  });
  const [loading, setLoading] = useState(true);
  const [manualName, setManualName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function load() {
      const [userRes, artistsRes, eventsRes, alertsRes, bigStoryRes] = await Promise.all([
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
        fetch("/api/big-story")
          .then((r) => r.json())
          .catch(() => ({ bigStory: null, featured: [] })),
      ]);

      const alerts = alertsRes.alerts || [];
      const featured = (bigStoryRes.featured || []) as FeaturedMatch[];

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
        featured,
        bigStoryHeadline: bigStoryRes.bigStory?.headline || null,
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
        <Skeleton className="h-48 w-full rounded-xl" />
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

  const bigStory = data.featured[0] || null;
  const otherMatches = data.featured.slice(1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          What&apos;s hot, {data.user.displayName.split(" ")[0]}
        </h1>
        <p className="text-muted mt-1">
          Your personalised event radar — updated daily at 7am
        </p>
      </div>

      {bigStory ? (
        <BigStoryCard match={bigStory} totalMatches={data.matchCount} headline={data.bigStoryHeadline} />
      ) : (
        <div className="rounded-xl border-2 border-dashed border-border bg-surface p-8 text-center">
          <p className="text-lg font-medium mb-1">No matches yet</p>
          <p className="text-muted text-sm">
            Import your artists and poll for events — Orkestrel will find your next big night out
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat
          value={String(data.artistCount)}
          label="artists tracked"
          icon="🎤"
        />
        <MiniStat
          value={String(data.eventCount)}
          label="events scanned"
          icon="🔍"
        />
        <MiniStat
          value={String(data.matchCount)}
          label="matches found"
          icon="🎯"
        />
        <MiniStat
          value={String(data.sentCount)}
          label="alerts fired"
          icon="📲"
        />
      </div>

      {otherMatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Also on the radar</h2>
            <Link
              href="/alerts"
              className="text-xs text-accent hover:text-accent-hover transition-colors"
            >
              See all matches →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {otherMatches.map((match) => (
              <CompactMatchCard key={match.id} match={match} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Your setup">
          <ChecklistItem
            done={!!data.user.spotifyId}
            label="Connect Spotify"
            subtext={data.user.spotifyId ? "Synced" : "Import your top artists"}
          />
          <ChecklistItem
            done={data.artistCount > 0}
            label="Artists loaded"
            subtext={data.artistCount > 0 ? `${data.artistCount} tracked` : "Sync or add manually"}
          />
          <ChecklistItem
            done={data.eventCount > 0}
            label="Events polled"
            subtext={data.eventCount > 0 ? `${data.eventCount} scanned` : "Run first poll"}
          />
          <ChecklistItem
            done={data.matchCount > 0}
            label="Matches found"
            subtext={data.matchCount > 0 ? `${data.matchCount} matches` : "Run matching"}
          />
          <ChecklistItem
            done={data.sentCount > 0}
            label="Alerts flowing"
            subtext={data.sentCount > 0 ? "WhatsApp connected" : "Send your first alert"}
          />
        </Section>

        <Section title="Jump to">
          <div className="space-y-1">
            <QuickLink href="/artists" label="My artists" count={data.artistCount} />
            <QuickLink href="/events" label="Events" count={data.eventCount} />
            <QuickLink href="/alerts" label="All matches" count={data.matchCount} />
            <QuickLink href="/settings" label="Preferences" />
          </div>
        </Section>
      </div>
    </div>
  );
}

function BigStoryCard({ match, totalMatches, headline }: { match: FeaturedMatch; totalMatches: number; headline: string | null }) {
  const event = match.events;
  const priceLabel = formatPrice(event.event_offers || []);

  let dateLabel = "Date TBA";
  if (event.starts_at) {
    const d = new Date(event.starts_at);
    dateLabel = d.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  const days = daysUntil(event.starts_at);
  const urgency = urgencyLabel(days);
  const hype = pickHype(match.id);
  const isTribute = event.event_type === "tribute_concert" || event.event_type === "recurring_experience";

  return (
    <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-[#1a1a22] via-[#2a2535] to-[#1a1a22] dark:from-[#0d0c12] dark:via-[#1a1725] dark:to-[#0d0c12]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(196,151,59,0.15),transparent_60%)]" />
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold to-transparent" />
      <div className="relative p-6 sm:p-8 text-white">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-mono uppercase tracking-widest text-gold">
            Big story of the day
          </span>
          {urgency && (
            <span className="text-xs font-bold bg-gold/20 text-gold px-2 py-0.5 rounded-full">
              {urgency}
            </span>
          )}
          {isTribute && (
            <span className="text-xs font-mono bg-white/10 text-white/70 px-2 py-0.5 rounded-full">
              Tribute
            </span>
          )}
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">
          {event.title}
        </h2>

        <p className="text-2xl font-bold text-gold mt-2 mb-3">
          {priceLabel}
        </p>

        <p className="text-white/70 text-sm sm:text-base mb-4">
          {event.venue_name || "Venue TBA"}
          {event.venue_city && ` · ${event.venue_city}`}
          {" · "}
          {dateLabel}
        </p>

        <p className="text-base sm:text-lg font-medium italic mb-5 text-white/60">
          &ldquo;{headline || hype}&rdquo;
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-5">
          {match.reasons.slice(0, 2).map((r, i) => (
            <span key={i} className="text-xs bg-white/10 text-white/80 px-2 py-1 rounded-lg">
              {r}
            </span>
          ))}
          <span className="text-xs bg-white/10 text-white/60 px-2 py-1 rounded-lg">
            Score {match.score}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {event.official_url ? (
            <a
              href={event.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-gold text-[#1a1a22] font-semibold text-sm px-5 py-2.5 rounded-lg hover:brightness-110 transition-all"
            >
              Lock in tickets →
            </a>
          ) : (
            <span className="text-sm text-white/50 italic">
              Purchase link unavailable
            </span>
          )}
          {totalMatches > 1 && (
            <Link
              href="/alerts"
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              +{totalMatches - 1} more match{totalMatches - 1 === 1 ? "" : "es"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function CompactMatchCard({ match }: { match: FeaturedMatch }) {
  const event = match.events;
  const priceLabel = formatPrice(event.event_offers || []);

  let dateLabel = "Date TBA";
  if (event.starts_at) {
    dateLabel = new Date(event.starts_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  }

  const days = daysUntil(event.starts_at);
  const urgency = urgencyLabel(days);
  const isTribute = event.event_type === "tribute_concert" || event.event_type === "recurring_experience";

  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-2 hover:border-accent/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            {urgency && (
              <span className="text-xs font-bold text-coral">{urgency}</span>
            )}
            {isTribute && (
              <span className="text-xs font-mono text-gold">Tribute</span>
            )}
          </div>
          <h3 className="font-medium truncate">{event.title}</h3>
          <p className="text-lg font-bold mt-0.5">{priceLabel}</p>
          <p className="text-sm text-muted truncate">
            {event.venue_name || "Venue TBA"}
            {event.venue_city && ` · ${event.venue_city}`}
            {" · "}
            {dateLabel}
          </p>
        </div>
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
      {event.official_url ? (
        <a
          href={event.official_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-accent hover:text-accent-hover transition-colors"
        >
          Get tickets →
        </a>
      ) : (
        <span className="text-xs text-muted italic">Purchase link unavailable</span>
      )}
    </div>
  );
}

function MiniStat({ value, label, icon }: { value: string; label: string; icon: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-center">
      <span className="text-lg">{icon}</span>
      <p className="text-xl font-bold mt-0.5">{value}</p>
      <p className="text-xs text-muted">{label}</p>
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

function ChecklistItem({ done, label, subtext }: { done: boolean; label: string; subtext?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${
          done ? "bg-accent border-accent text-white" : "border-border"
        }`}
      >
        {done && "✓"}
      </span>
      <div className="min-w-0">
        <span className={done ? "text-muted" : ""}>{label}</span>
        {subtext && (
          <span className="text-xs text-muted ml-1.5">· {subtext}</span>
        )}
      </div>
    </div>
  );
}

function QuickLink({ href, label, count }: { href: string; label: string; count?: number }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between text-sm text-accent hover:text-accent-hover py-1.5 transition-colors"
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className="text-xs text-muted font-mono">{count}</span>
      )}
    </Link>
  );
}
