import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const storedState = request.cookies.get("spotify_oauth_state")?.value;

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(
      new URL("/settings?error=invalid_state", request.url)
    );
  }

  // Phase 2: Exchange code for tokens, create/update user, store encrypted tokens
  // For now, redirect with a placeholder message
  const response = NextResponse.redirect(
    new URL("/settings?spotify=connected", request.url)
  );

  response.cookies.delete("spotify_oauth_state");
  return response;
}
