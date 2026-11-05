import { NextResponse } from "next/server";
import { listBottleProducts } from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public catalogue for /bottleshop — active products in the pub owner silo. */
export async function GET() {
  try {
    const products = await runWithDataOwnerAsync(
      getBottleShopOwnerEmail(),
      () => listBottleProducts({ activeOnly: true })
    );
    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to load bottle shop" },
      { status: 500 }
    );
  }
}
