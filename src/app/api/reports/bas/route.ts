import { NextResponse } from "next/server";
import { readCoa, readLedger } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  buildBasSummary,
  getAuBasQuarters,
  getAuFyBounds,
} from "@/lib/accounting/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const url = new URL(req.url);
    const fy = getAuFyBounds();
    const quarters = getAuBasQuarters(fy.startYear);
    const quarterId = url.searchParams.get("quarter");
    const matched = quarters.find((q) => q.id === quarterId);

    const from = url.searchParams.get("from") || matched?.from || fy.from;
    const to = url.searchParams.get("to") || matched?.to || fy.to;

    const [entries, coa] = await Promise.all([readLedger(), readCoa()]);
    const report = buildBasSummary(entries, coa, from, to);

    return NextResponse.json({ ...report, quarters });
  } catch (error) {
    console.error("BAS Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build BAS summary" },
      { status: 500 }
    );
  }
}
