import { NextRequest, NextResponse } from "next/server";
import {
  findUserByEmail,
  listPubOpsShareOwnersFor,
  type User,
  type UserPermissions,
} from "@/lib/users";
import {
  normalizeOwnerEmail,
  runWithDataOwnerAsync,
} from "@/lib/dataOwnerContext";
import { ensureOwnerSiloMigration } from "@/lib/migrateOwnerSilos";
import { ensureOwnerAccountingSilo } from "@/lib/accounting/store";

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

export type AccessOk = {
  ok: true;
  user: User;
  /** Owner email used for siloed module data paths. */
  dataOwnerEmail: string;
  /** Run module I/O inside this owner's data silo. */
  run: <T>(fn: () => Promise<T>) => Promise<T>;
};

export type AccessResult = AccessOk | { ok: false; response: NextResponse };

async function requirePermission(
  req: Request,
  permission: keyof UserPermissions,
  labels: { signIn: string; denied: string }
): Promise<{ ok: true; user: User } | { ok: false; response: NextResponse }> {
  await ensureOwnerSiloMigration();

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

function withOwnerRun(user: User, dataOwnerEmail: string): AccessOk {
  const owner = normalizeOwnerEmail(dataOwnerEmail);
  return {
    ok: true,
    user,
    dataOwnerEmail: owner,
    run: (fn) => runWithDataOwnerAsync(owner, fn),
  };
}

/**
 * Server-side gate for accounting APIs.
 * Requires restored cookie + approved user + permissions.accounting.
 * Data is always siloed to the signed-in user. Accounting is never shared.
 */
export async function requireAccountingAccess(
  req: Request
): Promise<AccessResult> {
  const access = await requirePermission(req, "accounting", {
    signIn: "Sign in / restore your account to use Accounting.",
    denied: "Accounting access requires admin approval.",
  });
  if (!access.ok) return access;
  await ensureOwnerAccountingSilo(access.user.email);
  return withOwnerRun(access.user, access.user.email);
}

/**
 * Resolve whose Pub Ops keg store this actor should use.
 * - Own silo by default
 * - If another user shared Pub Ops with this actor, use that owner's silo
 * - Optional ?owner= / body.ownerEmail when multiple shares exist
 */
export async function resolvePubOpsDataOwner(
  actor: User,
  requestedOwner?: string | null
): Promise<string> {
  const self = normalizeOwnerEmail(actor.email);
  const sharedFrom = await listPubOpsShareOwnersFor(self);
  const requested = requestedOwner
    ? normalizeOwnerEmail(requestedOwner)
    : "";

  if (requested) {
    if (requested === self) return self;
    if (sharedFrom.some((e) => e === requested)) return requested;
    throw new Error("You do not have access to that Pub Ops data owner.");
  }

  // Shared-only users (and anyone shared into exactly one owner) open the shared store.
  if (sharedFrom.length === 1) return sharedFrom[0];
  if (sharedFrom.length > 1) return sharedFrom[0];
  return self;
}

/**
 * Server-side gate for Pub / Forestry ops APIs.
 * Requires restored cookie + approved user + the matching ops permission.
 * Forestry data is siloed to the signed-in user.
 * Pub Ops may open another owner's silo when shared.
 */
export async function requireOpsAccess(
  req: Request,
  permission: "pubOps" | "forestryOps"
): Promise<AccessResult> {
  const label =
    permission === "pubOps" ? "Pub Operations" : "Forestry Operations";
  const access = await requirePermission(req, permission, {
    signIn: `Sign in / restore your account to use ${label}.`,
    denied: `${label} access requires admin approval.`,
  });
  if (!access.ok) return access;

  if (permission === "forestryOps") {
    return withOwnerRun(access.user, access.user.email);
  }

  try {
    const url = new URL(req.url);
    const requested =
      url.searchParams.get("owner") ||
      url.searchParams.get("ownerEmail") ||
      "";
    const owner = await resolvePubOpsDataOwner(access.user, requested || null);
    return withOwnerRun(access.user, owner);
  } catch (err) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "Pub Ops owner denied",
        },
        { status: 403 }
      ),
    };
  }
}
