"use client";

import { useEffect, useState } from "react";

interface User {
  userId: string;
  displayName: string;
  spotifyId: string;
}

interface Preferences {
  home_postcode: string | null;
  preferred_cities: string[];
  max_price_gbp: number | null;
  ticket_count: number;
  max_radius_miles: number | null;
  reject_restricted_view: boolean;
  allow_tributes: boolean;
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [newCity, setNewCity] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/preferences").then((r) => r.json()).catch(() => ({ preferences: null })),
    ]).then(([userData, prefsData]) => {
      setUser(userData.user);
      setPrefs(prefsData.preferences);
      setLoading(false);
    });
  }, []);

  async function savePrefs(updates: Partial<Preferences>) {
    setSaving(true);
    const newPrefs = { ...prefs, ...updates } as Preferences;
    setPrefs(newPrefs);
    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setSaving(false);
  }

  function addCity() {
    if (!newCity.trim() || !prefs) return;
    const cities = [...prefs.preferred_cities, newCity.trim()];
    setNewCity("");
    savePrefs({ preferred_cities: cities });
  }

  function removeCity(city: string) {
    if (!prefs) return;
    savePrefs({
      preferred_cities: prefs.preferred_cities.filter((c) => c !== city),
    });
  }

  async function handleDisconnect() {
    if (
      !confirm(
        "This will remove your Spotify connection and imported artists. Continue?"
      )
    )
      return;
    setDisconnecting(true);
    await fetch("/api/auth/spotify/disconnect", { method: "POST" });
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
        {prefs && (
          <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Event preferences</h2>
              {saving && (
                <span className="text-xs text-muted">Saving...</span>
              )}
            </div>

            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-muted">Home postcode</span>
                <input
                  type="text"
                  value={prefs.home_postcode || ""}
                  onChange={(e) =>
                    savePrefs({ home_postcode: e.target.value || null })
                  }
                  className="mt-1 block w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder="BH14"
                />
              </label>

              <div className="text-sm">
                <span className="text-muted">Preferred cities</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {prefs.preferred_cities.map((city) => (
                    <span
                      key={city}
                      className="inline-flex items-center gap-1 bg-surface-alt text-sm px-2 py-0.5 rounded"
                    >
                      {city}
                      <button
                        onClick={() => removeCity(city)}
                        className="text-muted hover:text-coral text-xs ml-0.5"
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  <input
                    type="text"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCity()}
                    placeholder="Add city..."
                    className="flex-1 text-sm border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                  <button
                    onClick={addCity}
                    className="text-xs px-2 py-1 border border-border rounded hover:bg-surface-alt"
                  >
                    Add
                  </button>
                </div>
              </div>

              <label className="block text-sm">
                <span className="text-muted">Max price per person (&pound;)</span>
                <input
                  type="number"
                  value={prefs.max_price_gbp ?? ""}
                  onChange={(e) =>
                    savePrefs({
                      max_price_gbp: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  className="mt-1 block w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder="50"
                />
              </label>

              <label className="block text-sm">
                <span className="text-muted">Tickets needed</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={prefs.ticket_count}
                  onChange={(e) =>
                    savePrefs({ ticket_count: Number(e.target.value) || 1 })
                  }
                  className="mt-1 block w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.reject_restricted_view}
                  onChange={(e) =>
                    savePrefs({ reject_restricted_view: e.target.checked })
                  }
                  className="rounded"
                />
                <span>Reject restricted/obstructed views</span>
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.allow_tributes}
                  onChange={(e) =>
                    savePrefs({ allow_tributes: e.target.checked })
                  }
                  className="rounded"
                />
                <span>Include tribute acts and inspired experiences</span>
              </label>
            </div>
          </div>
        )}

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
