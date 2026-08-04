import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, getProfile } from "@/lib/integrations/spotify";
import { encrypt } from "@/lib/crypto";
import { createSession } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const storedState = request.cookies.get("spotify_oauth_state")?.value;
  const appUrl = process.env.APP_URL || "http://127.0.0.1:3000";

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/settings?error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${appUrl}/settings?error=invalid_state`);
  }

  try {
    const tokens = await exchangeCode(code);
    const profile = await getProfile(tokens.access_token);
    const supabase = createServerClient();

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("spotify_id", profile.id)
      .maybeSingle();

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      await supabase
        .from("users")
        .update({
          display_name: profile.display_name,
          email: profile.email,
        })
        .eq("id", userId);
    } else {
      const { data: newUser, error: insertErr } = await supabase
        .from("users")
        .insert({
          spotify_id: profile.id,
          display_name: profile.display_name,
          email: profile.email,
        })
        .select("id")
        .single();

      if (insertErr || !newUser) {
        return NextResponse.redirect(
          `${appUrl}/settings?error=user_creation_failed`
        );
      }
      userId = newUser.id;

      await supabase.from("preferences").insert({
        user_id: userId,
        home_postcode: "BH14",
        preferred_cities: ["Poole", "Bournemouth", "London"],
        max_price_gbp: 50,
        ticket_count: 3,
        reject_restricted_view: true,
        allow_tributes: true,
      });

      await supabase.from("consents").insert({
        user_id: userId,
        consent_type: "spotify",
        source: "oauth_connect",
      });
    }

    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();

    await supabase.from("spotify_connections").upsert(
      {
        user_id: userId,
        access_token_encrypted: encrypt(tokens.access_token),
        refresh_token_encrypted: encrypt(tokens.refresh_token),
        token_expires_at: expiresAt,
      },
      { onConflict: "user_id" }
    );

    await createSession({
      userId,
      spotifyId: profile.id,
      displayName: profile.display_name,
    });

    const response = NextResponse.redirect(`${appUrl}/artists?connected=true`);
    response.cookies.delete("spotify_oauth_state");
    return response;
  } catch (err) {
    console.error("Spotify OAuth error:", err);
    return NextResponse.redirect(`${appUrl}/settings?error=auth_failed`);
  }
}
