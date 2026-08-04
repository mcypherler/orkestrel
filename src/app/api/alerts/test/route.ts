import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sendTestAlert } from "@/lib/integrations/messaging";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await sendTestAlert();
  return NextResponse.json(result);
}
