import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, type User } from "@/lib/users";

const COOKIE_NAME = "ozintel_user_email";

function readEmailFromRequest(req: Request): string {
  if (req instanceof NextRequest) {
    const fromCookie = req.cookies.get(COOKIE_NAME)?.value;
    if (fromCookie) return decodeURIComponent(fromCookie).trim();
  }

  const header = req.headers.get("cookie") || "";
  const match = header.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`)
  );
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

/**
 * Server-side gate for accounting APIs.
 * Requires restored cookie + approved user + permissions.accounting.
 */
export async function requireAccountingAccess(
  req: Request
): Promise<{ ok: true; user: User } | { ok: false; response: NextResponse }> {
  const email = readEmailFromRequest(req);
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Sign in / restore your account to use Accounting." },
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

  if (user.status !== "approved") {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Account is not approved." },
        { status: 403 }
      ),
    };
  }

  if (!user.permissions?.accounting) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Accounting access requires admin approval.",
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, user };
}
