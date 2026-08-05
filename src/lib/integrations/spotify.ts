import { encrypt, decrypt } from "@/lib/crypto";
import { createServerClient } from "@/lib/supabase/server";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface SpotifyArtist {
  id: string;
  name: string;
  images: { url: string; width: number; height: number }[];
  genres: string[];
}

interface SpotifyTopArtistsResponse {
  items: SpotifyArtist[];
}

interface SpotifyRecentlyPlayedResponse {
  items: {
    track: {
      artists: { id: string; name: string }[];
    };
    played_at: string;
  }[];
}

interface SpotifyProfile {
  id: string;
  display_name: string;
  email: string;
  images: { url: string }[];
}

export async function exchangeCode(code: string): Promise<SpotifyTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_API_CLIENTID}:${process.env.SPOTIFY_API_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify token exchange failed: ${err}`);
  }

  return res.json();
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<SpotifyTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_API_CLIENTID}:${process.env.SPOTIFY_API_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify token refresh failed: ${err}`);
  }

  return res.json();
}

export async function getProfile(accessToken: string): Promise<SpotifyProfile> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Spotify profile fetch failed: ${res.status}`);
  return res.json();
}

export async function getTopArtists(
  accessToken: string,
  timeRange: "short_term" | "medium_term" | "long_term" = "medium_term"
): Promise<SpotifyArtist[]> {
  const res = await fetch(
    `${API_BASE}/me/top/artists?time_range=${timeRange}&limit=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new Error(`Rate limited. Retry after ${retryAfter}s`);
  }
  if (!res.ok) throw new Error(`Spotify top artists failed: ${res.status}`);

  const data: SpotifyTopArtistsResponse = await res.json();
  return data.items;
}

export async function getRecentlyPlayed(
  accessToken: string
): Promise<SpotifyRecentlyPlayedResponse["items"]> {
  const res = await fetch(`${API_BASE}/me/player/recently-played?limit=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new Error(`Rate limited. Retry after ${retryAfter}s`);
  }
  if (!res.ok)
    throw new Error(`Spotify recently played failed: ${res.status}`);

  const data: SpotifyRecentlyPlayedResponse = await res.json();
  return data.items;
}

export async function getValidAccessToken(userId: string): Promise<string> {
  const supabase = createServerClient();

  const { data: conn, error } = await supabase
    .from("spotify_connections")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !conn) throw new Error("No Spotify connection found");

  const expiresAt = new Date(conn.token_expires_at);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    return decrypt(conn.access_token_encrypted);
  }

  const refreshToken = decrypt(conn.refresh_token_encrypted);
  const tokens = await refreshAccessToken(refreshToken);

  const newExpiry = new Date(
    Date.now() + tokens.expires_in * 1000
  ).toISOString();

  await supabase
    .from("spotify_connections")
    .update({
      access_token_encrypted: encrypt(tokens.access_token),
      refresh_token_encrypted: encrypt(
        tokens.refresh_token || refreshToken
      ),
      token_expires_at: newExpiry,
    })
    .eq("user_id", userId);

  return tokens.access_token;
}

const MIN_ARTIST_SCORE = 15;

export async function syncArtistsFromSpotify(userId: string): Promise<{
  imported: number;
  skipped: number;
  filtered: number;
}> {
  const accessToken = await getValidAccessToken(userId);
  const supabase = createServerClient();

  const [topShort, topMedium, topLong, recent] = await Promise.all([
    getTopArtists(accessToken, "short_term").catch(() => []),
    getTopArtists(accessToken, "medium_term").catch(() => []),
    getTopArtists(accessToken, "long_term").catch(() => []),
    getRecentlyPlayed(accessToken).catch(() => []),
  ]);

  const artistScores = new Map<
    string,
    { name: string; spotifyId: string; imageUrl: string | null; score: number }
  >();

  function addArtist(
    spotifyId: string,
    name: string,
    imageUrl: string | null,
    score: number
  ) {
    const existing = artistScores.get(spotifyId);
    if (existing) {
      existing.score += score;
    } else {
      artistScores.set(spotifyId, { name, spotifyId, imageUrl, score });
    }
  }

  topShort.forEach((a, i) =>
    addArtist(a.id, a.name, a.images[0]?.url ?? null, 30 - i * 0.5)
  );
  topMedium.forEach((a, i) =>
    addArtist(a.id, a.name, a.images[0]?.url ?? null, 20 - i * 0.3)
  );
  topLong.forEach((a, i) =>
    addArtist(a.id, a.name, a.images[0]?.url ?? null, 10 - i * 0.1)
  );

  const recentCounts = new Map<string, number>();
  for (const item of recent) {
    for (const artist of item.track.artists) {
      recentCounts.set(artist.id, (recentCounts.get(artist.id) || 0) + 1);
    }
  }
  for (const [spotifyId, count] of recentCounts) {
    const matchingArtist = recent
      .flatMap((i) => i.track.artists)
      .find((a) => a.id === spotifyId);
    if (matchingArtist) {
      addArtist(spotifyId, matchingArtist.name, null, count * 2);
    }
  }

  await supabase
    .from("user_artists")
    .delete()
    .eq("user_id", userId)
    .eq("source", "spotify")
    .in("relationship", ["follow"]);

  let imported = 0;
  let skipped = 0;
  let filtered = 0;

  for (const artist of artistScores.values()) {
    if (artist.score < MIN_ARTIST_SCORE) {
      filtered++;
      continue;
    }

    const { data: existingArtist } = await supabase
      .from("artists")
      .select("id")
      .eq("spotify_id", artist.spotifyId)
      .maybeSingle();

    let artistId: string;

    if (existingArtist) {
      artistId = existingArtist.id;
      if (artist.imageUrl) {
        await supabase
          .from("artists")
          .update({ image_url: artist.imageUrl })
          .eq("id", artistId);
      }
    } else {
      const { data: newArtist, error: insertErr } = await supabase
        .from("artists")
        .insert({
          name: artist.name,
          spotify_id: artist.spotifyId,
          image_url: artist.imageUrl,
        })
        .select("id")
        .single();

      if (insertErr || !newArtist) {
        skipped++;
        continue;
      }
      artistId = newArtist.id;
    }

    const { data: existingLink } = await supabase
      .from("user_artists")
      .select("id, relationship")
      .eq("user_id", userId)
      .eq("artist_id", artistId)
      .maybeSingle();

    if (existingLink) {
      if (existingLink.relationship === "remove") {
        skipped++;
        continue;
      }
      await supabase
        .from("user_artists")
        .update({
          spotify_score: artist.score,
          source: "spotify",
        })
        .eq("id", existingLink.id);
    } else {
      await supabase.from("user_artists").insert({
        user_id: userId,
        artist_id: artistId,
        source: "spotify",
        relationship: "follow",
        spotify_score: artist.score,
      });
    }

    imported++;
  }

  await supabase
    .from("spotify_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);

  return { imported, skipped, filtered };
}
