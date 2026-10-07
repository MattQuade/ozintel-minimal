import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { ensureFy26DoubleEntry } from "@/lib/accounting/ensureDoubleEntry";
import { attachInboxReceiptsToBankImportEntries } from "@/lib/accounting/matchInboxReceipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const entries = await ensureFy26DoubleEntry();
      try {
        const withReceipts = await attachInboxReceiptsToBankImportEntries(entries);
        return NextResponse.json(withReceipts);
      } catch (attachErr) {
        console.error("Receipt rematch failed:", attachErr);
        return NextResponse.json(entries);
      }
    } catch (err) {
      console.error("Entries API Error:", err);
      return NextResponse.json([]);
    }
  });
}
