import { NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "ozintel_user_email";
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function setSessionEmailCookie(
  res: NextResponse,
  email: string
): void {
  // Encode so addresses like tbong@ozintel survive Set-Cookie parsing
  // (raw "@" is unreliable across Safari / standalone PWAs).
  const value = encodeURIComponent(String(email || "").trim());
  const expires = new Date(Date.now() + SESSION_COOKIE_MAX_AGE * 1000);
  res.cookies.set(SESSION_COOKIE_NAME, value, {
    maxAge: SESSION_COOKIE_MAX_AGE,
    expires,
    path: "/",
    sameSite: "lax",
    secure: true,
  });
}
