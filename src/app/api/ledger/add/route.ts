import { NextResponse } from "next/server";
import { appendLedgerEntries } from "@/lib/accounting/store";
import { registerLedgerEntryOnReceipts } from "@/lib/accounting/receipts";
import { attachInboxReceiptsToBankImportEntries } from "@/lib/accounting/matchInboxReceipts";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json();
      const entries = Array.isArray(body.entries) ? body.entries : body;

      if (!entries || entries.length === 0) {
        return NextResponse.json({ error: "No entries received" }, { status: 400 });
      }

      const result = await appendLedgerEntries(entries);

      // Keep receipt metadata in sync when entries arrive with receiptIds
      for (const entry of result.savedEntries) {
        if (Array.isArray(entry.receiptIds) && entry.receiptIds.length > 0) {
          await registerLedgerEntryOnReceipts(entry.receiptIds, entry.id);
        }
      }

      const savedEntries = await attachInboxReceiptsToBankImportEntries(
        result.savedEntries
      );
      const inboxAttached = savedEntries.reduce((n, entry, i) => {
        const before = Array.isArray(result.savedEntries[i]?.receiptIds)
          ? result.savedEntries[i].receiptIds!.length
          : 0;
        const after = Array.isArray(entry.receiptIds)
          ? entry.receiptIds.length
          : 0;
        return n + Math.max(0, after - before);
      }, 0);

      console.log(
        `Saved ${result.saved} transactions. Total now: ${result.total}` +
          (inboxAttached ? ` (${inboxAttached} receipt(s) auto-attached)` : "")
      );

      return NextResponse.json({
        success: true,
        saved: result.saved,
        total: result.total,
        savedEntries,
        inboxAttached,
      });
    } catch (err: unknown) {
      console.error("Save Error:", err);
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Failed to save to ledger",
        },
        { status: 500 }
      );
    }
  });
}
