import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("preferences")
    .select("*")
    .eq("user_id", session.userId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ preferences: data });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const supabase = createServerClient();

  const updates: Record<string, unknown> = {};
  if (body.home_postcode !== undefined) updates.home_postcode = body.home_postcode;
  if (body.preferred_cities !== undefined) updates.preferred_cities = body.preferred_cities;
  if (body.max_price_gbp !== undefined) updates.max_price_gbp = body.max_price_gbp;
  if (body.ticket_count !== undefined) updates.ticket_count = body.ticket_count;
  if (body.max_radius_miles !== undefined) updates.max_radius_miles = body.max_radius_miles;
  if (body.reject_restricted_view !== undefined) updates.reject_restricted_view = body.reject_restricted_view;
  if (body.allow_tributes !== undefined) updates.allow_tributes = body.allow_tributes;

  const { error } = await supabase
    .from("preferences")
    .update(updates)
    .eq("user_id", session.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
