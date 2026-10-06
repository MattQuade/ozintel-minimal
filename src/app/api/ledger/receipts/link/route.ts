import { NextRequest, NextResponse } from "next/server";
import { attachReceiptToEntry } from "@/lib/accounting/receipts";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Link a photo already stored in Receipts onto a journal line. */
export async function POST(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json();
      const receiptId = String(body.receiptId || "").trim();
      const ledgerEntryId = String(body.ledgerEntryId || "").trim();
      if (!receiptId || !ledgerEntryId) {
        return NextResponse.json(
          { success: false, error: "receiptId and ledgerEntryId are required" },
          { status: 400 }
        );
      }
      const meta = await attachReceiptToEntry(receiptId, ledgerEntryId);
      return NextResponse.json({
        success: true,
        receiptId: meta.id,
        ledgerEntryId,
        receiptIds: [receiptId],
      });
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : "Failed to attach receipt";
      const status = message === "Receipt not found" ? 404 : 400;
      return NextResponse.json(
        { success: false, error: message },
        { status }
      );
    }
  });
}
