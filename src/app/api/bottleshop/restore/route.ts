import { NextRequest, NextResponse } from "next/server";
import {
  bottleCustomerLogin,
  findBottleCustomerForRestore,
  syncBottleShopCustomerLogins,
} from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import {
  ensureApprovedBottleShopUser,
  findUserForRestore,
  publicUser,
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

/**
 * Restore for /bottleshop (username only — no invite codes):
 * 1) Existing approved user with Bottle Shop permission, or
 * 2) Active ledger customer with a matching username/name/note/phone —
 *    provisions an approved Bottle Shop login.
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
          error: "Enter your username (e.g. tbong@ozintel).",
        },
        { status: 400 }
      );
    }

    let user = await findUserForRestore(query);
    if (user && user.status === "approved" && user.permissions?.bottleShop) {
      return jsonUser(publicUser(user));
    }

    // Ledger customers live in the configured pub bottle-shop owner silo.
    const customer = await runWithDataOwnerAsync(
      getBottleShopOwnerEmail(),
      async () => {
        await syncBottleShopCustomerLogins();
        return findBottleCustomerForRestore(query);
      }
    );

    if (customer) {
      const login =
        bottleCustomerLogin(customer) ||
        (String(customer.name || "").includes("@")
          ? customer.name.trim().toLowerCase()
          : query.includes("@")
            ? query.trim().toLowerCase()
            : "");
      if (!login) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This ledger entry has no username. Ask the pub to add a restore username (e.g. tbong@ozintel).",
          },
          { status: 400 }
        );
      }
      user = await ensureApprovedBottleShopUser({
        email: login,
        name: customer.name,
        phone: customer.phone,
      });
      return jsonUser(publicUser(user));
    }

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
            "Account found, but Bottle Shop is not enabled yet. Ask the pub to tick Bottle Shop on your account.",
          user: publicUser(user),
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "No bottle shop account found for that username. Ask the pub to add you with a restore username.",
      },
      { status: 404 }
    );
  } catch (error) {
    console.error(error);
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
