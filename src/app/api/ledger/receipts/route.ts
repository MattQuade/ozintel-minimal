import { NextRequest, NextResponse } from "next/server";
import {
  createReceipt,
  listInboxReceipts,
  listReceiptsByLedgerEntry,
  receiptPublicUrl,
} from "@/lib/accounting/receipts";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicReceipt(r: {
  id: string;
  caption?: string;
  captionAlias?: string;
  captionAmount?: number;
  uploadedAt: string;
  originalFilename: string;
  mimeType: string;
}) {
  return {
    ...r,
    url: receiptPublicUrl(r.id),
  };
}

/** List receipts: GET ?ledgerEntryId=... or GET ?inbox=1 (waiting for CSV). */
export async function GET(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const inbox = req.nextUrl.searchParams.get("inbox")?.trim() === "1";
      if (inbox) {
        const receipts = await listInboxReceipts();
        return NextResponse.json({
          success: true,
          receipts: receipts.map(publicReceipt),
        });
      }

      const ledgerEntryId =
        req.nextUrl.searchParams.get("ledgerEntryId")?.trim() || "";
      if (!ledgerEntryId) {
        return NextResponse.json(
          { success: false, error: "ledgerEntryId or inbox=1 is required" },
          { status: 400 }
        );
      }
      const receipts = await listReceiptsByLedgerEntry(ledgerEntryId);
      return NextResponse.json({
        success: true,
        receipts: receipts.map(publicReceipt),
      });
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        { success: false, error: "Failed to list receipts" },
        { status: 500 }
      );
    }
  });
}

/** Upload receipt (multipart). Optional form field ledgerEntryId to link immediately. */
export async function POST(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const form = await req.formData();
      const file = form.get("file") ?? form.get("receipt") ?? form.get("photo");
      const ledgerEntryId = String(form.get("ledgerEntryId") || "").trim();
      const caption = String(form.get("caption") || "").trim();

      if (!(file instanceof File)) {
        return NextResponse.json(
          { success: false, error: "File is required (field: file)" },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const meta = await createReceipt({
        buffer: Buffer.from(arrayBuffer),
        mimeType: file.type || "application/octet-stream",
        originalFilename: file.name || "receipt",
        ledgerEntryIds: ledgerEntryId ? [ledgerEntryId] : [],
        caption,
      });

      return NextResponse.json({
        success: true,
        receipt: publicReceipt(meta),
      });
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "Failed to upload receipt",
        },
        { status: 400 }
      );
    }
  });
}
