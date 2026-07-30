import { NextResponse } from "next/server";
import { readLedger } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const entries = await readLedger();

    const revenue = entries
      .filter((e) => e.type === "Revenue")
      .reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0);

    const expenses = entries
      .filter((e) => e.type === "Expense")
      .reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0);

    return NextResponse.json({
      totalRevenue: revenue,
      totalExpenses: expenses,
      netProfit: revenue - expenses,
      totalTransactions: entries.length,
    });
  } catch (error) {
    console.error("Ledger Summary Error:", error);
    return NextResponse.json({
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      totalTransactions: 0,
    });
  }
}
