import { NextRequest, NextResponse } from "next/server";
import { fetchEvents, ingestEvents } from "@/lib/integrations/events";
import { runMatchingForUser } from "@/lib/domain/matching";
import { deliverAlerts } from "@/lib/integrations/messaging";
import { createServerClient } from "@/lib/supabase/server";

function isLondon7am(): boolean {
  const now = new Date();
  const londonHour = parseInt(
    now.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "numeric", hour12: false })
  );
  return londonHour === 7;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isLondon7am()) {
    return NextResponse.json({
      status: "skipped",
      reason: "Not 07:00 Europe/London",
      timestamp: new Date().toISOString(),
    });
  }

  const runId = crypto.randomUUID();
  const startTime = Date.now();

  const log = (stage: string, detail: Record<string, unknown>) =>
    console.log(JSON.stringify({ runId, stage, ...detail }));

  try {
    const supabase = createServerClient();

    log("start", { timestamp: new Date().toISOString() });

    const { data: allPrefs } = await supabase
      .from("preferences")
      .select("user_id, preferred_cities");

    const citySet = new Set<string>();
    for (const pref of allPrefs || []) {
      for (const city of pref.preferred_cities || []) {
        citySet.add(city);
      }
    }
    const cities =
      citySet.size > 0
        ? Array.from(citySet)
        : ["Poole", "Bournemouth", "London"];

    const { data: allArtistLinks } = await supabase
      .from("user_artists")
      .select("artists(name)")
      .neq("relationship", "remove");

    const artistNameSet = new Set<string>();
    for (const link of allArtistLinks || []) {
      const name = (link.artists as unknown as { name: string })?.name;
      if (name) artistNameSet.add(name);
    }

    log("fetch_events", { cities, artistCount: artistNameSet.size });
    const { events } = await fetchEvents(cities, Array.from(artistNameSet));
    const ingestResult = await ingestEvents(events);
    log("ingest", ingestResult);

    const { data: users } = await supabase.from("users").select("id");

    let totalMatched = 0;
    let totalRejected = 0;
    let totalAiMatched = 0;
    let totalSemanticMatched = 0;
    let totalSent = 0;
    let totalFailed = 0;
    let semanticStats: Record<string, unknown> | null = null;
    const userErrors: string[] = [];

    for (const user of users || []) {
      try {
        const matchResult = await runMatchingForUser(user.id);
        totalMatched += matchResult.matched;
        totalRejected += matchResult.rejected;
        totalAiMatched += matchResult.aiMatched;
        totalSemanticMatched += matchResult.semanticMatched;
        if (matchResult.semanticStats) semanticStats = matchResult.semanticStats;

        const deliveryResult = await deliverAlerts(user.id);
        totalSent += deliveryResult.sent + deliveryResult.previewed;
        totalFailed += deliveryResult.failed;
        if (deliveryResult.errors.length > 0) {
          userErrors.push(...deliveryResult.errors);
        }
      } catch (err) {
        log("user_error", { userId: user.id, error: String(err) });
        userErrors.push(`User ${user.id}: ${String(err)}`);
      }
    }

    const duration = Date.now() - startTime;
    const summary = {
      status: "ok",
      runId,
      cities: Array.from(citySet),
      events: ingestResult,
      matching: {
        matched: totalMatched,
        rejected: totalRejected,
        aiMatched: totalAiMatched,
        semanticMatched: totalSemanticMatched,
        semanticStats,
      },
      delivery: { sent: totalSent, failed: totalFailed },
      errors: userErrors.length > 0 ? userErrors : undefined,
      usersProcessed: (users || []).length,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    };

    log("complete", summary);
    return NextResponse.json(summary);
  } catch (err) {
    const duration = Date.now() - startTime;
    log("fatal", { error: String(err), durationMs: duration });
    console.error("Cron poll failed:", err);
    return NextResponse.json(
      { status: "error", runId, message: String(err) },
      { status: 500 }
    );
  }
}
