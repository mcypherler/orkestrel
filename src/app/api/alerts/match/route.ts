import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { runMatchingForUser } from "@/lib/domain/matching";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await runMatchingForUser(session.userId);
  return NextResponse.json(result);
}
