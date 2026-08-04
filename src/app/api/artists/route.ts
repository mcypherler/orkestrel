import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: userArtists, error } = await supabase
    .from("user_artists")
    .select(
      `
      id,
      source,
      relationship,
      spotify_score,
      artists (
        id,
        name,
        spotify_id,
        image_url
      )
    `
    )
    .eq("user_id", session.userId)
    .neq("relationship", "remove")
    .order("spotify_score", { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ artists: userArtists });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { name } = await request.json();
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Artist name is required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data: existing } = await supabase
    .from("artists")
    .select("id")
    .ilike("name", name.trim())
    .maybeSingle();

  let artistId: string;

  if (existing) {
    artistId = existing.id;
  } else {
    const { data: newArtist, error: insertErr } = await supabase
      .from("artists")
      .insert({ name: name.trim() })
      .select("id")
      .single();

    if (insertErr || !newArtist) {
      return NextResponse.json(
        { error: "Failed to create artist" },
        { status: 500 }
      );
    }
    artistId = newArtist.id;
  }

  const { error: linkErr } = await supabase.from("user_artists").upsert(
    {
      user_id: session.userId,
      artist_id: artistId,
      source: "manual",
      relationship: "pin",
    },
    { onConflict: "user_id,artist_id" }
  );

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, artistId });
}
