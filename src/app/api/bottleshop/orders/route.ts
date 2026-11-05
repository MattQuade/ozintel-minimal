import { NextRequest, NextResponse } from "next/server";
import { placeBottleOrder } from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import {
  getBottleShopNotifyPhone,
  getBottleShopOwnerEmail,
  sendViaMessageMedia,
} from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public reserve/order — decrements stock, writes ops ledger, SMS owner. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await runWithDataOwnerAsync(getBottleShopOwnerEmail(), () =>
      placeBottleOrder({
        items: Array.isArray(body.items) ? body.items : [],
        customerName: body.customerName,
        customerNote: body.customerNote,
      })
    );

    let sms: { ok: boolean; mocked?: boolean; error?: string } = { ok: false };
    try {
      const sent = await sendViaMessageMedia(
        getBottleShopNotifyPhone(),
        result.smsBody
      );
      sms = { ok: true, mocked: sent.mocked };
    } catch (error) {
      console.error("[bottleshop sms]", error);
      sms = {
        ok: false,
        error: error instanceof Error ? error.message : "SMS failed",
      };
    }

    return NextResponse.json({
      success: true,
      order: result.order,
      products: result.products,
      sms,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to place order",
      },
      { status: 400 }
    );
  }
}
