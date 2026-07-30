import { NextResponse } from "next/server";
import { readCoa, readLedger } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { buildBalanceSheet } from "@/lib/accounting/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const url = new URL(req.url);
    const asAt =
      url.searchParams.get("asAt") || new Date().toISOString().slice(0, 10);

    const [entries, coa] = await Promise.all([readLedger(), readCoa()]);
    const report = buildBalanceSheet(entries, coa, asAt);

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
        hypothesisId: "H3-H5",
        location: "api/reports/balance-sheet/route.ts:GET",
        message: "Balance sheet built",
        data: {
          asAt,
          entryCount: report.entryCount,
          assetsTotal: report.assets.total,
          liabilitiesTotal: report.liabilities.total,
          equityTotal: report.equity.total,
          balanced: report.balanced,
          difference: report.difference,
          assetLines: report.assets.lines.length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return NextResponse.json(report);
  } catch (error) {
    console.error("Balance Sheet Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build balance sheet" },
      { status: 500 }
    );
  }
}
