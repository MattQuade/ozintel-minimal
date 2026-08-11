import { NextResponse } from "next/server";
import { readCoa, readLedger } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  buildBasSummary,
  currentBasQuarterId,
  listBasQuarterOptions,
} from "@/lib/accounting/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const url = new URL(req.url);
      const quarters = listBasQuarterOptions();
      const defaultId = currentBasQuarterId();
      const quarterId = url.searchParams.get("quarter") || defaultId;
      const matched =
        quarters.find((q) => q.id === quarterId) ||
        quarters.find((q) => q.id === defaultId) ||
        quarters[0];

      const from = url.searchParams.get("from") || matched?.from || "";
      const to = url.searchParams.get("to") || matched?.to || "";

      const [entries, coa] = await Promise.all([readLedger(), readCoa()]);
      const report = buildBasSummary(entries, coa, from, to);

      return NextResponse.json({
        ...report,
        quarters,
        selectedQuarterId: matched?.id || "",
      });
    } catch (error) {
      console.error("BAS Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to build BAS summary" },
        { status: 500 }
      );
    }
  });
}
