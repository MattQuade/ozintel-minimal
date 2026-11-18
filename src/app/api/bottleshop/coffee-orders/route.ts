import { NextRequest, NextResponse } from "next/server";
import {
  isCoffeeOrder,
  listCoffeeOrdersForReply,
  replyToBottleOrder,
} from "@/lib/operations/pub/bottleshop";
import { readSessionEmail } from "@/lib/operations/pub/bottleShopAccess";
import { findUserByEmail, isCoffeeVanUser } from "@/lib/users";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";
import { sendPushToCustomer } from "@/lib/push/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

async function coffeeVanUser(req: NextRequest) {
  const email = readSessionEmail(req);
  if (!email) return null;
  const user = await findUserByEmail(email);
  if (!isCoffeeVanUser(user)) return null;
  return user;
}

/** Coffee reserves for John Gill. One user lookup, then one store read. */
export async function GET(req: NextRequest) {
  const user = await coffeeVanUser(req);
  if (!user) {
    const signedIn = Boolean(readSessionEmail(req));
    return NextResponse.json(
      {
        success: false,
        error: signedIn
          ? "Coffee replies are for the coffee van account."
          : "Sign in with the coffee van username.",
      },
      { status: signedIn ? 403 : 401, headers: noStore }
    );
  }
  try {
    const orders = await runWithDataOwnerAsync(getBottleShopOwnerEmail(), () =>
      listCoffeeOrdersForReply()
    );
    return NextResponse.json(
      { success: true, name: user.name, orders },
      { headers: noStore }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Could not load coffee orders" },
      { status: 500, headers: noStore }
    );
  }
}

/** Save a reply on one coffee order and alert the customer when they have a login. */
export async function POST(req: NextRequest) {
  const user = await coffeeVanUser(req);
  if (!user) {
    const signedIn = Boolean(readSessionEmail(req));
    return NextResponse.json(
      {
        success: false,
        error: signedIn
          ? "Coffee replies are for the coffee van account."
          : "Sign in with the coffee van username.",
      },
      { status: signedIn ? 403 : 401, headers: noStore }
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    const ownerEmail = getBottleShopOwnerEmail();
    const coffee = await runWithDataOwnerAsync(ownerEmail, () => isCoffeeOrder(id));
    if (!coffee) {
      return NextResponse.json(
        { success: false, error: "That reserve is not a coffee order." },
        { status: 400, headers: noStore }
      );
    }
    const order = await runWithDataOwnerAsync(ownerEmail, () =>
      replyToBottleOrder(id, body.reply)
    );
    let notified = 0;
    if (order.customerId) {
      try {
        const push = await sendPushToCustomer(order.customerId, {
          title: "Message from the coffee van",
          body: order.pubReply || "The coffee van sent a reply",
          url: "/bottleshop/coffee",
          tag: "bottleshop-reply",
        });
        notified = push.sent;
      } catch (error) {
        console.error("[coffee reply push]", error);
      }
    }
    return NextResponse.json({ success: true, order, notified });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Could not send the reply",
      },
      { status: 400, headers: noStore }
    );
  }
}
