"use client";

import { useEffect, useState, useCallback } from "react";
import { CardSkeleton, Skeleton, Spinner } from "@/components/loading";

interface Artist {
  id: string;
  source: string;
  relationship: string;
  spotify_score: number | null;
  artists: {
    id: string;
    name: string;
    spotify_id: string | null;
    image_url: string | null;
  };
}

interface User {
  userId: string;
  displayName: string;
  spotifyId: string;
}

export default function ArtistsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [newArtist, setNewArtist] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchData = useCallback(async () => {
    const [userRes, artistRes] = await Promise.all([
      fetch("/api/auth/me"),
      fetch("/api/artists"),
    ]);

    const userData = await userRes.json();
    setUser(userData.user);

    if (artistRes.ok) {
      const artistData = await artistRes.json();
      setArtists(artistData.artists || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    const res = await fetch("/api/artists/sync", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      const parts = [`Imported ${data.imported}`];
      if (data.filtered > 0) parts.push(`${data.filtered} below threshold`);
      if (data.skipped > 0) parts.push(`${data.skipped} skipped`);
      setSyncResult(parts.join(" · "));
    }
    await fetchData();
    setSyncing(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newArtist.trim()) return;

    setAdding(true);
    await fetch("/api/artists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newArtist.trim() }),
    });
    setNewArtist("");
    await fetchData();
    setAdding(false);
  }

  async function handleRelationship(id: string, relationship: string) {
    await fetch(`/api/artists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relationship }),
    });
    await fetchData();
  }

  if (loading) {
    return (
      <div className="space-y-6"><Skeleton className="h-7 w-24" /><Skeleton className="h-4 w-40 mt-2" /><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Artists</h1>
          <p className="text-muted mt-1">
            Your followed artists from Spotify and manual additions.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-muted mb-4">
            Connect your Spotify account to import your favourite artists.
          </p>
          <a
            href="/api/auth/spotify"
            className="inline-block bg-accent text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Connect Spotify
          </a>
        </div>
      </div>
    );
  }

  const pinned = artists.filter((a) => a.relationship === "pin");
  const followed = artists.filter((a) => a.relationship === "follow");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Artists</h1>
          <p className="text-muted mt-1">
            {artists.length} artist{artists.length !== 1 ? "s" : ""} followed
            {" · "}
            <span className="text-sm">
              Signed in as {user.displayName}
            </span>
          </p>
        </div>
        {user.spotifyId ? (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-sm bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {syncing ? <><Spinner size={14} /> Syncing...</> : "Sync Spotify"}
          </button>
        ) : (
          <a
            href="/api/auth/spotify"
            className="text-sm bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors inline-flex items-center gap-1.5"
          >
            Connect Spotify
          </a>
        )}
      </div>

      {syncResult && (
        <div className="text-sm bg-surface-alt border border-border rounded-lg px-3 py-2 text-muted">
          {syncResult}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newArtist}
          onChange={(e) => setNewArtist(e.target.value)}
          placeholder="Add artist manually..."
          className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
        <button
          type="submit"
          disabled={adding || !newArtist.trim()}
          className="text-sm bg-surface border border-border px-3 py-2 rounded-lg hover:bg-surface-alt transition-colors disabled:opacity-50"
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </form>

      {pinned.length > 0 && (
        <div>
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted mb-3">
            Pinned
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pinned.map((a) => (
              <ArtistCard
                key={a.id}
                artist={a}
                onRelationship={handleRelationship}
              />
            ))}
          </div>
        </div>
      )}

      {followed.length > 0 && (
        <div>
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted mb-3">
            From Spotify
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {followed.map((a) => (
              <ArtistCard
                key={a.id}
                artist={a}
                onRelationship={handleRelationship}
              />
            ))}
          </div>
        </div>
      )}

      {artists.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-muted">
            No artists yet. Click &quot;Sync Spotify&quot; to import from your
            listening history, or add artists manually above.
          </p>
        </div>
      )}
    </div>
  );
}

function ArtistCard({
  artist,
  onRelationship,
}: {
  artist: Artist;
  onRelationship: (id: string, relationship: string) => void;
}) {
  const isPinned = artist.relationship === "pin";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
      {artist.artists.image_url ? (
        <img
          src={artist.artists.image_url}
          alt=""
          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-surface-alt flex items-center justify-center flex-shrink-0 text-muted text-sm font-medium">
          {artist.artists.name[0]}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{artist.artists.name}</p>
        <p className="text-xs text-muted">
          {artist.source === "manual" ? "Manual" : "Spotify"}
          {artist.spotify_score != null &&
            ` · Score ${Math.round(artist.spotify_score)}`}
        </p>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={() =>
            onRelationship(artist.id, isPinned ? "follow" : "pin")
          }
          title={isPinned ? "Unpin" : "Pin"}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            isPinned
              ? "bg-gold/20 text-gold"
              : "text-muted hover:text-foreground hover:bg-surface-alt"
          }`}
        >
          {isPinned ? "Pinned" : "Pin"}
        </button>
        <button
          onClick={() => onRelationship(artist.id, "remove")}
          title="Remove"
          className="text-xs px-2 py-1 rounded text-muted hover:text-coral hover:bg-coral/10 transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
