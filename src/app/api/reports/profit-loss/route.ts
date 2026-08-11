import { NextResponse } from "next/server";
import { readCoa, readLedger } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { buildProfitLoss, getAuFyBounds } from "@/lib/accounting/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const url = new URL(req.url);
      const fy = getAuFyBounds();
      const from = url.searchParams.get("from") || fy.from;
      const to = url.searchParams.get("to") || fy.to;

      const [entries, coa] = await Promise.all([readLedger(), readCoa()]);
      const report = buildProfitLoss(entries, coa, from, to);

      return NextResponse.json(report);
    } catch (error) {
      console.error("Profit & Loss Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to build profit & loss" },
        { status: 500 }
      );
    }
  });
}
