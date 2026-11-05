import { NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "ozintel_user_email";
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Decode cookie values that may have been URI-encoded once or twice. */
export function decodeSessionEmailCookie(raw: string): string {
  let s = String(raw || "").trim();
  if (!s) return "";
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(s);
      if (next === s) break;
      s = next;
    } catch {
      break;
    }
  }
  return s.trim();
}

export function setSessionEmailCookie(
  res: NextResponse,
  email: string
): void {
  // Pass the raw email — Next's cookie serializer encodes once.
  // (Manual encodeURIComponent caused double-encoding and broke restore.)
  const value = String(email || "").trim().toLowerCase();
  const expires = new Date(Date.now() + SESSION_COOKIE_MAX_AGE * 1000);
  res.cookies.set(SESSION_COOKIE_NAME, value, {
    maxAge: SESSION_COOKIE_MAX_AGE,
    expires,
    path: "/",
    sameSite: "lax",
    secure: true,
  });
}
