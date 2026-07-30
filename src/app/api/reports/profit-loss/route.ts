import { NextResponse } from "next/server";
import { readCoa, readLedger } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { buildProfitLoss, getAuFyBounds } from "@/lib/accounting/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const url = new URL(req.url);
    const fy = getAuFyBounds();
    const from = url.searchParams.get("from") || fy.from;
    const to = url.searchParams.get("to") || fy.to;

    const [entries, coa] = await Promise.all([readLedger(), readCoa()]);
    const report = buildProfitLoss(entries, coa, from, to);

    // #region agent log
    fetch("http://127.0.0.1:7620/ingest/58ed654d-f6dd-4cb2-bdd8-01209344e92b", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "d182b0",
      },
      body: JSON.stringify({
        sessionId: "d182b0",
        runId: "phase2",
        hypothesisId: "H1-H2",
        location: "api/reports/profit-loss/route.ts:GET",
        message: "P&L report built",
        data: {
          from,
          to,
          entryCount: report.entryCount,
          ledgerSize: entries.length,
          revenueTotal: report.revenue.total,
          cogsTotal: report.cogs.total,
          expensesTotal: report.expenses.total,
          netProfit: report.netProfit,
          revenueLines: report.revenue.lines.length,
          expenseLines: report.expenses.lines.length,
          sampleTypes: entries.slice(0, 5).map((e) => ({
            type: e.type,
            hasCode: Boolean(e.accountCode),
            date: e.date,
          })),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return NextResponse.json(report);
  } catch (error) {
    console.error("Profit & Loss Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build profit & loss" },
      { status: 500 }
    );
  }
}
