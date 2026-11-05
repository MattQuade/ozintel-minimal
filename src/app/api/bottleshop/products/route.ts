import { NextRequest, NextResponse } from "next/server";
import { listBottleProducts } from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { resolveBottleShopGate } from "@/lib/operations/pub/bottleShopAccess";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Catalogue for Bottle Shop permission holders or invite-code customers. */
export async function GET(req: NextRequest) {
  try {
    const ownerEmail = getBottleShopOwnerEmail();
    const gate = await runWithDataOwnerAsync(ownerEmail, () =>
      resolveBottleShopGate(req)
    );
    if (!gate.ok) {
      return NextResponse.json(
        { success: false, error: gate.error, needsAccess: true },
        { status: 403 }
      );
    }
    const products = await runWithDataOwnerAsync(ownerEmail, () =>
      listBottleProducts({ activeOnly: true })
    );
    return NextResponse.json({
      success: true,
      products,
      customer: { id: gate.customerId, name: gate.displayName },
      via: gate.via,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to load bottle shop" },
      { status: 500 }
    );
  }
}
