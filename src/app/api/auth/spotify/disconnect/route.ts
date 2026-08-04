import { NextResponse } from "next/server";
import { getSession, clearSession } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServerClient();

  await supabase
    .from("spotify_connections")
    .delete()
    .eq("user_id", session.userId);

  await supabase
    .from("user_artists")
    .delete()
    .eq("user_id", session.userId)
    .eq("source", "spotify");

  await supabase.from("consents").insert({
    user_id: session.userId,
    consent_type: "spotify",
    revoked_at: new Date().toISOString(),
    source: "user_disconnect",
  });

  await clearSession();
  return NextResponse.json({ success: true });
}
