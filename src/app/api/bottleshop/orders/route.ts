import { NextRequest, NextResponse } from "next/server";
import {
  countReservedBottleOrders,
  placeBottleOrder,
} from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { readSessionEmail } from "@/lib/operations/pub/bottleShopAccess";
import { findUserByEmail, resolveCoffeeVanNotifyPhone } from "@/lib/users";
import {
  getBottleShopNotifyPhone,
  getBottleShopOwnerEmail,
  sendViaMessageMedia,
} from "@/lib/sms/sendSms";
import { sendPushToOwner } from "@/lib/push/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Anyone can reserve. A signed-in Bottle Shop user is named on the order. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const typedName = String(body.customerName || "").trim();
    let customerId: string | undefined;
    let knownName = "";
    const email = readSessionEmail(req);
    if (email) {
      const user = await findUserByEmail(email);
      if (user?.status === "approved" && user.permissions?.bottleShop) {
        customerId = user.email;
        knownName = user.name;
      }
    }
    const customerName = typedName || knownName;
    if (!customerName) {
      return NextResponse.json(
        { success: false, error: "Enter your name." },
        { status: 400 }
      );
    }

    const ownerEmail = getBottleShopOwnerEmail();
    const result = await runWithDataOwnerAsync(ownerEmail, () =>
      placeBottleOrder({
        items: Array.isArray(body.items) ? body.items : [],
        customerName,
        customerNote: body.customerNote,
        customerId,
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
