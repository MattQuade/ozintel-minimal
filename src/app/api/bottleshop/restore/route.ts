import { NextRequest, NextResponse } from "next/server";
import {
  bottleCustomerLogin,
  findBottleCustomerForRestore,
} from "@/lib/operations/pub/bottleshop";
import {
  ensureApprovedBottleShopUser,
  findUserForRestore,
  publicUser,
} from "@/lib/users";
import { setSessionEmailCookie } from "@/lib/sessionCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Restore for /bottleshop:
 * 1) Existing OzIntel user with Bottle Shop permission, or
 * 2) Active Bottle Shop ledger customer (username / name / note / phone),
 *    which also provisions an approved Bottle Shop login when possible.
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
      const res = NextResponse.json({
        success: true,
        via: "user",
        user: publicUser(user),
      });
      setSessionEmailCookie(res, user.email);
      return res;
    }

    const customer = await findBottleCustomerForRestore(query);
    if (!customer) {
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
              "Account restored, but Bottle Shop access is not enabled yet. Ask the pub to tick Bottle Shop on your account — or add you in the Bottle Shop ledger with a username.",
            user: publicUser(user),
          },
          { status: 403 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error:
            "No bottle shop account found. Use the username from the pub ledger (e.g. tbong@ozintel), or an invite code.",
        },
        { status: 404 }
      );
    }

    const login =
      bottleCustomerLogin(customer) ||
      (customer.name.includes("@")
        ? customer.name.trim().toLowerCase()
        : "");

    if (login) {
      user = await ensureApprovedBottleShopUser({
        email: login,
        name: customer.name,
        phone: customer.phone,
      });
      const res = NextResponse.json({
        success: true,
        via: "user",
        user: publicUser(user),
        accessCode: customer.accessCode,
        customer: {
          id: customer.id,
          name: customer.name,
          login,
        },
      });
      setSessionEmailCookie(res, user.email);
      return res;
    }

    // Name-only ledger entry — unlock with invite code this session.
    return NextResponse.json({
      success: true,
      via: "code",
      accessCode: customer.accessCode,
      customer: {
        id: customer.id,
        name: customer.name,
        login: "",
      },
    });
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
