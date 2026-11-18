import { NextRequest, NextResponse } from "next/server";
import { getCoffeeOrderReply } from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The reply for the coffee order this phone just placed. No customer list. */
export async function GET(req: NextRequest) {
  try {
    const id = String(req.nextUrl.searchParams.get("id") || "").trim();
    const reply = await runWithDataOwnerAsync(getBottleShopOwnerEmail(), () =>
      getCoffeeOrderReply(id)
    );
    return NextResponse.json(
      { success: true, reply },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Could not load the reply" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
