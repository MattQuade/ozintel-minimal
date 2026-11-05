import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  bottleCustomerLogin,
  findBottleCustomerForRestore,
  listBottleProducts,
  restoreQueryVariants,
} from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { getDataDir } from "@/lib/dataPaths";
import {
  ensureApprovedBottleShopUser,
  matchUserForRestore,
  PLATFORM_ADMIN_EMAIL,
  publicUser,
  readUsersFast,
} from "@/lib/users";
import { setSessionEmailCookie } from "@/lib/sessionCookie";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function findCustomerAnywhere(query: string) {
  const ownersRoot = path.join(getDataDir(), "owners");
  let dirs: string[] = [];
  try {
    dirs = await fs.readdir(ownersRoot);
  } catch {
    dirs = [];
  }
  const owners = Array.from(
    new Set(
      [getBottleShopOwnerEmail(), PLATFORM_ADMIN_EMAIL, ...dirs]
        .map((e) => String(e || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
  for (const owner of owners) {
    try {
      const customer = await runWithDataOwnerAsync(owner, () =>
        findBottleCustomerForRestore(query)
      );
      if (customer) return { customer, owner };
    } catch {
      // try next silo
    }
  }
  return null;
}

/**
 * Bottle shop restore — must stay fast and return the catalogue in-band
 * so the phone unlocks even if cookies are flaky.
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
    const users = await readUsersFast();
    let user = null as ReturnType<typeof matchUserForRestore>;
    for (const variant of variants) {
      user = matchUserForRestore(variant, users);
      if (user) break;
    }

    if (user && user.status === "approved" && user.permissions?.bottleShop) {
      const products = await runWithDataOwnerAsync(
        getBottleShopOwnerEmail(),
        () => listBottleProducts({ activeOnly: true })
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

    const found = await findCustomerAnywhere(query);
    if (found) {
      const login =
        bottleCustomerLogin(found.customer) ||
        variants.find((v) => v.includes("@")) ||
        "";
      if (!login) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This ledger entry has no username. Re-add them with a restore username like jsmith@ozintel.",
          },
          { status: 400 }
        );
      }
      const next = await ensureApprovedBottleShopUser({
        email: login,
        name: found.customer.name,
        phone: found.customer.phone,
      });
      const products = await runWithDataOwnerAsync(
        getBottleShopOwnerEmail(),
        () => listBottleProducts({ activeOnly: true })
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

    // Last resort for pub usernames only (*@ozintel): if the user row exists,
    // approve Bottle Shop and open. Does not auto-grant arbitrary emails.
    const emailLike = variants.find((v) => v.endsWith("@ozintel"));
    if (emailLike) {
      const next = await ensureApprovedBottleShopUser({
        email: emailLike,
        name: user?.name || emailLike,
        phone: user?.phone,
      });
      const products = await runWithDataOwnerAsync(
        getBottleShopOwnerEmail(),
        () => listBottleProducts({ activeOnly: true })
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
          "No bottle shop account for that username. In the Bottle Shop ledger, Delete them if listed, then Add customer with username exactly tbong@ozintel (use the Username field).",
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
