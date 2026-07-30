import { NextResponse } from "next/server";
import { resetLedger } from "@/lib/accounting/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await resetLedger();
    return NextResponse.json({ success: true, message: "Ledger cleared" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to reset" }, { status: 500 });
  }
}
