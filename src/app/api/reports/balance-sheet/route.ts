import { NextResponse } from "next/server";
import { readBankAccounts, readCoa, readLedger } from "@/lib/accounting/store";
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

    const [entries, coa, banks] = await Promise.all([
      readLedger(),
      readCoa(),
      readBankAccounts(),
    ]);
    const report = buildBalanceSheet(entries, coa, asAt, banks);

    return NextResponse.json(report);
  } catch (error) {
    console.error("Balance Sheet Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build balance sheet" },
      { status: 500 }
    );
  }
}
