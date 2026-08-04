import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchEvents, ingestEvents } from "@/lib/integrations/events";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const session = await getSession();

  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!session && !isCron) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServerClient();

  let cities = ["Poole", "Bournemouth", "London"];
  let artistNames: string[] = [];

  if (session) {
    const { data: prefs } = await supabase
      .from("preferences")
      .select("preferred_cities")
      .eq("user_id", session.userId)
      .single();

    if (prefs?.preferred_cities?.length) {
      cities = prefs.preferred_cities;
    }

    const { data: userArtists } = await supabase
      .from("user_artists")
      .select("artists(name)")
      .eq("user_id", session.userId)
      .neq("relationship", "remove");

    if (userArtists) {
      artistNames = userArtists
        .map((ua) => (ua.artists as unknown as { name: string })?.name)
        .filter(Boolean);
    }
  }

  const events = await fetchEvents(cities, artistNames);
  const result = await ingestEvents(events);

  return NextResponse.json({
    ...result,
    total_fetched: events.length,
    timestamp: new Date().toISOString(),
  });
}
