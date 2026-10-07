import { NextResponse } from "next/server";
import {
  deleteLedgerEntries,
  readLedger,
} from "@/lib/accounting/store";
import { releaseReceiptsFromLedgerEntries } from "@/lib/accounting/receipts";
import { idsWithJournalGroup } from "@/lib/accounting/doubleEntry";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

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
      const deletedCount = await deleteLedgerEntries(expanded);
      if (deletedCount === 0) {
        return NextResponse.json(
          { error: ids.length > 0 ? "No entries were deleted" : "Entry not found" },
          { status: 404 }
        );
      }
      await releaseReceiptsFromLedgerEntries(expanded);
      return NextResponse.json({ success: true, deletedCount });
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
