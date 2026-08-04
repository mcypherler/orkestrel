import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "orkestrel_session";

interface SessionData {
  userId: string;
  spotifyId: string;
  displayName: string;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not set");
  return secret;
}

function sign(payload: string): string {
  const mac = createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${mac}`;
}

function verify(token: string): string | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = token.substring(0, lastDot);
  const signature = token.substring(lastDot + 1);

  const expected = createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");

  try {
    if (
      timingSafeEqual(
        Buffer.from(signature, "base64url"),
        Buffer.from(expected, "base64url")
      )
    ) {
      return payload;
    }
  } catch {
    return null;
  }
  return null;
}

export async function createSession(data: SessionData): Promise<string> {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const token = sign(payload);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return token;
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verify(token);
  if (!payload) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
