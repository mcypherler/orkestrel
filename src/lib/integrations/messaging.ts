import { createServerClient } from "@/lib/supabase/server";
import { pickBigStory } from "@/lib/integrations/openai";

interface AlertData {
  candidateId: string;
  title: string;
  eventType: string;
  inspiredArtist: string | null;
  venueName: string | null;
  venueCity: string | null;
  startsAt: string | null;
  priceLabel: string;
  seatNote: string;
  matchReasons: string[];
  warnings: string[];
  officialUrl: string | null;
}

export function formatAlertPreview(data: AlertData): string {
  const lines: string[] = [];

  let titleLine = data.title;
  if (data.eventType === "tribute_concert" && data.inspiredArtist) {
    titleLine += ` — ${data.inspiredArtist} tribute`;
  } else if (data.eventType === "recurring_experience" && data.inspiredArtist) {
    titleLine += ` — inspired by ${data.inspiredArtist}`;
  }

  lines.push(`🎵 ${titleLine}`);

  const locationParts: string[] = [];
  if (data.venueName) locationParts.push(data.venueName);
  if (data.venueCity) locationParts.push(data.venueCity);

  if (data.startsAt) {
    const date = new Date(data.startsAt);
    const formatted = date.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    locationParts.push(formatted);
  } else {
    locationParts.push("Date TBA");
  }

  lines.push(locationParts.join(" · "));
  lines.push(`${data.priceLabel} · ${data.seatNote}`);
  lines.push(`Why: ${data.matchReasons.join(", ")}`);

  if (data.warnings.length > 0) {
    lines.push(data.warnings.join(" · "));
  }

  lines.push("Availability and fees can change — check seller");

  if (data.officialUrl) {
    lines.push(`Book: ${data.officialUrl}`);
  }

  return lines.join("\n");
}

export function buildPriceLabel(
  offers: { price_amount: number | null; price_type: string | null }[]
): string {
  const priced = offers
    .filter((o) => o.price_amount != null)
    .sort((a, b) => (a.price_amount ?? 0) - (b.price_amount ?? 0));

  if (priced.length === 0) return "Price not supplied — check seller";

  const best = priced[0];
  const prefix = best.price_type === "from" ? "From " : "";
  return `${prefix}£${best.price_amount!.toFixed(2)} per person`;
}

export function buildSeatNote(
  offers: { seat_quality: string; section: string | null }[]
): string {
  if (offers.length === 0) return "View not verified";
  const qualities = offers.map((o) => o.seat_quality);
  if (qualities.includes("clear")) return "Clear view";
  return "View not verified";
}

const PERMANENT_ERROR_CODES = [20003, 20404, 21211, 21408, 21610, 21614];

async function sendViaTwilio(
  message: string,
  maxRetries = 2
): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
  attempts: number;
}> {
  const accountSid = process.env.TWILLIO_API_CLIENTID;
  const authToken = process.env.TWILLIO_API_SECRET;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const to = process.env.WHATSAPP_RECIPIENT;

  if (!accountSid || !authToken || !from || !to) {
    return {
      success: false,
      error: `Twilio not configured: ${[
        !accountSid && "TWILLIO_API_CLIENTID",
        !authToken && "TWILLIO_API_SECRET",
        !from && "TWILIO_WHATSAPP_FROM",
        !to && "WHATSAPP_RECIPIENT",
      ]
        .filter(Boolean)
        .join(", ")} missing`,
      attempts: 0,
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
  const body = new URLSearchParams({ From: from, To: to, Body: message });

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      const data = await res.json();

      if (res.ok) {
        return { success: true, messageId: data.sid, attempts: attempt };
      }

      const errorCode = data.code as number | undefined;
      if (errorCode && PERMANENT_ERROR_CODES.includes(errorCode)) {
        return {
          success: false,
          error: `[${errorCode}] ${data.message || `HTTP ${res.status}`}`,
          attempts: attempt,
        };
      }

      if (attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        continue;
      }

      return {
        success: false,
        error: data.message || `HTTP ${res.status}`,
        attempts: attempt,
      };
    } catch (err) {
      if (attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        continue;
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
        attempts: attempt,
      };
    }
  }

  return { success: false, error: "Max retries exceeded", attempts: maxRetries + 1 };
}

export async function sendTestAlert(): Promise<{
  success: boolean;
  error?: string;
}> {
  const result = await sendViaTwilio(
    "🧪 Orkestrel test alert\nThis confirms WhatsApp delivery is working."
  );
  return { success: result.success, error: result.error };
}

