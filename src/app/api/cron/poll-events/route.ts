import { NextRequest, NextResponse } from "next/server";
import { fetchEvents, ingestEvents } from "@/lib/integrations/events";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cities = ["Poole", "Bournemouth", "London"];

  try {
    const events = await fetchEvents(cities);
    const result = await ingestEvents(events);

    return NextResponse.json({
      status: "ok",
      ...result,
      total_fetched: events.length,
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
