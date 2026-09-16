import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, readUsers, writeUsers, type User } from "@/lib/users";
import { readAlertContacts } from "@/lib/alertContacts";
import { sendViaMessageMedia } from "@/lib/sms/sendSms";
import { publicHomeUrl } from "@/lib/publicOrigin";
import { SESSION_COOKIE_NAME } from "@/lib/sessionCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALERT_LOCK_MS = 3000;
const recentAlerts = new Map<
  string,
  { at: number; kind: "SAFE ARRIVAL" | "EMERGENCY" }
>();

function takeAlertLock(
  email: string,
  kind: "SAFE ARRIVAL" | "EMERGENCY"
): "SAFE ARRIVAL" | "EMERGENCY" | null {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const prev = recentAlerts.get(key);
  if (prev && now - prev.at < ALERT_LOCK_MS) {
    return prev.kind;
  }
  recentAlerts.set(key, { at: now, kind });
  return null;
}

function readEmail(req: NextRequest): string {
  const raw = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function wantsHtml(req: NextRequest): boolean {
  const mode = (req.headers.get("sec-fetch-mode") || "").toLowerCase();
  if (mode === "navigate") return true;
  const accept = (req.headers.get("accept") || "").toLowerCase();
  if (accept.includes("text/html") && !accept.includes("application/json")) {
    return true;
  }
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  return (
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("multipart/form-data")
  );
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(ms: number) {
  const totalMins = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function formatTime(date: Date) {
  return date.toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function buildRichMessage(
  user: User,
  alertType: "SAFE ARRIVAL" | "EMERGENCY",
  lat: number | null,
  lng: number | null
) {
  const now = new Date();
  let timeSince = "N/A (first alert)";
  let distanceLine = "N/A (first alert)";
  if (user.lastAlert?.at) {
    const prev = new Date(user.lastAlert.at);
    timeSince = formatDuration(now.getTime() - prev.getTime());
    if (
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      user.lastAlert.lat != null &&
      user.lastAlert.lng != null
    ) {
      const km = haversineKm(
        user.lastAlert.lat,
        user.lastAlert.lng,
        lat,
        lng
      );
      distanceLine = `${km.toFixed(2)} km from previous location`;
    }
  }
  const isEmergency = alertType === "EMERGENCY";
  const header = isEmergency
    ? "🚨 EMERGENCY - SEND HELP"
    : "✅ SAFE ARRIVAL";
  const bodyLine = isEmergency
    ? "I need immediate assistance!"
    : "I have arrived safely.";
  const maps =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? `https://maps.google.com/?q=${lat},${lng}&z=18`
      : "Location unavailable";
  return [
    header,
    `From: ${user.name}`,
    `Time: ${formatTime(now)}`,
    bodyLine,
    `⏱ ${timeSince} since last alert`,
    `📏 ${distanceLine}`,
    `📍 ${maps}`,
  ].join("\n");
}

async function parseBody(req: NextRequest): Promise<{
  type: string;
  lat: number | null;
  lng: number | null;
}> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    const body = await req.json();
    const lat =
      body.lat != null && body.lat !== "" ? Number(body.lat) : null;
    const lng =
      body.lng != null && body.lng !== "" ? Number(body.lng) : null;
    return {
      type: String(body.type || body.alertType || "").trim().toLowerCase(),
      lat: lat != null && Number.isFinite(lat) ? lat : null,
      lng: lng != null && Number.isFinite(lng) ? lng : null,
    };
  }
  const form = await req.formData();
  const latRaw = String(form.get("lat") || "").trim();
  const lngRaw = String(form.get("lng") || "").trim();
  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;
  return {
    type: String(form.get("type") || form.get("alertType") || "")
      .trim()
      .toLowerCase(),
    lat: lat != null && Number.isFinite(lat) ? lat : null,
    lng: lng != null && Number.isFinite(lng) ? lng : null,
  };
}

/**
 * Send Safe Arrival / Emergency alert to all saved contacts for the
 * session user. Works via native form POST (no React) or JSON fetch.
 */
export async function POST(req: NextRequest) {
  const html = wantsHtml(req);

  try {
    const email = readEmail(req);
    if (!email) {
      if (html) {
        return NextResponse.redirect(
          publicHomeUrl(req, {
            alert: "error",
            reason: "Restore your account first",
          }),
          303
        );
      }
      return NextResponse.json(
        { success: false, error: "Restore your account first." },
        { status: 401 }
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      if (html) {
        return NextResponse.redirect(
          publicHomeUrl(req, {
            alert: "error",
            reason: "Account not found",
          }),
          303
        );
      }
      return NextResponse.json(
        { success: false, error: "Account not found." },
        { status: 401 }
      );
    }

    if (user.status !== "approved") {
      if (html) {
        return NextResponse.redirect(
          publicHomeUrl(req, {
            alert: "error",
            reason: "Account is not approved yet",
          }),
          303
        );
      }
      return NextResponse.json(
        { success: false, error: "Account is not approved yet." },
        { status: 403 }
      );
    }

    const { type, lat, lng } = await parseBody(req);
    const isEmergency =
      type === "emergency" ||
      type === "help" ||
      type.includes("emergency");
    const alertType: "SAFE ARRIVAL" | "EMERGENCY" = isEmergency
      ? "EMERGENCY"
      : "SAFE ARRIVAL";
    const listKey = isEmergency ? "emergency" : "safe";

    const lockedKind = takeAlertLock(user.email, alertType);
    if (lockedKind) {
      const firstEmergency = lockedKind === "EMERGENCY";
      if (html) {
        return NextResponse.redirect(
          publicHomeUrl(req, {
            alert: firstEmergency ? "emergency-ok" : "safe-ok",
            sent: "1",
          }),
          303
        );
      }
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        duplicate: true,
        kind: firstEmergency ? "emergency" : "safe",
        alertType: lockedKind,
      });
    }

    const contactsFile = await readAlertContacts(user.email);
    const contacts = contactsFile[listKey];
    if (!contacts.length) {
      if (html) {
        return NextResponse.redirect(
          publicHomeUrl(req, {
            alert: "error",
            reason: `No ${listKey} contacts saved`,
          }),
          303
        );
      }
      return NextResponse.json(
        { success: false, error: `No ${listKey} contacts saved.` },
        { status: 400 }
      );
    }

    const message = buildRichMessage(user, alertType, lat, lng);
    const results: { phone: string; ok: boolean; error?: string }[] = [];

    for (const contact of contacts) {
      try {
        await sendViaMessageMedia(contact.phone, message, 10000);
        results.push({ phone: contact.phone, ok: true });
      } catch (err) {
        results.push({
          phone: contact.phone,
          ok: false,
          error: err instanceof Error ? err.message : "send failed",
        });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;

    // Update lastAlert / smsCount when at least one SMS was accepted.
    if (sent > 0) {
      const users = await readUsers();
      const idx = users.findIndex(
        (u) => u.email.toLowerCase() === user.email.toLowerCase()
      );
      if (idx >= 0) {
        const now = new Date();
        users[idx].lastAlert = {
          at: now.toISOString(),
          lat,
          lng,
          alertType,
        };
        users[idx].smsCount = (users[idx].smsCount || 0) + sent;
        await writeUsers(users);
      }
    }

    if (html) {
      if (sent === 0) {
        return NextResponse.redirect(
          publicHomeUrl(req, {
            alert: "error",
            reason: "SMS send failed — try again",
          }),
          303
        );
      }
      return NextResponse.redirect(
        publicHomeUrl(req, {
          alert: isEmergency ? "emergency-ok" : "safe-ok",
          sent: String(sent),
          ...(failed ? { failed: String(failed) } : {}),
        }),
        303
      );
    }

    return NextResponse.json({
      success: sent > 0,
      sent,
      failed,
      results,
      message,
    });
  } catch (error) {
    console.error(error);
    if (html) {
      return NextResponse.redirect(
        publicHomeUrl(req, {
          alert: "error",
          reason: "Could not send alert",
        }),
        303
      );
    }
    return NextResponse.json(
      { success: false, error: "Could not send alert" },
      { status: 500 }
    );
  }
}
