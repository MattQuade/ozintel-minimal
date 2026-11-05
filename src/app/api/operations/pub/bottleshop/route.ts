import { NextRequest, NextResponse } from "next/server";
import {
  loadBottleShopAdmin,
  setBottleOrderStatus,
  updateBottleProduct,
  type BottleOrder,
} from "@/lib/operations/pub/bottleshop";
import { requireOpsAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const data = await loadBottleShopAdmin();
      return NextResponse.json({
        success: true,
        ...data,
        dataOwnerEmail: access.dataOwnerEmail,
      });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        { success: false, error: "Failed to load bottle shop" },
        { status: 500 }
      );
    }
  });
}

export async function PATCH(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  return access.run(async () => {
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
        const order = await setBottleOrderStatus(id, status);
        return NextResponse.json({ success: true, order });
      }

      const id = String(body.id || "").trim();
      if (!id) {
        return NextResponse.json(
          { success: false, error: "id is required" },
          { status: 400 }
        );
      }
      const product = await updateBottleProduct(id, {
        name: body.name,
        price: body.price,
        quantity: body.quantity,
        imageUrl: body.imageUrl,
        active: body.active,
      });
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
  });
}
