import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // Phase 6: Handle Twilio webhook for delivery status + inbound messages
  const body = await request.text();
  console.log("Twilio webhook received:", body.substring(0, 200));

  return NextResponse.json({ status: "ok" });
}
