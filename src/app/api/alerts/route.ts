import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("alert_candidates")
    .select(
      `
      *,
      events (*),
      message_deliveries (*)
    `
    )
    .eq("user_id", session.userId)
    .order("score", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alerts: data });
}
