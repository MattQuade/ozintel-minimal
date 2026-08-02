import { NextRequest, NextResponse } from "next/server";
import { findUserForRestore, publicUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = String(body.query || body.email || body.phone || body.name || "").trim();
    if (!query) {
      return NextResponse.json(
        { success: false, error: "Enter the email, phone, or full name used at signup." },
        { status: 400 }
      );
    }

    const user = await findUserForRestore(query);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No account found with those details. Use the email, mobile number, or exact full name from signup.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: publicUser(user),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Could not restore account. Please try again." },
      { status: 500 }
    );
  }
}
