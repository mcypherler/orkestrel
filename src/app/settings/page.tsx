"use client";

import { useEffect, useState } from "react";
import { Skeleton, Spinner } from "@/components/loading";

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
  const [saved, setSaved] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [newCity, setNewCity] = useState("");

  const [formPostcode, setFormPostcode] = useState("");
  const [formMaxPrice, setFormMaxPrice] = useState("");
  const [formTicketCount, setFormTicketCount] = useState("2");
  const [formCities, setFormCities] = useState<string[]>([]);
  const [formRejectRestricted, setFormRejectRestricted] = useState(false);
  const [formAllowTributes, setFormAllowTributes] = useState(false);

  const dirty =
    prefs != null &&
    (formPostcode !== (prefs.home_postcode || "") ||
      formMaxPrice !== (prefs.max_price_gbp != null ? String(prefs.max_price_gbp) : "") ||
      formTicketCount !== String(prefs.ticket_count) ||
      JSON.stringify(formCities) !== JSON.stringify(prefs.preferred_cities) ||
      formRejectRestricted !== prefs.reject_restricted_view ||
      formAllowTributes !== prefs.allow_tributes);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/preferences")
        .then((r) => r.json())
        .catch(() => ({ preferences: null })),
    ]).then(([userData, prefsData]) => {
      setUser(userData.user);
      const p = prefsData.preferences;
      setPrefs(p);
      if (p) {
        setFormPostcode(p.home_postcode || "");
        setFormMaxPrice(p.max_price_gbp != null ? String(p.max_price_gbp) : "");
        setFormTicketCount(String(p.ticket_count));
        setFormCities(p.preferred_cities || []);
        setFormRejectRestricted(p.reject_restricted_view);
        setFormAllowTributes(p.allow_tributes);
      }
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const updates: Partial<Preferences> = {
      home_postcode: formPostcode || null,
      max_price_gbp: formMaxPrice ? Number(formMaxPrice) : null,
      ticket_count: Number(formTicketCount) || 1,
      preferred_cities: formCities,
      reject_restricted_view: formRejectRestricted,
      allow_tributes: formAllowTributes,
    };
    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setPrefs({ ...prefs, ...updates } as Preferences);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addCity() {
    if (!newCity.trim()) return;
    if (!formCities.includes(newCity.trim())) {
      setFormCities([...formCities, newCity.trim()]);
    }
    setNewCity("");
  }

  function removeCity(city: string) {
    setFormCities(formCities.filter((c) => c !== city));
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
    return (
      <div className="space-y-6">
        <Skeleton className="h-7 w-28" />
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
    );
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
            <h2 className="font-medium">Event preferences</h2>

            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-muted">Home postcode</span>
                <input
                  type="text"
                  value={formPostcode}
                  onChange={(e) => setFormPostcode(e.target.value)}
                  className="mt-1 block w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder="BH14"
                />
              </label>

              <div className="text-sm">
                <span className="text-muted">Preferred cities</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {formCities.map((city) => (
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
                  value={formMaxPrice}
                  onChange={(e) => setFormMaxPrice(e.target.value)}
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
                  value={formTicketCount}
                  onChange={(e) => setFormTicketCount(e.target.value)}
                  className="mt-1 block w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={formRejectRestricted}
                  onChange={(e) => setFormRejectRestricted(e.target.checked)}
                  className="rounded"
                />
                <span>Reject restricted/obstructed views</span>
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={formAllowTributes}
                  onChange={(e) => setFormAllowTributes(e.target.checked)}
                  className="rounded"
                />
                <span>Include tribute acts and inspired experiences</span>
              </label>

              <div className="pt-2 flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="text-sm bg-accent text-white px-4 py-2 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <Spinner size={14} /> Saving...
                    </>
                  ) : (
                    "Save preferences"
                  )}
                </button>
                {saved && (
                  <span className="text-sm text-success">Saved</span>
                )}
                {dirty && !saving && (
                  <span className="text-xs text-muted">Unsaved changes</span>
                )}
              </div>
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
