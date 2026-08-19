import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, publicUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "ozintel_user_email";

function readEmailFromRequest(req: NextRequest): string {
  const fromCookie = req.cookies.get(COOKIE_NAME)?.value;
  if (fromCookie) {
    try {
      return decodeURIComponent(fromCookie).trim();
    } catch {
      return fromCookie.trim();
    }
  }
  return "";
}

/**
 * Lightweight current-user lookup from the session cookie.
 * Used by Accounting / Ops access checks so mobile clients do not need
 * to download and scan the full /api/users list.
 */
export async function GET(req: NextRequest) {
  try {
    const email = readEmailFromRequest(req);
    if (!email) {
      return NextResponse.json(
        { success: false, authenticated: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { success: false, authenticated: false, error: "Account not found" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      user: publicUser(user),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, authenticated: false, error: "Failed to load profile" },
      { status: 500 }
    );
  }
}
