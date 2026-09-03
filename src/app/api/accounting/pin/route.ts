import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, type User } from "@/lib/users";
import { SESSION_COOKIE_NAME } from "@/lib/sessionCookie";
import {
  hasAccountingPin,
  isFourDigitPin,
  setAccountingPin,
  verifyAccountingPin,
} from "@/lib/accounting/pinStore";
import {
  PIN_COOKIE_NAME,
  decodePinUnlock,
  encodePinUnlock,
  setPinUnlockCookie,
} from "@/lib/accounting/pinCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readEmail(req: NextRequest): string {
  const raw = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function canUseModulePin(user: User) {
  return Boolean(
    user.status === "approved" &&
      (user.permissions?.accounting ||
        user.permissions?.pubOps ||
        user.permissions?.forestryOps)
  );
}

async function requirePinUser(req: NextRequest) {
  const email = readEmail(req);
  if (!email) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, error: "Restore your account first." },
        { status: 401 }
      ),
    };
  }
  const user = await findUserByEmail(email);
  if (!user || !canUseModulePin(user)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, error: "Module PIN is only for approved Accounting or Ops users." },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, user };
}

function unlockedFor(req: NextRequest, email: string) {
  const token = req.cookies.get(PIN_COOKIE_NAME)?.value || "";
  if (!token) return false;
  return decodePinUnlock(token) === email.trim().toLowerCase();
}

function okWithCookie(user: User, extra: Record<string, unknown>) {
  const res = NextResponse.json({
    success: true,
    hasPin: true,
    unlocked: true,
    ...extra,
  });
  setPinUnlockCookie(res, encodePinUnlock(user.email));
  return res;
}

export async function GET(req: NextRequest) {
  try {
    const access = await requirePinUser(req);
    if (!access.ok) return access.response;
    const hasPin = await hasAccountingPin(access.user.email);
    return NextResponse.json({
      success: true,
      hasPin,
      unlocked: unlockedFor(req, access.user.email),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Could not check PIN." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requirePinUser(req);
    if (!access.ok) return access.response;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    const pin = String(body?.pin || "").trim();
    const confirm = String(body?.confirm ?? body?.pinConfirm ?? "").trim();

    if (action === "set") {
      if (!isFourDigitPin(pin)) {
        return NextResponse.json(
          { success: false, error: "PIN must be 4 digits." },
          { status: 400 }
        );
      }
      if (confirm && confirm !== pin) {
        return NextResponse.json(
          { success: false, error: "PINs do not match." },
          { status: 400 }
        );
      }
      try {
        await setAccountingPin(access.user.email, pin);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not set PIN.";
        const already = /already set/i.test(message);
        return NextResponse.json(
          { success: false, error: message },
          { status: already ? 409 : 400 }
        );
      }
      return okWithCookie(access.user, {});
    }

    if (action === "verify") {
      if (!isFourDigitPin(pin)) {
        return NextResponse.json(
          { success: false, error: "PIN must be 4 digits." },
          { status: 400 }
        );
      }
      const ok = await verifyAccountingPin(access.user.email, pin);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: "Incorrect PIN." },
          { status: 401 }
        );
      }
      return okWithCookie(access.user, {});
    }

    return NextResponse.json(
      { success: false, error: "Unknown PIN action." },
      { status: 400 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Could not update PIN." },
      { status: 500 }
    );
  }
}
