import { NextResponse } from "next/server";
import { ledgerEngine } from "@/core/ledger/ledgerEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = await ledgerEngine.getSummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Summary API Error:", error);
    return NextResponse.json({
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      totalEntries: 0,
    });
  }
}
