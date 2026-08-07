"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { CardSkeleton, Skeleton, Spinner } from "@/components/loading";

interface EventOffer {
  price_amount: number | null;
  price_currency: string;
  price_type: string | null;
  seat_quality: string;
  seller: string | null;
}

interface AlertCandidate {
  id: string;
  alert_type: string;
  score: number;
  reasons: string[];
  warnings: string[];
  status: string;
  created_at: string;
  events: {
    id: string;
    title: string;
    event_type: string;
    artist_name: string | null;
    inspired_artist: string | null;
    venue_name: string | null;
    venue_city: string | null;
    starts_at: string | null;
    official_url: string | null;
    provider: string | null;
    observed_at: string | null;
    event_offers: EventOffer[];
  };
  message_deliveries: {
    id: string;
    provider: string;
    status: string;
    preview_text: string | null;
    sent_at: string | null;
  }[];
}

function formatPrice(offers: EventOffer[]): { label: string; type: "available" | "tbc" | "unavailable" } {
  if (!offers || offers.length === 0) return { label: "Price TBC", type: "tbc" };
  const priced = offers
    .filter((o) => o.price_amount != null)
    .sort((a, b) => (a.price_amount ?? 0) - (b.price_amount ?? 0));
  if (priced.length === 0) return { label: "Price TBC", type: "tbc" };
  const best = priced[0];
  const prefix = best.price_type === "from" ? "From " : "";
  return { label: `${prefix}£${best.price_amount!.toFixed(0)}`, type: "available" };
}

function ticketState(event: AlertCandidate["events"]): { label: string; action: "link" | "none"; color: string } {
  if (!event) return { label: "Event details unavailable", action: "none", color: "text-muted" };
  if (event.official_url) return { label: "Tickets", action: "link", color: "" };
  if (event.event_type === "tour_announcement") return { label: "Tickets not yet on sale", action: "none", color: "text-gold" };
  return { label: "Purchase link unavailable", action: "none", color: "text-muted" };
}

