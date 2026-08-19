import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/users";
import {
  readAlertContacts,
  writeAlertContacts,
  type AlertContact,
} from "@/lib/alertContacts";
import { publicHomeUrl } from "@/lib/publicOrigin";
import { SESSION_COOKIE_NAME } from "@/lib/sessionCookie";

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

async function requireApprovedEmail(req: NextRequest): Promise<
  | { ok: true; email: string }
  | { ok: false; response: NextResponse }
> {
  const email = readEmail(req);
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Restore your account first." },
        { status: 401 }
      ),
    };
  }
  const user = await findUserByEmail(email);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Account not found." },
        { status: 401 }
      ),
    };
  }
  // Allow pending users to save contacts so they can prepare before approval.
  return { ok: true, email: user.email };
}

export async function GET(req: NextRequest) {
  const access = await requireApprovedEmail(req);
  if (!access.ok) return access.response;
  const contacts = await readAlertContacts(access.email);
  return NextResponse.json({ success: true, ...contacts });
}

export async function POST(req: NextRequest) {
  const html = wantsHtml(req);
  const access = await requireApprovedEmail(req);
  if (!access.ok) {
    if (html) {
      return NextResponse.redirect(
        publicHomeUrl(req, {
          contact: "error",
          reason: "Restore your account first",
        }),
        303
      );
    }
    return access.response;
  }

  try {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    let list: string;
    let name: string;
    let phone: string;
    let action = "add";
    let index = -1;

    if (ct.includes("application/json")) {
      const body = await req.json();
      list = String(body.list || body.type || "safe").trim().toLowerCase();
      name = String(body.name || "").trim();
      phone = String(body.phone || "").trim();
      action = String(body.action || "add").trim().toLowerCase();
      index = Number(body.index);
    } else {
      const form = await req.formData();
      list = String(form.get("list") || form.get("type") || "safe")
        .trim()
        .toLowerCase();
      name = String(form.get("name") || "").trim();
      phone = String(form.get("phone") || "").trim();
      action = String(form.get("action") || "add").trim().toLowerCase();
      index = Number(form.get("index"));
    }

    const key = list === "emergency" ? "emergency" : "safe";
    const contacts = await readAlertContacts(access.email);

    if (action === "remove") {
      if (!Number.isFinite(index) || index < 0 || index >= contacts[key].length) {
        if (html) {
          return NextResponse.redirect(
            publicHomeUrl(req, {
              contact: "error",
              reason: "Contact not found",
            }),
            303
          );
        }
        return NextResponse.json(
          { success: false, error: "Contact not found" },
          { status: 404 }
        );
      }
      contacts[key] = contacts[key].filter((_, i) => i !== index);
      await writeAlertContacts(access.email, contacts);
      if (html) {
        return NextResponse.redirect(
          publicHomeUrl(req, { contact: "removed" }),
          303
        );
      }
      return NextResponse.json({ success: true, ...contacts });
    }

    if (!name || !phone) {
      if (html) {
        return NextResponse.redirect(
          publicHomeUrl(req, {
            contact: "error",
            reason: "Name and phone are required",
          }),
          303
        );
      }
      return NextResponse.json(
        { success: false, error: "Name and phone are required" },
        { status: 400 }
      );
    }

    const next: AlertContact = { name, phone };
    contacts[key] = [...contacts[key], next];
    await writeAlertContacts(access.email, contacts);

    if (html) {
      return NextResponse.redirect(
        publicHomeUrl(req, { contact: "added", list: key }),
        303
      );
    }
    return NextResponse.json({ success: true, ...contacts });
  } catch (error) {
    console.error(error);
    if (html) {
      return NextResponse.redirect(
        publicHomeUrl(req, {
          contact: "error",
          reason: "Could not save contact",
        }),
        303
      );
    }
    return NextResponse.json(
      { success: false, error: "Could not save contact" },
      { status: 500 }
    );
  }
}
