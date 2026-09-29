import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  buildAssetRegister,
  buildEofySchedule,
  readAssets,
  readDepreciationRuns,
} from "@/lib/accounting/assets";
import { getAuFyBounds } from "@/lib/accounting/reports";
import { round2 } from "@/lib/accounting/invoiceMath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const url = new URL(req.url);
      const fy = getAuFyBounds();
      const asAt = url.searchParams.get("asAt") || fy.to;
      const from = url.searchParams.get("from") || fy.from;
      const to = url.searchParams.get("to") || fy.to;
      const assets = await readAssets();
      const runs = await readDepreciationRuns();
      const register = buildAssetRegister(assets, asAt);
      const schedule = buildEofySchedule(assets, from, to);
      const totals = {
        cost: round2(register.reduce((s, r) => s + r.cost, 0)),
        accumulatedDep: round2(
          register.reduce((s, r) => s + r.accumulatedDep, 0)
        ),
        bookValue: round2(register.reduce((s, r) => s + r.bookValue, 0)),
        charge: round2(schedule.reduce((s, r) => s + r.charge, 0)),
      };
      return NextResponse.json({
        asAt,
        period: { from, to },
        register,
        schedule,
        totals,
        runCount: runs.length,
        note: "Book depreciation for reconciling with your accountant. Not tax advice.",
      });
    } catch (error) {
      console.error("Asset report error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to build asset report" },
        { status: 500 }
      );
    }
  });
}
