import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export const PIN_COOKIE_NAME = "ozintel_accounting_pin_v2";
const PIN_COOKIE_MAX_AGE = 60 * 30;

type PinPayload = {
  email: string;
  scope: "modules";
  exp: number;
};

function pinSecret() {
  return (
    process.env.OZINTEL_PIN_SECRET?.trim() ||
    process.env.OZINTEL_SESSION_SECRET?.trim() ||
    "ozintel-local-pin-key"
  );
}

function sign(body: string) {
  return createHmac("sha256", pinSecret()).update(body).digest("base64url");
}

export function encodePinUnlock(email: string) {
  const payload: PinPayload = {
    email: email.trim().toLowerCase(),
    scope: "modules",
    exp: Math.floor(Date.now() / 1000) + PIN_COOKIE_MAX_AGE,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  return `${body}.${sign(body)}`;
}

export function decodePinUnlock(token: string): string | null {
  try {
    const [body, sig] = String(token || "").split(".");
    if (!body || !sig) return null;
    const expected = sign(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as PinPayload;
    if (payload.scope !== "modules" || typeof payload.email !== "string") {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.email.trim().toLowerCase();
  } catch {
    return null;
  }
}

export function setPinUnlockCookie(res: NextResponse, token: string) {
  res.cookies.set(PIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: PIN_COOKIE_MAX_AGE,
  });
}

export function clearPinUnlockCookie(res: NextResponse) {
  res.cookies.delete(PIN_COOKIE_NAME);
}