interface PreparedAlert {
  candidateId: string;
  eventTitle: string;
  artistName: string | null;
  eventType: string;
  venueName: string | null;
  venueCity: string | null;
  startsAt: string | null;
  score: number;
  reasons: string[];
  priceLabel: string;
  preview: string;
}

export async function deliverAlerts(userId: string): Promise<{
  sent: number;
  previewed: number;
  failed: number;
  errors: string[];
  bigStory: string | null;
}> {
  const supabase = createServerClient();
  const provider = process.env.WHATSAPP_PROVIDER || "console";
  const alertsEnabled = process.env.ALERTS_ENABLED === "true";

  const { data: candidates } = await supabase
    .from("alert_candidates")
    .select("*, events(*, event_offers(*))")
    .eq("user_id", userId)
    .eq("status", "eligible")
    .order("score", { ascending: false });

  if (!candidates || candidates.length === 0) {
    return { sent: 0, previewed: 0, failed: 0, errors: [], bigStory: null };
  }

  const prepared: PreparedAlert[] = [];

  for (const candidate of candidates) {
    const event = candidate.events as Record<string, unknown>;
    if (!event) continue;

    const offers = (event.event_offers || []) as Record<string, unknown>[];

    const priceLabel = buildPriceLabel(
      offers.map((o) => ({
        price_amount: o.price_amount as number | null,
        price_type: o.price_type as string | null,
      }))
    );

    const alertData: AlertData = {
      candidateId: candidate.id as string,
      title: event.title as string,
      eventType: event.event_type as string,
      inspiredArtist: event.inspired_artist as string | null,
      venueName: event.venue_name as string | null,
      venueCity: event.venue_city as string | null,
      startsAt: event.starts_at as string | null,
      priceLabel,
      seatNote: buildSeatNote(
        offers.map((o) => ({
          seat_quality: o.seat_quality as string,
          section: o.section as string | null,
        }))
      ),
      matchReasons: (candidate.reasons as string[]) || [],
      warnings: (candidate.warnings as string[]) || [],
      officialUrl: event.official_url as string | null,
    };

    prepared.push({
      candidateId: candidate.id as string,
      eventTitle: event.title as string,
      artistName: event.artist_name as string | null,
      eventType: event.event_type as string,
      venueName: event.venue_name as string | null,
      venueCity: event.venue_city as string | null,
      startsAt: event.starts_at as string | null,
      score: (candidate.score as number) || 0,
      reasons: (candidate.reasons as string[]) || [],
      priceLabel,
      preview: formatAlertPreview(alertData),
    });
  }

  if (prepared.length === 0) {
    return { sent: 0, previewed: 0, failed: 0, errors: [], bigStory: null };
  }

  // Ask OpenAI to pick the big story of the day
  const bigStory = await pickBigStory(
    prepared.map((p, i) => ({
      index: i,
      title: p.eventTitle,
      artistName: p.artistName,
      eventType: p.eventType,
      venueName: p.venueName,
      venueCity: p.venueCity,
      startsAt: p.startsAt,
      score: p.score,
      reasons: p.reasons,
      priceLabel: p.priceLabel,
    }))
  );

  // Reorder: big story first, then the rest
  const ordered = [...prepared];
  if (bigStory && bigStory.pickedIndex < ordered.length) {
    const [picked] = ordered.splice(bigStory.pickedIndex, 1);
    picked.preview = `⭐ Today's pick: ${bigStory.headline}\n\n${picked.preview}`;
    ordered.unshift(picked);
  }

  let sent = 0;
  let previewed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const alert of ordered) {
    if (provider === "twilio" && alertsEnabled) {
      const result = await sendViaTwilio(alert.preview);

      await supabase.from("message_deliveries").insert({
        alert_candidate_id: alert.candidateId,
        provider: "twilio",
        provider_message_id: result.messageId || null,
        recipient: process.env.WHATSAPP_RECIPIENT || null,
        status: result.success ? "sent" : "failed",
        preview_text: alert.preview,
        sent_at: result.success ? new Date().toISOString() : null,
        error_message: result.error || null,
      });

      if (result.success) {
        sent++;
        await supabase
          .from("alert_candidates")
          .update({ status: "sent" })
          .eq("id", alert.candidateId);
      } else {
        failed++;
        errors.push(`${alert.eventTitle}: ${result.error}`);
      }
    } else {
      await supabase.from("message_deliveries").insert({
        alert_candidate_id: alert.candidateId,
        provider: "console",
        status: "sent",
        preview_text: alert.preview,
        sent_at: new Date().toISOString(),
      });
      previewed++;
      await supabase
        .from("alert_candidates")
        .update({ status: "sent" })
        .eq("id", alert.candidateId);
    }
  }

  return { sent, previewed, failed, errors, bigStory: bigStory?.headline || null };
}
