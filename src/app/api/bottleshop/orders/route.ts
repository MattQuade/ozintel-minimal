import { NextRequest, NextResponse } from "next/server";
import {
  countReservedBottleOrders,
  placeBottleOrder,
} from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { resolveBottleShopGate } from "@/lib/operations/pub/bottleShopAccess";
import {
  getBottleShopNotifyPhone,
  getBottleShopOwnerEmail,
  sendViaMessageMedia,
} from "@/lib/sms/sendSms";
import { sendPushToOwner } from "@/lib/push/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reserve for Bottle Shop users or invite-code customers. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ownerEmail = getBottleShopOwnerEmail();
    const explicitCode = String(body.accessCode || body.code || "").trim();
    const gate = await runWithDataOwnerAsync(ownerEmail, () =>
      resolveBottleShopGate(req, explicitCode)
    );
    if (!gate.ok) {
      return NextResponse.json(
        { success: false, error: gate.error, needsAccess: true },
        { status: 403 }
      );
    }

    const result = await runWithDataOwnerAsync(ownerEmail, () =>
      placeBottleOrder({
        items: Array.isArray(body.items) ? body.items : [],
        customerName: body.customerName || gate.displayName,
        customerNote: body.customerNote,
        accessCode: gate.via === "code" ? gate.accessCode : undefined,
      })
    );

    const reservedCount = await runWithDataOwnerAsync(ownerEmail, () =>
      countReservedBottleOrders()
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

    let push: { sent: number; failed: number; error?: string } = {
      sent: 0,
      failed: 0,
    };
    try {
      push = await sendPushToOwner(ownerEmail, {
        title: "Bottle shop order",
        body: result.smsBody.replace(/\n/g, " · "),
        url: "/operations/pub/bottleshop",
        badgeCount: reservedCount,
      });
    } catch (error) {
      console.error("[bottleshop push]", error);
      push = {
        sent: 0,
        failed: 1,
        error: error instanceof Error ? error.message : "Push failed",
      };
    }

    return NextResponse.json({
      success: true,
      order: result.order,
      products: result.products,
      sms,
      push,
      reservedCount,
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
