import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push/vapid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const publicKey = await getVapidPublicKey();
    return NextResponse.json({ success: true, publicKey });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "VAPID key unavailable" },
      { status: 500 }
    );
  }
}
