import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data: prefs } = await supabase
    .from("preferences")
    .select("preferred_cities")
    .eq("user_id", session.userId)
    .single();

  const cities = prefs?.preferred_cities?.length
    ? prefs.preferred_cities
    : null;

  let query = supabase
    .from("events")
    .select("*, event_offers (*)")
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(200);

  if (cities) {
    const orFilter = cities
      .map((c: string) => `venue_city.ilike.${c}`)
      .join(",");
    query = query.or(orFilter);
  }

  const { data: events, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events, filtered_by: cities });
}
