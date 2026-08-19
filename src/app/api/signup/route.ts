import { NextRequest, NextResponse } from "next/server";
import { publicUser, readUsers, writeUsers, type User } from "@/lib/users";
import { notifyAdminNewSignup } from "@/lib/sms/sendSms";
import { publicHomeUrl } from "@/lib/publicOrigin";
import { setSessionEmailCookie } from "@/lib/sessionCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function wantsHtmlRedirect(req: NextRequest): boolean {
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

function redirectHome(
  req: NextRequest,
  params: Record<string, string>,
  cookieEmail?: string
) {
  const res = NextResponse.redirect(publicHomeUrl(req, params), 303);
  if (cookieEmail) setSessionEmailCookie(res, cookieEmail);
  return res;
}

async function parseBody(req: NextRequest): Promise<{
  name: string;
  email: string;
  phone: string;
}> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    const body = await req.json();
    return {
      name: String(body.name || "").trim(),
      email: String(body.email || "").trim(),
      phone: String(body.phone || "").trim(),
    };
  }
  const form = await req.formData();
  return {
    name: String(form.get("name") || "").trim(),
    email: String(form.get("email") || "").trim(),
    phone: String(form.get("phone") || "").trim(),
  };
}

/**
 * Sign-up that works with native form POST (no JS) and JSON fetch.
 * Admin SMS is fire-and-forget so a hung MessageMedia call cannot block
 * the confirmation / redirect.
 */
export async function POST(req: NextRequest) {
  const html = wantsHtmlRedirect(req);

  try {
    const { name, email, phone } = await parseBody(req);

    if (!name || !email || !phone) {
      if (html) {
        return redirectHome(req, {
          signup: "error",
          reason: "Name, email, and phone are required",
        });
      }
      return NextResponse.json(
        { success: false, error: "Name, email, and phone are required" },
        { status: 400 }
      );
    }

    const users = await readUsers();
    const existing = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (existing) {
      if (html) {
        return redirectHome(req, { signup: "exists" }, existing.email);
      }
      return NextResponse.json(
        { success: false, error: "User already exists" },
        { status: 409 }
      );
    }

    const user: User = {
      name,
      email,
      phone,
      status: "pending",
      smsCount: 0,
      smsMonth: new Date().toISOString().slice(0, 7),
      permissions: {
        accounting: false,
        pubOps: false,
        forestryOps: false,
      },
      shares: { pubOps: [] },
      lastAlert: null,
    };
    users.push(user);
    await writeUsers(users);

    // Never await — MessageMedia hangs must not block signup confirmation.
    notifyAdminNewSignup(user);

    if (html) {
      return redirectHome(req, { signup: "ok" }, user.email);
    }

    const res = NextResponse.json({
      success: true,
      user: publicUser(user),
      users: users.map(publicUser),
    });
    setSessionEmailCookie(res, user.email);
    return res;
  } catch (error) {
    console.error(error);
    if (html) {
      return redirectHome(req, {
        signup: "error",
        reason: "Failed to create user",
      });
    }
    return NextResponse.json(
      { success: false, error: "Failed to create user" },
      { status: 500 }
    );
  }
}
