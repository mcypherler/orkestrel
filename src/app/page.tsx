"use client";

import { useEffect, useState } from "react";

interface DashboardData {
  user: { userId: string; displayName: string } | null;
  artistCount: number;
  eventCount: number;
  matchCount: number;
  sentCount: number;
}

export default function Home() {
  const [data, setData] = useState<DashboardData>({
    user: null,
    artistCount: 0,
    eventCount: 0,
    matchCount: 0,
    sentCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [userRes, artistsRes, eventsRes, alertsRes] = await Promise.all([
        fetch("/api/auth/me").then((r) => r.json()),
        fetch("/api/artists").then((r) => r.json()).catch(() => ({ artists: [] })),
        fetch("/api/events").then((r) => r.json()).catch(() => ({ events: [] })),
        fetch("/api/alerts").then((r) => r.json()).catch(() => ({ alerts: [] })),
      ]);

      const alerts = alertsRes.alerts || [];
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
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <div className="py-12 text-center text-muted">Loading...</div>;
  }

  const whatsappProvider = "console";
  const alertsEnabled = false;

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
          note={whatsappProvider === "console" ? "console mode" : "via WhatsApp"}
        />
      </div>

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
            done={alertsEnabled}
            label="Enable WhatsApp alerts"
          />
        </Section>

        <Section title="Quick actions">
          {!data.user ? (
            <a
              href="/api/auth/spotify"
              className="block text-sm text-accent hover:underline py-1"
            >
              Connect Spotify to get started
            </a>
          ) : (
            <div className="space-y-1">
              <a
                href="/artists"
                className="block text-sm text-accent hover:underline py-1"
              >
                Manage your artists ({data.artistCount})
              </a>
              <a
                href="/events"
                className="block text-sm text-accent hover:underline py-1"
              >
                View events ({data.eventCount})
              </a>
              <a
                href="/alerts"
                className="block text-sm text-accent hover:underline py-1"
              >
                Review alerts ({data.matchCount})
              </a>
              <a
                href="/settings"
                className="block text-sm text-accent hover:underline py-1"
              >
                Update preferences
              </a>
            </div>
          )}
        </Section>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <div className="w-1 h-full min-h-[2rem] rounded bg-gold flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium mb-1">System status</p>
            <p className="text-muted">
              WhatsApp: <Tag>{whatsappProvider}</Tag>{" "}
              Alerts: <Tag>{alertsEnabled ? "enabled" : "disabled"}</Tag>{" "}
              Sources: <Tag>hybrid</Tag>{" "}
              Mock data: <Tag>enabled</Tag>
            </p>
          </div>
        </div>
      </div>
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

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-surface-alt text-muted font-mono text-xs px-1.5 py-0.5 rounded">
      {children}
    </span>
  );
}
