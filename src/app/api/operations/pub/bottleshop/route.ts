import { NextRequest, NextResponse } from "next/server";
import {
  createBottleProduct,
  loadBottleShopAdmin,
  setBottleOrderStatus,
  updateBottleProduct,
  type BottleOrder,
} from "@/lib/operations/pub/bottleshop";
import { requireOpsAccess } from "@/lib/accounting/requireAccess";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

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

    if (kind === "order") {
      const id = String(body.id || "").trim();
      const status = String(body.status || "").trim() as BottleOrder["status"];
      if (!id || !["reserved", "collected", "cancelled"].includes(status)) {
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
