import { NextResponse } from "next/server";
import { readLedger, writeLedger } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { repairJournalEntries } from "@/lib/accounting/journalRepair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const entries = await readLedger();
      const repaired = repairJournalEntries(entries);
      if (repaired.changed) await writeLedger(repaired.entries);
      return NextResponse.json(repaired.changed ? repaired.entries : entries);
    } catch (err) {
      console.error("Entries API Error:", err);
      return NextResponse.json([]);
    }
  });
}
