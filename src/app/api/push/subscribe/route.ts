import { NextRequest, NextResponse } from "next/server";
import { requireOpsAccess } from "@/lib/accounting/requireAccess";
import {
  removePushSubscription,
  saveCustomerPushSubscription,
  savePushSubscription,
} from "@/lib/push/subscriptions";
import { resolveBottleShopGate } from "@/lib/operations/pub/bottleShopAccess";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save this device's web-push subscription for bottle-shop badges. */
export async function POST(req: NextRequest) {
  let body: { subscription?: unknown; for?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }
  if (body.for === "customer") {
    const gate = await resolveBottleShopGate(req);
    if (!gate.ok) {
      return NextResponse.json(
        { success: false, error: gate.error },
        { status: 403 }
      );
    }
    try {
      const saved = await saveCustomerPushSubscription(
        body.subscription,
        gate.customerId,
        req.headers.get("user-agent") || undefined
      );
      return NextResponse.json({
        success: true,
        endpoint: saved.endpoint,
        customer: true,
      });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Subscribe failed",
        },
        { status: 400 }
      );
    }
  }
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  try {
    // Orders notify the bottle-shop owner silo; bind devices to that email.
    const saved = await savePushSubscription(
      body.subscription,
      getBottleShopOwnerEmail(),
      req.headers.get("user-agent") || undefined
    );
    return NextResponse.json({
      success: true,
      endpoint: saved.endpoint,
      ownerEmail: saved.ownerEmail,
      enabledBy: access.user.email,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Subscribe failed",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  try {
    const body = await req.json();
    const endpoint = String(body.endpoint || "").trim();
    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: "endpoint required" },
        { status: 400 }
      );
    }
    await removePushSubscription(endpoint);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Unsubscribe failed" },
      { status: 400 }
    );
  }
}
