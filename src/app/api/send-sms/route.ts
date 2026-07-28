import { NextRequest, NextResponse } from "next/server";
import { readUsers, writeUsers } from "@/lib/users";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
async function sendViaMessageMedia(phone: string, message: string) {
  const mode = process.env.SMS_MODE || "mock";
  if (mode === "mock") {
    console.log("[SMS mock]", phone, message.slice(0, 80));
    return { ok: true, mocked: true };
  }
  const apiKey = process.env.MESSAGEMEDIA_API_KEY;
  const apiSecret = process.env.MESSAGEMEDIA_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("MessageMedia credentials missing");
  }
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const res = await fetch("https://api.messagemedia.com/v1/messages", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          content: message,
          destination_number: phone,
          format: "SMS",
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MessageMedia failed: ${res.status} ${text}`);
  }
  return { ok: true, mocked: false };
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const phone = String(body.phone || "").trim();
    const alertType = String(body.alertType || "").trim();
    const userEmail = String(body.userEmail || "").trim();
    const fallbackName = String(body.userName || "Unknown User").trim();
    const lat =
      typeof body.lat === "number"
        ? body.lat
        : body.lat != null
          ? Number(body.lat)
          : null;
    const lng =
      typeof body.lng === "number"
        ? body.lng
        : body.lng != null
          ? Number(body.lng)
          : null;
    const incomingMessage = String(body.message || "").trim();
    if (!phone) {
      return NextResponse.json(
        { success: false, error: "Phone is required" },
        { status: 400 }
      );
    }
    // Signup / admin notify path: send raw message without user mutation
    if (alertType === "SIGNUP_REQUEST" || !userEmail) {
      const result = await sendViaMessageMedia(phone, incomingMessage);
      return NextResponse.json({ success: true, mocked: result.mocked });
    }
    const users = await readUsers();
    const idx = users.findIndex(
      (u) => u.email.toLowerCase() === userEmail.toLowerCase()
    );
    if (idx < 0) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }
    const user = users[idx];
    if (user.status !== "approved") {
      return NextResponse.json(
        { success: false, error: "User is not approved" },
        { status: 403 }
      );
    }
    const now = new Date();
    let timeSince = "n/a (first alert)";
    let distanceLine = "n/a (first alert)";
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
    const isEmergency =
      alertType.toUpperCase().includes("EMERGENCY") ||
      alertType.toUpperCase().includes("HELP");
    const header = isEmergency
      ? "🚨 EMERGENCY - SEND HELP"
      : "✅ SAFE ARRIVAL";
    const bodyLine =
      incomingMessage ||
      (isEmergency
        ? "I need immediate assistance!"
        : "I have arrived safely.");
    const maps =
      lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
        ? `https://maps.google.com/?q=${lat},${lng}&z=18`
        : "Location unavailable";
    const richMessage = [
      header,
      `From: ${user.name || fallbackName}`,
      `Time: ${formatTime(now)}`,
      bodyLine,
      `⏱ ${timeSince} since last alert`,
      `📏 ${distanceLine}`,
      `📍 ${maps}`,
    ].join("\n");
    const result = await sendViaMessageMedia(phone, richMessage);
    users[idx].lastAlert = {
      at: now.toISOString(),
      lat: lat != null && Number.isFinite(lat) ? lat : null,
      lng: lng != null && Number.isFinite(lng) ? lng : null,
      alertType,
    };
    users[idx].smsCount = (users[idx].smsCount || 0) + 1;
    await writeUsers(users);
    return NextResponse.json({
      success: true,
      mocked: result.mocked,
      message: richMessage,
      user: {
        name: users[idx].name,
        email: users[idx].email,
        status: users[idx].status,
        smsCount: users[idx].smsCount,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send SMS",
      },
      { status: 500 }
    );
  }
}
