import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";
import { pickBigStory } from "@/lib/integrations/openai";
import type { BigStoryCandidate } from "@/lib/integrations/openai";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: candidates } = await supabase
    .from("alert_candidates")
    .select("*, events(*, event_offers(*))")
    .eq("user_id", session.userId)
    .in("status", ["eligible", "sent"])
    .order("score", { ascending: false })
    .limit(20);

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ bigStory: null, featured: [] });
  }

  const mapped: BigStoryCandidate[] = candidates.map((c, i) => {
    const event = c.events as Record<string, unknown>;
    const offers = ((event?.event_offers || []) as Record<string, unknown>[])
      .filter((o) => o.price_amount != null)
      .sort((a, b) => (a.price_amount as number) - (b.price_amount as number));

    let priceLabel = "Price TBC";
    if (offers.length > 0) {
      const best = offers[0];
      const prefix = best.price_type === "from" ? "From " : "";
      priceLabel = `${prefix}£${(best.price_amount as number).toFixed(0)}`;
    }

    return {
      index: i,
      title: (event?.title as string) || "",
      artistName: (event?.artist_name as string) || null,
      eventType: (event?.event_type as string) || "",
      venueName: (event?.venue_name as string) || null,
      venueCity: (event?.venue_city as string) || null,
      startsAt: (event?.starts_at as string) || null,
      score: (c.score as number) || 0,
      reasons: (c.reasons as string[]) || [],
      priceLabel,
      status: c.status as string,
      createdAt: c.created_at as string,
    };
  });

  const bigStory = await pickBigStory(mapped);

  const pickedIndex = bigStory?.pickedIndex ?? 0;
  const featured = candidates.map((c) => ({
    id: c.id,
    score: c.score,
    reasons: c.reasons,
    warnings: [...new Set(c.warnings as string[])],
    status: c.status,
    created_at: c.created_at,
    events: c.events,
  }));

  const reordered = [
    featured[pickedIndex],
    ...featured.filter((_, i) => i !== pickedIndex),
  ];

  return NextResponse.json({
    bigStory: bigStory ? { headline: bigStory.headline, reasoning: bigStory.reasoning } : null,
    featured: reordered.slice(0, 5),
  });
}
