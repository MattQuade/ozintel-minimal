import { NextRequest, NextResponse } from "next/server";
import { findUserForRestore, publicUser } from "@/lib/users";
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

async function parseQuery(req: NextRequest): Promise<string> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    const body = await req.json();
    return String(
      body.query || body.email || body.phone || body.name || body.restore || ""
    ).trim();
  }
  const form = await req.formData();
  return String(
    form.get("query") ||
      form.get("restore") ||
      form.get("email") ||
      form.get("phone") ||
      form.get("name") ||
      ""
  ).trim();
}

export async function POST(req: NextRequest) {
  const html = wantsHtmlRedirect(req);

  try {
    const query = await parseQuery(req);
    if (!query) {
      if (html) {
        return NextResponse.redirect(
          publicHomeUrl(req, {
            restore: "error",
            reason: "Enter email, phone, or full name",
          }),
          303
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: "Enter the email, phone, or full name used at signup.",
        },
        { status: 400 }
      );
    }

    const user = await findUserForRestore(query);
    if (!user) {
      if (html) {
        return NextResponse.redirect(
          publicHomeUrl(req, {
            restore: "missing",
            reason: "No account found with those details",
          }),
          303
        );
      }
      return NextResponse.json(
        {
          success: false,
          error:
            "No account found with those details. Use the email, mobile number, or exact full name from signup.",
        },
        { status: 404 }
      );
    }

    if (html) {
      const res = NextResponse.redirect(
        publicHomeUrl(req, { restore: "ok" }),
        303
      );
      setSessionEmailCookie(res, user.email);
      return res;
    }

    const res = NextResponse.json({
      success: true,
      user: publicUser(user),
    });
    setSessionEmailCookie(res, user.email);
    return res;
  } catch (error) {
    console.error(error);
    if (html) {
      return NextResponse.redirect(
        publicHomeUrl(req, {
          restore: "error",
          reason: "Could not restore account",
        }),
        303
      );
    }
    return NextResponse.json(
      { success: false, error: "Could not restore account. Please try again." },
      { status: 500 }
    );
  }
}
