import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const displayName = (body.displayName || "").trim();

  if (!displayName || displayName.length > 50) {
    return NextResponse.json(
      { error: "Display name is required (max 50 characters)" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data: newUser, error: insertErr } = await supabase
    .from("users")
    .insert({
      display_name: displayName,
    })
    .select("id")
    .single();

  if (insertErr || !newUser) {
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }

  await supabase.from("preferences").insert({
    user_id: newUser.id,
    home_postcode: null,
    preferred_cities: ["London"],
    max_price_gbp: 50,
    ticket_count: 2,
    reject_restricted_view: true,
    allow_tributes: true,
  });

  await createSession({
    userId: newUser.id,
    spotifyId: "",
    displayName,
  });

  return NextResponse.json({ success: true });
}
