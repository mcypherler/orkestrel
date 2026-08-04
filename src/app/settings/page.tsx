"use client";

import { useEffect, useState } from "react";

interface User {
  userId: string;
  displayName: string;
  spotifyId: string;
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user);
        setLoading(false);
      });
  }, []);

  async function handleDisconnect() {
    if (!confirm("This will remove your Spotify connection and imported artists. Continue?")) {
      return;
    }
    setDisconnecting(true);
    await fetch("/api/auth/spotify/disconnect", { method: "POST" });
    setUser(null);
    setDisconnecting(false);
    window.location.href = "/settings";
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  if (loading) {
    return <div className="py-12 text-center text-muted">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted mt-1">
          Your event preferences and account connections.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <h2 className="font-medium">Event preferences</h2>
          <p className="text-sm text-muted">
            Configure your location, budget and seat preferences. Coming in Phase 3.
          </p>
          <div className="space-y-2 text-sm text-muted">
            <div className="flex justify-between">
              <span>Default profile</span>
              <span className="font-mono text-xs">BH14 / Bournemouth, Poole, London</span>
            </div>
            <div className="flex justify-between">
              <span>Price cap</span>
              <span className="font-mono text-xs">&pound;50 per person</span>
            </div>
            <div className="flex justify-between">
              <span>Tickets needed</span>
              <span className="font-mono text-xs">3</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <h2 className="font-medium">Connections</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div>
                <span>Spotify</span>
                {user && (
                  <span className="text-muted ml-2 text-xs">
                    ({user.displayName})
                  </span>
                )}
              </div>
              {user ? (
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-xs text-coral hover:underline disabled:opacity-50"
                >
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </button>
              ) : (
                <a
                  href="/api/auth/spotify"
                  className="text-xs text-accent hover:underline"
                >
                  Connect
                </a>
              )}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>WhatsApp</span>
              <span className="text-muted font-mono text-xs bg-surface-alt px-2 py-0.5 rounded">
                console mode
              </span>
            </div>
          </div>
        </div>
      </div>

      {user && (
        <div className="flex justify-end">
          <button
            onClick={handleLogout}
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
