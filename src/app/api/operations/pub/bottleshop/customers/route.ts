import { NextRequest, NextResponse } from "next/server";
import {
  addBottleCustomer,
  setBottleCustomerActive,
} from "@/lib/operations/pub/bottleshop";
import { requireOpsAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json();
      const customer = await addBottleCustomer({
        name: body.name,
        login: body.login || body.username || body.email,
        phone: body.phone,
        note: body.note,
      });
      return NextResponse.json({ success: true, customer });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Add failed",
        },
        { status: 400 }
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
      const id = String(body.id || "").trim();
      if (!id || typeof body.active !== "boolean") {
        return NextResponse.json(
          { success: false, error: "id and active required" },
          { status: 400 }
        );
      }
      const customer = await setBottleCustomerActive(id, body.active);
      return NextResponse.json({ success: true, customer });
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
