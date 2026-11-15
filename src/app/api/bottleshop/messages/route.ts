import { NextRequest, NextResponse } from "next/server";
import { listBottleRepliesForCustomer } from "@/lib/operations/pub/bottleshop";
import { resolveBottleShopGate } from "@/lib/operations/pub/bottleShopAccess";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Replies for the restored bottle shop login. No phone number. */
export async function GET(req: NextRequest) {
  const gate = await resolveBottleShopGate(req);
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error },
      { status: 403 }
    );
  }
  try {
    const messages = await runWithDataOwnerAsync(getBottleShopOwnerEmail(), () =>
      listBottleRepliesForCustomer(gate.customerId)
    );
    return NextResponse.json({ success: true, messages });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Could not load messages" },
      { status: 500 }
    );
  }
}
