import { NextRequest, NextResponse } from "next/server";
import {
  bottleCustomerLogin,
  consolidateBottleShopIntoOwnerSilo,
  findBottleCustomerForRestore,
  restoreQueryVariants,
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

async function findUserAcrossVariants(query: string) {
  for (const variant of restoreQueryVariants(query)) {
    const user = await findUserForRestore(variant);
    if (user) return user;
  }
  return null;
}

/**
 * Restore for /bottleshop (username only):
 * approved Bottle Shop user, or ledger customer with matching username.
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

    // Merge any split silos first so ledger usernames are visible.
    try {
      await consolidateBottleShopIntoOwnerSilo();
    } catch (error) {
      console.error("[bottleshop restore consolidate]", error);
    }

    let user = await findUserAcrossVariants(query);
    if (user && user.status === "approved" && user.permissions?.bottleShop) {
      return jsonUser(publicUser(user));
    }

    const customer = await runWithDataOwnerAsync(
      getBottleShopOwnerEmail(),
      () => findBottleCustomerForRestore(query)
    );

    if (customer) {
      const login =
        bottleCustomerLogin(customer) ||
        (String(customer.name || "").includes("@")
          ? customer.name.trim().toLowerCase()
          : restoreQueryVariants(query).find((v) => v.includes("@")) || "");
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
          "No bottle shop account found for that username. Ask the pub to add you with a restore username like jsmith@ozintel.",
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
