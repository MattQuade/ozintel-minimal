import { NextRequest } from "next/server";
import { findBottleCustomerByCode } from "@/lib/operations/pub/bottleshop";
import { findUserByEmail, type User } from "@/lib/users";
import { SESSION_COOKIE_NAME } from "@/lib/sessionCookie";

export type BottleShopGate =
  | {
      ok: true;
      via: "code" | "user";
      displayName: string;
      customerId?: string;
      accessCode?: string;
      user?: User;
    }
  | { ok: false; error: string };

function readSessionEmail(req: Request): string {
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

export function readBottleShopCodeFromRequest(req: Request): string {
  const header = req.headers.get("x-bottleshop-code") || "";
  if (header.trim()) return header.trim();
  try {
    const url = new URL(req.url);
    return (url.searchParams.get("code") || "").trim();
  } catch {
    return "";
  }
}

export async function requireBottleShopCustomer(accessCode: string) {
  const customer = await findBottleCustomerByCode(accessCode);
  if (!customer) {
    return {
      ok: false as const,
      error: "Enter a valid invite code from the pub to use the bottle shop.",
    };
  }
  return { ok: true as const, customer };
}

/**
 * Access if:
 * - restored/approved user has Component Permission "Bottle Shop", or
 * - a valid manual invite code is provided.
 */
export async function resolveBottleShopGate(
  req: Request,
  explicitCode?: string
): Promise<BottleShopGate> {
  const email = readSessionEmail(req);
  if (email) {
    const user = await findUserByEmail(email);
    if (
      user &&
      user.status === "approved" &&
      Boolean(user.permissions?.bottleShop)
    ) {
      return {
        ok: true,
        via: "user",
        displayName: user.name,
        customerId: user.email,
        user,
      };
    }
  }

  const accessCode =
    String(explicitCode || "").trim() || readBottleShopCodeFromRequest(req);
  if (accessCode) {
    const customer = await findBottleCustomerByCode(accessCode);
    if (customer) {
      return {
        ok: true,
        via: "code",
        displayName: customer.name,
        customerId: customer.id,
        accessCode: customer.accessCode,
      };
    }
    return {
      ok: false,
      error: "Enter a valid invite code from the pub to use the bottle shop.",
    };
  }

  return {
    ok: false,
    error:
      "Restore your account (or enter an invite code) to open the bottle shop.",
  };
}
