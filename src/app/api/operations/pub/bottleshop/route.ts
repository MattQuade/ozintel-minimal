import { NextRequest, NextResponse } from "next/server";
import {
  createBottleProduct,
  createCoffeeProducts,
  deleteBottleOrder,
  deleteBottleProduct,
  loadBottleShopAdmin,
  replyToBottleOrder,
  setBottleOrderStatus,
  updateBottleHubButtonLabel,
  updateBottleProduct,
  type BottleOrder,
} from "@/lib/operations/pub/bottleshop";
import { requireOpsAccess } from "@/lib/accounting/requireAccess";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";
import { sendPushToCustomer } from "@/lib/push/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function withBottleShopOwner<T>(fn: () => Promise<T>): Promise<T> {
  return runWithDataOwnerAsync(getBottleShopOwnerEmail(), fn);
}

export async function GET(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  try {
    const data = await withBottleShopOwner(() => loadBottleShopAdmin());
    return NextResponse.json({
      success: true,
      ...data,
      dataOwnerEmail: getBottleShopOwnerEmail(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to load bottle shop" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  try {
    const body = await req.json();
    const sizes = Array.isArray(body.sizes) ? body.sizes : [];
    if (String(body.category || "").trim().toLowerCase() === "coffee" && sizes.length) {
      const result = await withBottleShopOwner(() =>
        createCoffeeProducts({
          name: body.name,
          price: body.price,
          quantity: body.quantity,
          sizes,
        })
      );
      return NextResponse.json({
        success: true,
        product: result.products[0],
        products: result.products,
        skipped: result.skipped,
      });
    }
    const product = await withBottleShopOwner(() =>
      createBottleProduct({
        name: body.name,
        price: body.price,
        quantity: body.quantity,
        category: body.category,
      })
    );
    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Create failed",
      },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  try {
    const body = await req.json();
    const kind = String(body.kind || "product").trim();

    if (kind === "hubButton") {
      const button = await withBottleShopOwner(() =>
        updateBottleHubButtonLabel(body.id, body.label)
      );
      return NextResponse.json({ success: true, button });
    }

    if (kind === "reply") {
      const id = String(body.id || "").trim();
      const order = await withBottleShopOwner(() =>
        replyToBottleOrder(id, body.reply)
      );
      let notified = 0;
      if (order.customerId) {
        try {
          const push = await sendPushToCustomer(order.customerId, {
            title: "Message from the pub",
            body: order.pubReply || "The pub sent a reply",
            url: "/bottleshop",
            tag: "bottleshop-reply",
          });
          notified = push.sent;
        } catch (error) {
          console.error("[bottleshop reply push]", error);
        }
      }
      return NextResponse.json({ success: true, order, notified });
    }

    if (kind === "deleteProduct") {
      const id = String(body.id || "").trim();
      if (!id) {
        return NextResponse.json(
          { success: false, error: "id is required" },
          { status: 400 }
        );
      }
      await withBottleShopOwner(() => deleteBottleProduct(id));
      return NextResponse.json({ success: true });
    }

    if (kind === "order" || kind === "deleteOrder") {
      const id = String(body.id || "").trim();
      if (!id) {
        return NextResponse.json(
          { success: false, error: "id is required" },
          { status: 400 }
        );
      }
      if (kind === "deleteOrder") {
        await withBottleShopOwner(() => deleteBottleOrder(id));
        return NextResponse.json({ success: true });
      }
      const status = String(body.status || "").trim() as BottleOrder["status"];
      if (!["reserved", "collected", "cancelled"].includes(status)) {
        return NextResponse.json(
          { success: false, error: "id and valid status required" },
          { status: 400 }
        );
      }
      const order = await withBottleShopOwner(() =>
        setBottleOrderStatus(id, status)
      );
      return NextResponse.json({ success: true, order });
    }

    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json(
        { success: false, error: "id is required" },
        { status: 400 }
      );
    }
    const product = await withBottleShopOwner(() =>
      updateBottleProduct(id, {
        name: body.name,
        price: body.price,
        quantity: body.quantity,
        imageUrl: body.imageUrl,
        active: body.active,
        category: body.category,
      })
    );
    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Update failed",
      },
      { status: 400 }
    );
  }
}
