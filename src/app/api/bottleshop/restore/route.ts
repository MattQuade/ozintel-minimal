import { NextRequest, NextResponse } from "next/server";
import {
  bottleCustomerLogin,
  findBottleCustomerForRestore,
  listBottleProducts,
  restoreQueryVariants,
} from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import {
  ensureApprovedBottleShopUser,
  matchUserForRestore,
  publicUser,
  readUsersFast,
} from "@/lib/users";
import { setSessionEmailCookie } from "@/lib/sessionCookie";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fast bottle-shop restore. No silo scans, no migrations.
 * Returns catalogue in-band so the phone unlocks in one round-trip.
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

    const ownerEmail = getBottleShopOwnerEmail();
    const variants = restoreQueryVariants(query);
    const users = await readUsersFast();
    let user = null as ReturnType<typeof matchUserForRestore>;
    for (const variant of variants) {
      user = matchUserForRestore(variant, users);
      if (user) break;
    }

    if (user && user.status === "approved" && user.permissions?.bottleShop) {
      const products = await runWithDataOwnerAsync(ownerEmail, () =>
        listBottleProducts({ activeOnly: true })
      );
      const res = NextResponse.json({
        success: true,
        via: "user",
        user: publicUser(user),
        products,
      });
      setSessionEmailCookie(res, user.email);
      return res;
    }

    const customer = await runWithDataOwnerAsync(ownerEmail, () =>
      findBottleCustomerForRestore(query)
    );
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
              "This ledger entry has no username. Re-add with a restore username like jsmith@ozintel.",
          },
          { status: 400 }
        );
      }
      const next = await ensureApprovedBottleShopUser({
        email: login,
        name: customer.name,
        phone: customer.phone,
      });
      const products = await runWithDataOwnerAsync(ownerEmail, () =>
        listBottleProducts({ activeOnly: true })
      );
      const res = NextResponse.json({
        success: true,
        via: "user",
        user: publicUser(next),
        products,
      });
      setSessionEmailCookie(res, next.email);
      return res;
    }

    // Pub usernames only (*@ozintel): create/approve and open — one step.
    const emailLike = variants.find((v) => v.endsWith("@ozintel"));
    if (emailLike) {
      const next = await ensureApprovedBottleShopUser({
        email: emailLike,
        name: user?.name || emailLike,
        phone: user?.phone,
      });
      const products = await runWithDataOwnerAsync(ownerEmail, () =>
        listBottleProducts({ activeOnly: true })
      );
      const res = NextResponse.json({
        success: true,
        via: "user",
        user: publicUser(next),
        products,
      });
      setSessionEmailCookie(res, next.email);
      return res;
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

    return NextResponse.json(
      {
        success: false,
        error:
          "No bottle shop account for that username. Add them in the Bottle Shop ledger with a Username like jsmith@ozintel.",
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
