import { NextResponse } from "next/server";
import {
  readBankAccounts,
  writeBankAccounts,
  type BankAccount,
} from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const accounts = await readBankAccounts();
      return NextResponse.json(accounts);
    } catch (error) {
      console.error("Bank accounts GET error:", error);
      return NextResponse.json([], { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  const access = await requireAccountingAccess(request);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await request.json();
      const accounts = (Array.isArray(body) ? body : body.accounts) as BankAccount[];
      if (!Array.isArray(accounts)) {
        return NextResponse.json(
          { success: false, error: "Expected a bank accounts array" },
          { status: 400 }
        );
      }
      const cleaned = accounts.map((a, index) => ({
        id: String(a.id || `bank-${Date.now()}-${index}`),
        name: String(a.name || "Bank account").trim(),
        accountNumber: String(a.accountNumber || ""),
        bsb: String(a.bsb || ""),
        openingBalance: Number(a.openingBalance) || 0,
        openingAsAt: String(a.openingAsAt || "2025-07-01"),
        type: String(a.type || "Cheque"),
      }));
      await writeBankAccounts(cleaned);
      return NextResponse.json({ success: true, accounts: cleaned });
    } catch (error) {
      console.error("Bank accounts POST error:", error);
      return NextResponse.json({ success: false }, { status: 500 });
    }
  });
}
