import { NextResponse } from "next/server";
import { readBankAccounts, readLedger } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { buildBankReconciliation } from "@/lib/accounting/bankReconciliation";
import {
  readStatementBalances,
  saveStatementBalance,
} from "@/lib/accounting/statementBalances";
import { toIsoDateInput } from "@/lib/accounting/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const url = new URL(req.url);
      const asAt = toIsoDateInput(url.searchParams.get("asAt") || "") || "2026-09-30";
      const [entries, banks, statements] = await Promise.all([
        readLedger(),
        readBankAccounts(),
        readStatementBalances(asAt),
      ]);
      const accounts = buildBankReconciliation(banks, entries, asAt, statements);
      return NextResponse.json({ asAt, accounts });
    } catch (error) {
      console.error("Bank reconciliation GET error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to build reconciliation" },
        { status: 500 }
      );
    }
  });
}

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json();
      const raw = body.statementBalance;
      const statementBalance =
        raw == null || raw === ""
          ? null
          : Number(String(raw).replace(/[$,\s]/g, ""));
      if (statementBalance != null && !Number.isFinite(statementBalance)) {
        return NextResponse.json(
          { success: false, error: "Statement balance must be a number" },
          { status: 400 }
        );
      }
      const saved = await saveStatementBalance({
        bankAccountId: String(body.bankAccountId || ""),
        asAt: String(body.asAt || ""),
        statementBalance,
      });
      return NextResponse.json({ success: true, statement: saved });
    } catch (error) {
      console.error("Bank reconciliation POST error:", error);
      const message = error instanceof Error ? error.message : "Failed to save";
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  });
}
