import { NextRequest } from "next/server";
import { findUserByEmail, type User } from "@/lib/users";
import {
  decodeSessionEmailCookie,
  SESSION_COOKIE_NAME,
} from "@/lib/sessionCookie";

export type BottleShopGate =
  | {
      ok: true;
      via: "user";
      displayName: string;
      customerId: string;
      user: User;
    }
  | { ok: false; error: string };

export function readSessionEmail(req: Request): string {
  if (req instanceof NextRequest) {
    const fromCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (fromCookie) return decodeSessionEmailCookie(fromCookie);
  }
  const header = req.headers.get("cookie") || "";
  const match = header.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`)
  );
  if (!match?.[1]) return "";
  return decodeSessionEmailCookie(match[1]);
}

/**
 * Access only for a restored, approved user with Component Permission
 * "Bottle Shop". Invite codes are no longer used.
 */
export async function resolveBottleShopGate(
  req: Request
): Promise<BottleShopGate> {
  const email = readSessionEmail(req);
  if (!email) {
    return {
      ok: false,
      error: "Restore your account to open the bottle shop.",
    };
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return {
      ok: false,
      error: "Restore your account to open the bottle shop.",
    };
  }
  if (user.status !== "approved") {
    return {
      ok: false,
      error: "Account found but not approved yet.",
    };
  }
  if (!user.permissions?.bottleShop) {
    return {
      ok: false,
      error:
        "Bottle Shop access is not enabled on this account yet. Ask the pub to tick Bottle Shop.",
    };
  }

  return {
    ok: true,
    via: "user",
    displayName: user.name,
    customerId: user.email,
    user,
  };
}
