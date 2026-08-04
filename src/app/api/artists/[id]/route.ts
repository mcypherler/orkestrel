import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const { relationship } = await request.json();

  if (!["follow", "pin", "remove"].includes(relationship)) {
    return NextResponse.json(
      { error: "Invalid relationship" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from("user_artists")
    .update({ relationship })
    .eq("id", id)
    .eq("user_id", session.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
