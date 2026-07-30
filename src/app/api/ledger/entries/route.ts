import { NextResponse } from "next/server";
import { readLedger } from "@/lib/accounting/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = await readLedger();
    return NextResponse.json(entries);
  } catch (err) {
    console.error("Entries API Error:", err);
    return NextResponse.json([]);
  }
}
