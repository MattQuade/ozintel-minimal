import { NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "ozintel_user_email";
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function setSessionEmailCookie(
  res: NextResponse,
  email: string
): void {
  res.cookies.set(SESSION_COOKIE_NAME, email, {
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: true,
  });
}
