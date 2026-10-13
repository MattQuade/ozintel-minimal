/**
 * Shared MessageMedia / mock SMS sender with a hard timeout so callers
 * never hang forever waiting on the upstream API.
 */

export type SendSmsResult = { ok: true; mocked: boolean };

const DEFAULT_TIMEOUT_MS = 8000;

/** MessageMedia can return HTTP 202 while the message itself is rejected. */
const ACCEPTED_STATUSES = new Set([
  "queued",
  "enroute",
  "submitted",
  "sent",
  "delivered",
  "processed",
]);

function toSendNumber(phone: string): string {
  const compact = phone.trim().replace(/[\s()-]/g, "");
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("0")) return `+61${compact.slice(1)}`;
  if (compact.startsWith("61")) return `+${compact}`;
  return compact;
}

export async function sendViaMessageMedia(
  phone: string,
  message: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<SendSmsResult> {
  const mode = process.env.SMS_MODE || "mock";
  if (mode === "mock") {
    console.error("[SMS mock] message was not sent", phone);
    throw new Error("SMS test mode is on, so the message was not sent.");
  }

  const apiKey = process.env.MESSAGEMEDIA_API_KEY;
  const apiSecret = process.env.MESSAGEMEDIA_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("MessageMedia credentials missing");
  }

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
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
            destination_number: toSendNumber(phone),
            format: "SMS",
          },
        ],
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`MessageMedia failed: ${res.status} ${text.slice(0, 300)}`);
    }
    let payload: { messages?: Array<{ status?: string }> } = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    if (messages.length === 0) {
      throw new Error("MessageMedia returned no message.");
    }
    const rejected = messages.filter(
      (item) => !ACCEPTED_STATUSES.has(String(item.status || "").toLowerCase())
    );
    if (rejected.length > 0) {
      const status = rejected
        .map((item) => item.status || "unknown")
        .join(", ");
      throw new Error(`MessageMedia rejected the message (${status}).`);
    }
    return { ok: true, mocked: false };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`MessageMedia timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const ADMIN_NOTIFY_PHONE = "+61416619600";

/** Fire-and-forget admin SMS for a new signup. Never blocks the HTTP response. */
export function notifyAdminNewSignup(user: {
  name: string;
  email: string;
  phone: string;
}): void {
  const message = [
    "ADMIN ALERT - NEW SIGNUP",
    `Name: ${user.name}`,
    `Email: ${user.email}`,
    `Phone: ${user.phone}`,
    "Please approve in Admin Panel.",
  ].join("\n");

  void sendViaMessageMedia(ADMIN_NOTIFY_PHONE, message, 8000).catch((err) => {
    console.error("[signup SMS notify failed]", err);
  });
}
