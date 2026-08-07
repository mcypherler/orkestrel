import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const VALID_TYPES = new Set([
  "surfaced",
  "opened",
  "saved",
  "dismissed",
  "hidden",
  "ticket_clicked",
  "not_for_me",
  "more_like_this",
]);

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { alertCandidateId, interactionType, metadata } = body;

  if (!alertCandidateId || !interactionType) {
    return NextResponse.json(
      { error: "alertCandidateId and interactionType are required" },
      { status: 400 }
    );
  }

  if (!VALID_TYPES.has(interactionType)) {
    return NextResponse.json(
      { error: `Invalid interactionType. Must be one of: ${[...VALID_TYPES].join(", ")}` },
      { status: 400 }
    );
  }

  const { data: candidate } = await supabase
    .from("alert_candidates")
    .select("id")
    .eq("id", alertCandidateId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!candidate) {
    return NextResponse.json({ error: "Alert candidate not found" }, { status: 404 });
  }

  const { error } = await supabase.from("alert_interactions").insert({
    user_id: user.id,
    alert_candidate_id: alertCandidateId,
    interaction_type: interactionType,
    metadata: metadata || {},
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
