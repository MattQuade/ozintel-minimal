import { NextRequest, NextResponse } from "next/server";
import {
  bottleCustomerLogin,
  findBottleCustomerForRestore,
  restoreQueryVariants,
} from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import {
  ensureApprovedBottleShopUser,
  matchUserForRestore,
  PLATFORM_ADMIN_EMAIL,
  publicUser,
  readUsers,
} from "@/lib/users";
import { setSessionEmailCookie } from "@/lib/sessionCookie";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonUser(user: ReturnType<typeof publicUser>) {
  const res = NextResponse.json({
    success: true,
    via: "user",
    user,
  });
  setSessionEmailCookie(res, user.email);
  return res;
}

async function findCustomerFast(query: string) {
  const owners = Array.from(
    new Set(
      [getBottleShopOwnerEmail(), PLATFORM_ADMIN_EMAIL]
        .map((e) => String(e || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
  for (const owner of owners) {
    const customer = await runWithDataOwnerAsync(owner, () =>
      findBottleCustomerForRestore(query)
    );
    if (customer) return customer;
  }
  return null;
}

/**
 * Fast restore only — no silo merge (that was hanging phones).
 * 1) users.json match with Bottle Shop permission
 * 2) ledger customer in the pub owner silo → approve Bottle Shop login
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = String(
      body.query || body.email || body.login || body.restore || ""
    ).trim();
    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: "Enter your username (e.g. jsmith@ozintel).",
        },
        { status: 400 }
      );
    }

    const variants = restoreQueryVariants(query);
    const users = await readUsers();
    let user = null;
    for (const variant of variants) {
      user = matchUserForRestore(variant, users);
      if (user) break;
    }

    if (user && user.status === "approved" && user.permissions?.bottleShop) {
      return jsonUser(publicUser(user));
    }

    const customer = await findCustomerFast(query);

    if (customer) {
      const login =
        bottleCustomerLogin(customer) ||
        variants.find((v) => v.includes("@")) ||
        "";
      if (!login) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This ledger entry has no username. Ask the pub to add a restore username (e.g. jsmith@ozintel).",
          },
          { status: 400 }
        );
      }
      const next = await ensureApprovedBottleShopUser({
        email: login,
        name: customer.name,
        phone: customer.phone,
      });
      return jsonUser(publicUser(next));
    }

    // Username typed with @ but only exists as a normal user without ledger row:
    // if they already have Bottle Shop from Admin, handled above. Otherwise explain.
    if (user && user.status !== "approved") {
      return NextResponse.json(
        {
          success: false,
          error: "Account found but not approved yet.",
          user: publicUser(user),
        },
        { status: 403 }
      );
    }
    if (user && !user.permissions?.bottleShop) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Account found, but Bottle Shop is not enabled yet. Ask the pub to tick Bottle Shop, or add them in the Bottle Shop ledger with this username.",
          user: publicUser(user),
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "No bottle shop account found for that username. Add them in the Bottle Shop ledger with username jsmith@ozintel-style login.",
      },
      { status: 404 }
    );
  } catch (error) {
    console.error("[bottleshop restore]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not restore bottle shop account.",
      },
      { status: 500 }
    );
  }
}
