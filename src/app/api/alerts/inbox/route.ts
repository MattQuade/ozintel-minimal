import { NextRequest, NextResponse } from "next/server";
import { listInAppAlerts } from "@/lib/alerts/inbox";
import { SESSION_COOKIE_NAME } from "@/lib/sessionCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readEmail(req: NextRequest): string {
  const raw = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** Alerts left in this login's app. No SMS. */
export async function GET(req: NextRequest) {
  const email = readEmail(req);
  if (!email) {
    return NextResponse.json(
      { success: false, error: "Restore your account first." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  const messages = await listInAppAlerts(email);
  return NextResponse.json(
    { success: true, messages },
    { headers: { "Cache-Control": "no-store" } }
  );
}
