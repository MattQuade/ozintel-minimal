import { NextRequest, NextResponse } from "next/server";
import {
  countReservedBottleOrders,
  placeBottleOrder,
} from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { resolveBottleShopGate } from "@/lib/operations/pub/bottleShopAccess";
import { resolveCoffeeVanNotifyPhone } from "@/lib/users";
import {
  getBottleShopNotifyPhone,
  getBottleShopOwnerEmail,
  sendViaMessageMedia,
} from "@/lib/sms/sendSms";
import { sendPushToOwner } from "@/lib/push/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reserve for restored Bottle Shop users only. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const gate = await resolveBottleShopGate(req);
    if (!gate.ok) {
      return NextResponse.json(
        { success: false, error: gate.error, needsAccess: true },
        { status: 403 }
      );
    }

    const ownerEmail = getBottleShopOwnerEmail();
    const result = await runWithDataOwnerAsync(ownerEmail, () =>
      placeBottleOrder({
        items: Array.isArray(body.items) ? body.items : [],
        customerName: body.customerName || gate.displayName,
        customerNote: body.customerNote,
        customerId: gate.customerId,
      })
    );

    const reservedCount = await runWithDataOwnerAsync(ownerEmail, () =>
      countReservedBottleOrders()
    );

    let sms: { ok: boolean; mocked?: boolean; error?: string } = { ok: false };
    const smsErrors: string[] = [];
    if (result.coffeeSmsBody) {
      try {
        const phone = await resolveCoffeeVanNotifyPhone();
        const sent = await sendViaMessageMedia(phone, result.coffeeSmsBody);
        sms = { ok: true, mocked: sent.mocked };
      } catch (error) {
        console.error("[coffee sms]", error);
        smsErrors.push(error instanceof Error ? error.message : "Coffee SMS failed");
      }
    }
    if (result.pubSmsBody) {
      try {
        const sent = await sendViaMessageMedia(
          getBottleShopNotifyPhone(),
          result.pubSmsBody
        );
        sms = { ok: true, mocked: sent.mocked };
      } catch (error) {
        console.error("[bottleshop sms]", error);
        smsErrors.push(error instanceof Error ? error.message : "SMS failed");
      }
    }
    if (!result.coffeeSmsBody && !result.pubSmsBody) {
      smsErrors.push("Nothing to text");
    }
    if (smsErrors.length && !sms.ok) {
      sms = { ok: false, error: smsErrors.join(" ") };
    }

    let push: { sent: number; failed: number; error?: string } = {
      sent: 0,
      failed: 0,
    };
    try {
      if (result.pubSmsBody) {
        push = await sendPushToOwner(ownerEmail, {
          title: "Bottle shop order",
          body: result.pubSmsBody.replace(/\n/g, " · "),
          url: "/operations/pub/bottleshop",
          badgeCount: reservedCount,
        });
      }
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
