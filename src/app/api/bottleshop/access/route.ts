import { NextRequest, NextResponse } from "next/server";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { requireBottleShopCustomer } from "@/lib/operations/pub/bottleShopAccess";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verify a manually issued bottle-shop invite code. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const accessCode = String(body.accessCode || body.code || "").trim();
    const result = await runWithDataOwnerAsync(getBottleShopOwnerEmail(), () =>
      requireBottleShopCustomer(accessCode)
    );
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 403 }
      );
    }
    return NextResponse.json({
      success: true,
      customer: {
        id: result.customer.id,
        name: result.customer.name,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Could not verify access code" },
      { status: 500 }
    );
  }
}
