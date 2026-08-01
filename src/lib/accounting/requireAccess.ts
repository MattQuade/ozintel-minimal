import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, type User, type UserPermissions } from "@/lib/users";

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

async function requirePermission(
  req: Request,
  permission: keyof UserPermissions,
  labels: { signIn: string; denied: string }
): Promise<{ ok: true; user: User } | { ok: false; response: NextResponse }> {
  const email = readEmailFromRequest(req);
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: labels.signIn },
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

  if (!user.permissions?.[permission]) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: labels.denied },
        { status: 403 }
      ),
    };
  }

  return { ok: true, user };
}

/**
 * Server-side gate for accounting APIs.
 * Requires restored cookie + approved user + permissions.accounting.
 */
export async function requireAccountingAccess(
  req: Request
): Promise<{ ok: true; user: User } | { ok: false; response: NextResponse }> {
  return requirePermission(req, "accounting", {
    signIn: "Sign in / restore your account to use Accounting.",
    denied: "Accounting access requires admin approval.",
  });
}

/**
 * Server-side gate for Pub / Forestry ops APIs.
 * Requires restored cookie + approved user + the matching ops permission.
 */
export async function requireOpsAccess(
  req: Request,
  permission: "pubOps" | "forestryOps"
): Promise<{ ok: true; user: User } | { ok: false; response: NextResponse }> {
  const label = permission === "pubOps" ? "Pub Operations" : "Forestry Operations";
  return requirePermission(req, permission, {
    signIn: `Sign in / restore your account to use ${label}.`,
    denied: `${label} access requires admin approval.`,
  });
}
