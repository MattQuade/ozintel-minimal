/**
 * Find Someone — free, restore-only access (no Accounting / paid permission).
 */

import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, type User } from "@/lib/users";
import { SESSION_COOKIE_NAME } from "@/lib/sessionCookie";

function readEmailFromRequest(req: Request): string {
  if (req instanceof NextRequest) {
    const fromCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (fromCookie) {
      try {
        return decodeURIComponent(fromCookie).trim();
      } catch {
        return fromCookie.trim();
      }
    }
  }
  const header = req.headers.get("cookie") || "";
  const match = header.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`)
  );
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

export type FindSomeoneAccess =
  | { ok: true; user: User; email: string }
  | { ok: false; response: NextResponse };

/** Approved restored account — free pathway, no paid module flag. */
export async function requireFindSomeoneAccess(
  req: Request
): Promise<FindSomeoneAccess> {
  const email = readEmailFromRequest(req);
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Restore your account on the home page to use Find Someone.",
        },
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
        {
          success: false,
          error: "Account must be approved before using Find Someone.",
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true, user, email: user.email };
}
