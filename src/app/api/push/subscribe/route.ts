import { NextRequest, NextResponse } from "next/server";
import { requireOpsAccess } from "@/lib/accounting/requireAccess";
import {
  removePushSubscription,
  savePushSubscription,
} from "@/lib/push/subscriptions";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save this device's web-push subscription for bottle-shop badges. */
export async function POST(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  try {
    const body = await req.json();
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
