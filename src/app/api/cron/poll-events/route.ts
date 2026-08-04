import { NextRequest, NextResponse } from "next/server";
import { fetchEvents, ingestEvents } from "@/lib/integrations/events";
import { runMatchingForUser } from "@/lib/domain/matching";
import { deliverAlerts } from "@/lib/integrations/messaging";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cities = ["Poole", "Bournemouth", "London"];

  try {
    const events = await fetchEvents(cities);
    const ingestResult = await ingestEvents(events);

    const supabase = createServerClient();
    const { data: users } = await supabase.from("users").select("id");

    let totalMatched = 0;
    let totalSent = 0;

    for (const user of users || []) {
      const matchResult = await runMatchingForUser(user.id);
      totalMatched += matchResult.matched;

      const deliveryResult = await deliverAlerts(user.id);
      totalSent += deliveryResult.sent + deliveryResult.previewed;
    }

    return NextResponse.json({
      status: "ok",
      events: ingestResult,
      matching: { matched: totalMatched },
      delivery: { sent: totalSent },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Cron poll failed:", err);
    return NextResponse.json(
      { status: "error", message: String(err) },
      { status: 500 }
    );
  }
}
