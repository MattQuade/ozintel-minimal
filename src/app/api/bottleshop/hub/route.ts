import { NextResponse } from "next/server";
import { listBottleHubButtons } from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public hub promo buttons (no restore required). */
export async function GET() {
  try {
    const buttons = await runWithDataOwnerAsync(getBottleShopOwnerEmail(), () =>
      listBottleHubButtons()
    );
    return NextResponse.json(
      { success: true, buttons },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to load hub buttons" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
