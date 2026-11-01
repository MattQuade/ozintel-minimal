import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { readBankAccounts, readLedger, writeLedger, type LedgerEntry } from "@/lib/accounting/store";
import { rewriteJournalSplit, type DoubleEntryLine } from "@/lib/accounting/doubleEntry";
import { ensureFy26DoubleEntry } from "@/lib/accounting/ensureDoubleEntry";
import { parseBusinessPercent } from "@/lib/accounting/percentSplit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing line" }, { status: 400 });
    }
    const percent =
      body.businessPercent === undefined
        ? undefined
        : parseBusinessPercent(body.businessPercent);
    const personalAccountCode =
      body.personalAccountCode === undefined
        ? undefined
        : String(body.personalAccountCode || "");
    if (percent && !String(personalAccountCode || "").trim()) {
      return NextResponse.json(
        { success: false, error: "Choose the personal account for the split" },
        { status: 400 }
      );
    }
    const banks = await readBankAccounts();
    const ledger = await readLedger();
    const patched = rewriteJournalSplit(
      ledger as DoubleEntryLine[],
      id,
      {
        businessPercent: percent,
        personalAccountCode,
        personalAccountName:
          body.personalAccountName === undefined
            ? undefined
            : String(body.personalAccountName || ""),
        personalAccountType:
          body.personalAccountType === undefined
            ? undefined
            : String(body.personalAccountType || ""),
        userNote: body.userNote === undefined ? undefined : String(body.userNote || ""),
      },
      banks
    );
    if (!patched.changed) {
      return NextResponse.json(
        { success: false, error: "That line cannot take a percentage split" },
        { status: 400 }
      );
    }
    await writeLedger(patched.entries as LedgerEntry[]);
    const entries = patched.expanded ? patched.entries : await ensureFy26DoubleEntry();
    return NextResponse.json({ success: true, entries });
  });
}