function getMonth(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<"all" | "original" | "tribute">("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");

  const fetchAlerts = useCallback(async () => {
    const res = await fetch("/api/alerts");
    if (res.ok) {
      const data = await res.json();
      setAlerts(data.alerts || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const a of alerts) {
      if (a.events?.venue_city) set.add(a.events.venue_city);
    }
    return Array.from(set).sort();
  }, [alerts]);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const a of alerts) {
      const m = getMonth(a.events?.starts_at);
      if (m) set.add(m);
    }
    return Array.from(set).sort((a, b) => {
      const da = new Date("1 " + a);
      const db = new Date("1 " + b);
      return da.getTime() - db.getTime();
    });
  }, [alerts]);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (typeFilter === "original" && (a.events?.event_type === "tribute_concert" || a.events?.event_type === "recurring_experience")) return false;
      if (typeFilter === "tribute" && a.events?.event_type !== "tribute_concert" && a.events?.event_type !== "recurring_experience") return false;
      if (cityFilter !== "all" && a.events?.venue_city !== cityFilter) return false;
      if (monthFilter !== "all" && getMonth(a.events?.starts_at) !== monthFilter) return false;
      return true;
    });
  }, [alerts, typeFilter, cityFilter, monthFilter]);

  async function handleMatch() {
    setMatching(true);
    setStatus(null);
    const res = await fetch("/api/alerts/match", { method: "POST" });
    const data = await res.json();
    const aiNote = data.aiMatched > 0 ? ` (${data.aiMatched} via AI)` : "";
    setStatus(
      `Matched ${data.matched}${aiNote}, rejected ${data.rejected}, watching ${data.watching}`
    );
    await fetchAlerts();
    setMatching(false);
  }

  async function handleSend() {
    setSending(true);
    setStatus(null);
    const res = await fetch("/api/alerts/send", { method: "POST" });
    const data = await res.json();
    let msg = `Sent ${data.sent}, previewed ${data.previewed}, failed ${data.failed}`;
    if (data.bigStory) {
      msg += ` · Big story: ${data.bigStory}`;
    }
    if (data.errors?.length > 0) {
      msg += ` — ${data.errors.join("; ")}`;
    }
    setStatus(msg);
    await fetchAlerts();
    setSending(false);
  }

  async function handleTestAlert() {
    setTesting(true);
    setStatus(null);
    const res = await fetch("/api/alerts/test", { method: "POST" });
    const data = await res.json();
    setStatus(
      data.success
        ? "Test alert sent — check WhatsApp"
        : `Test failed: ${data.error}`
    );
    setTesting(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const eligible = alerts.filter((a) => a.status === "eligible");
  const sent = alerts.filter((a) => a.status === "sent");
  const watching = alerts.filter((a) => a.status === "watching_for_dates");
  const activeFilters = (typeFilter !== "all" ? 1 : 0) + (cityFilter !== "all" ? 1 : 0) + (monthFilter !== "all" ? 1 : 0);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
            <p className="text-muted mt-1 text-sm">
              {alerts.length} total · {eligible.length} eligible · {sent.length} sent · {watching.length} watching
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleMatch}
              disabled={matching}
              className="text-sm bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {matching ? <><Spinner /> Matching...</> : "Run matching"}
            </button>
            <button
              onClick={handleSend}
              disabled={sending || eligible.length === 0}
              className="text-sm bg-surface border border-border px-3 py-1.5 rounded-lg hover:bg-surface-alt transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {sending ? <><Spinner /> Sending...</> : "Send alerts"}
            </button>
            <button
              onClick={handleTestAlert}
              disabled={testing}
              className="text-sm text-muted border border-border px-3 py-1.5 rounded-lg hover:bg-surface-alt transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {testing ? <><Spinner /> Testing...</> : "Test alert"}
            </button>
          </div>
        </div>
      </div>

      {status && (
        <div className="text-sm bg-surface-alt border border-border rounded-lg px-3 py-2 text-muted">
          {status}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-2">
            <FilterRow label="Type">
              <Pill active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>All</Pill>
              <Pill active={typeFilter === "original"} onClick={() => setTypeFilter("original")}>Original</Pill>
              <Pill active={typeFilter === "tribute"} onClick={() => setTypeFilter("tribute")}>Tribute</Pill>
            </FilterRow>

            {cities.length > 1 && (
              <FilterRow label="Location">
                <Pill active={cityFilter === "all"} onClick={() => setCityFilter("all")}>All</Pill>
                {cities.map((c) => (
                  <Pill key={c} active={cityFilter === c} onClick={() => setCityFilter(c)}>{c}</Pill>
                ))}
              </FilterRow>
            )}

            {months.length > 1 && (
              <FilterRow label="Month">
                <Pill active={monthFilter === "all"} onClick={() => setMonthFilter("all")}>All</Pill>
                {months.map((m) => (
                  <Pill key={m} active={monthFilter === m} onClick={() => setMonthFilter(m)}>{m}</Pill>
                ))}
              </FilterRow>
            )}
          </div>

          {activeFilters > 0 && (
            <p className="text-xs text-muted">
              Showing {filtered.length} of {alerts.length} alerts
              <button
                onClick={() => { setTypeFilter("all"); setCityFilter("all"); setMonthFilter("all"); }}
                className="ml-2 text-accent hover:text-accent-hover"
              >
                Clear filters
              </button>
            </p>
          )}
        </div>
      )}

      {alerts.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-muted">
            No alerts yet. Import events and run matching to generate candidates.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-muted">
            No alerts match your filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted font-mono uppercase tracking-wider mr-1 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded-full transition-colors ${
        active
          ? "bg-accent text-white"
          : "bg-surface-alt text-muted hover:text-foreground hover:bg-border"
      }`}
    >
      {children}
    </button>
  );
}

function AlertCard({ alert }: { alert: AlertCandidate }) {
  const [showPreview, setShowPreview] = useState(false);
  const event = alert.events;
  const delivery = alert.message_deliveries?.[0];

  const isTribute = event?.event_type === "tribute_concert" || event?.event_type === "recurring_experience";
  const price = formatPrice(event?.event_offers || []);
  const ticket = ticketState(event);

  const statusColors: Record<string, string> = {
    eligible: "bg-accent/10 text-accent",
    sent: "bg-success-light text-success",
    rejected: "bg-coral/10 text-coral",
    watching_for_dates: "bg-gold/20 text-gold",
  };

  const statusLabels: Record<string, string> = {
    eligible: "Eligible",
    sent: "Sent",
    rejected: "Rejected",
    watching_for_dates: "Watching",
  };

  let dateLabel = "Date TBA";
  if (event?.starts_at) {
    dateLabel = new Date(event.starts_at).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  const verifiedAgo = event?.observed_at
    ? formatTimeAgo(new Date(event.observed_at))
    : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
      {/* Row 1: Status badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-xs font-mono px-1.5 py-0.5 rounded ${
            statusColors[alert.status] || "bg-surface-alt text-muted"
          }`}
        >
          {statusLabels[alert.status] || alert.status}
        </span>
        {isTribute && (
          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-gold/20 text-gold">
            Tribute
          </span>
        )}
        <span className="text-xs text-muted font-mono">
          Score {alert.score}
        </span>
      </div>

      {/* Row 2: Title */}
      <h3 className="font-semibold text-base leading-snug">{event?.title || "Unknown event"}</h3>

      {/* Row 3: Price (large) */}
      <p className={`text-xl font-bold ${price.type === "available" ? "text-foreground" : "text-muted"}`}>
        {price.label}
      </p>

      {/* Row 4: Venue · Date · City */}
      <div className="text-sm text-muted space-y-0.5">
        <p>
          {event?.venue_name || "Venue TBA"}
          {event?.venue_city && ` · ${event.venue_city}`}
        </p>
        <p>{dateLabel}</p>
      </div>

      {/* Row 5: Match explanation */}
      {alert.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {alert.reasons.map((r, i) => (
            <span
              key={i}
              className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded"
            >
              {r}
            </span>
          ))}
        </div>
      )}

      {/* Row 6: Warnings */}
      {alert.warnings.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {alert.warnings.map((w, i) => (
            <span
              key={i}
              className="text-xs bg-gold/10 text-gold px-1.5 py-0.5 rounded"
            >
              {w}
            </span>
          ))}
        </div>
      )}

      {/* Row 7: Ticket action + trust metadata */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border">
        <div>
          {ticket.action === "link" && event?.official_url ? (
            <a
              href={event.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm bg-accent text-white px-4 py-1.5 rounded-lg hover:bg-accent-hover transition-colors font-medium"
            >
              Tickets →
            </a>
          ) : (
            <span className={`text-xs italic ${ticket.color}`}>{ticket.label}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          {event?.provider && (
            <span className="capitalize">{event.provider}</span>
          )}
          {verifiedAgo && (
            <span>Verified {verifiedAgo}</span>
          )}
        </div>
      </div>

      {/* Alert preview (expandable) */}
      {delivery?.preview_text && (
        <div>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            {showPreview ? "Hide preview" : "Show alert preview"}
          </button>
          {showPreview && (
            <div className="mt-2 text-sm bg-surface-alt rounded-lg p-3 space-y-1.5">
              {delivery.preview_text.split("\n").map((line, i) => (
                <p key={i} className={line === "" ? "h-2" : ""}>{line}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
