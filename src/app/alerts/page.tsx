"use client";

import { useEffect, useState, useCallback } from "react";

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
    is_mock: boolean;
  };
  message_deliveries: {
    id: string;
    provider: string;
    status: string;
    preview_text: string | null;
    sent_at: string | null;
  }[];
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

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

  async function handleMatch() {
    setMatching(true);
    setStatus(null);
    const res = await fetch("/api/alerts/match", { method: "POST" });
    const data = await res.json();
    setStatus(
      `Matched ${data.matched}, rejected ${data.rejected}, watching ${data.watching}`
    );
    await fetchAlerts();
    setMatching(false);
  }

  async function handleSend() {
    setSending(true);
    setStatus(null);
    const res = await fetch("/api/alerts/send", { method: "POST" });
    const data = await res.json();
    setStatus(
      `Sent ${data.sent}, previewed ${data.previewed}, failed ${data.failed}`
    );
    await fetchAlerts();
    setSending(false);
  }

  if (loading) {
    return <div className="py-12 text-center text-muted">Loading...</div>;
  }

  const eligible = alerts.filter((a) => a.status === "eligible");
  const sent = alerts.filter((a) => a.status === "sent");
  const watching = alerts.filter((a) => a.status === "watching_for_dates");
  const rejected = alerts.filter((a) => a.status === "rejected");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="text-muted mt-1">
            {alerts.length} total · {eligible.length} eligible · {sent.length}{" "}
            sent · {watching.length} watching
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleMatch}
            disabled={matching}
            className="text-sm bg-accent text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {matching ? "Matching..." : "Run matching"}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || eligible.length === 0}
            className="text-sm bg-surface border border-border px-3 py-1.5 rounded-lg hover:bg-surface-alt transition-colors disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send alerts"}
          </button>
        </div>
      </div>

      {status && (
        <div className="text-sm bg-surface-alt border border-border rounded-lg px-3 py-2 text-muted">
          {status}
        </div>
      )}

      {alerts.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-muted">
            No alerts yet. Import events and run matching to generate candidates.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert }: { alert: AlertCandidate }) {
  const [showPreview, setShowPreview] = useState(false);
  const event = alert.events;
  const delivery = alert.message_deliveries[0];

  const statusColors: Record<string, string> = {
    eligible: "bg-accent/10 text-accent",
    sent: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    rejected: "bg-coral/10 text-coral",
    watching_for_dates: "bg-gold/20 text-gold",
  };

  const statusLabels: Record<string, string> = {
    eligible: "Eligible",
    sent: "Sent",
    rejected: "Rejected",
    watching_for_dates: "Watching",
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                statusColors[alert.status] || "bg-surface-alt text-muted"
              }`}
            >
              {statusLabels[alert.status] || alert.status}
            </span>
            <span className="text-xs text-muted font-mono">
              Score {alert.score}
            </span>
            {event?.is_mock && (
              <span className="text-xs font-mono bg-coral/10 text-coral px-1.5 py-0.5 rounded">
                Demo
              </span>
            )}
          </div>
          <h3 className="font-medium">{event?.title || "Unknown event"}</h3>
          <p className="text-sm text-muted">
            {event?.venue_name}
            {event?.venue_city && ` · ${event.venue_city}`}
          </p>
        </div>
      </div>

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

      {delivery?.preview_text && (
        <div>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
          {showPreview && (
            <pre className="mt-2 text-xs bg-surface-alt rounded-lg p-3 whitespace-pre-wrap font-mono overflow-x-auto">
              {delivery.preview_text}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
