import { NextRequest, NextResponse } from "next/server";
import { listBottleProducts } from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import {
  readBottleShopCodeFromRequest,
  requireBottleShopCustomer,
} from "@/lib/operations/pub/bottleShopAccess";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Catalogue for invited customers only (manual access code). */
export async function GET(req: NextRequest) {
  try {
    const accessCode = readBottleShopCodeFromRequest(req);
    const gate = await runWithDataOwnerAsync(getBottleShopOwnerEmail(), () =>
      requireBottleShopCustomer(accessCode)
    );
    if (!gate.ok) {
      return NextResponse.json(
        { success: false, error: gate.error, needsAccessCode: true },
        { status: 403 }
      );
    }
    const products = await runWithDataOwnerAsync(
      getBottleShopOwnerEmail(),
      () => listBottleProducts({ activeOnly: true })
    );
    return NextResponse.json({
      success: true,
      products,
      customer: { id: gate.customer.id, name: gate.customer.name },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to load bottle shop" },
      { status: 500 }
    );
  }
}
