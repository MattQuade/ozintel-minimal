import { NextResponse } from "next/server";
import {
  deleteLedgerEntries,
  readLedger,
} from "@/lib/accounting/store";
import { releaseReceiptsFromLedgerEntries } from "@/lib/accounting/receipts";
import { releasePaymentsClearedWithLedger } from "@/lib/accounting/invoices";
import { idsWithJournalGroup } from "@/lib/accounting/doubleEntry";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { clearImportBatchForLedgerDeletion } from "@/lib/accounting/importBatch";
import { toIsoDateInput } from "@/lib/accounting/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json();
      const ids = Array.isArray(body.ids)
        ? body.ids.map((id: unknown) => String(id || "").trim()).filter(Boolean)
        : [];
      const single = String(body.id || "").trim();
      const requested = ids.length > 0 ? ids : single ? [single] : [];
      if (requested.length === 0) {
        return NextResponse.json(
          { error: "id or ids is required" },
          { status: 400 }
        );
      }
      const ledger = await readLedger();
      const expanded = idsWithJournalGroup(ledger, requested);
      const removing = ledger.filter((entry) => expanded.includes(entry.id));
      const deletedCount = await deleteLedgerEntries(expanded);
      if (deletedCount === 0) {
        return NextResponse.json(
          { error: ids.length > 0 ? "No entries were deleted" : "Entry not found" },
          { status: 404 }
        );
      }
      await releasePaymentsClearedWithLedger(expanded);
      await releaseReceiptsFromLedgerEntries(expanded);

      const fingerprints = new Set<string>();
      for (const entry of removing) {
        const stored = String(entry.importFingerprint || "").trim();
        if (stored) fingerprints.add(stored);
      }
      const clearAll = Boolean(body.clearImportBatch);
      const dateFrom =
        toIsoDateInput(String(body.clearImportBatchFrom || "")) || "";
      const dateTo = toIsoDateInput(String(body.clearImportBatchTo || "")) || "";
      const importBatchCleared = await clearImportBatchForLedgerDeletion({
        fingerprints,
        dateFrom: clearAll ? undefined : dateFrom || undefined,
        dateTo: clearAll ? undefined : dateTo || undefined,
        clearAll,
      });

      return NextResponse.json({
        success: true,
        deletedCount,
        importBatchCleared,
      });
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Failed to delete entry",
        },
        { status: 500 }
      );
    }
  });
}
