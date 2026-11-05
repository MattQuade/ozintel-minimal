import { NextRequest, NextResponse } from "next/server";
import { listBottleProducts } from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { resolveBottleShopGate } from "@/lib/operations/pub/bottleShopAccess";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Catalogue for restored users with Bottle Shop permission. */
export async function GET(req: NextRequest) {
  try {
    const gate = await resolveBottleShopGate(req);
    if (!gate.ok) {
      return NextResponse.json(
        { success: false, error: gate.error, needsAccess: true },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const products = await runWithDataOwnerAsync(
      getBottleShopOwnerEmail(),
      () => listBottleProducts({ activeOnly: true })
    );
    return NextResponse.json(
      {
        success: true,
        products,
        customer: { id: gate.customerId, name: gate.displayName },
        via: gate.via,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to load bottle shop" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
