import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Phase 7: Fetch events from configured sources, normalize, deduplicate, score, enqueue alerts
  return NextResponse.json({
    status: "ok",
    message: "Event polling not yet implemented",
    timestamp: new Date().toISOString(),
  });
}
