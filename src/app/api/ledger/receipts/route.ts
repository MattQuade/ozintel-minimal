import { NextRequest, NextResponse } from "next/server";
import {
  createReceipt,
  listAllReceipts,
  listInboxReceipts,
  listReceiptsByLedgerEntry,
  receiptPublicUrl,
  type ReceiptMeta,
} from "@/lib/accounting/receipts";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicReceipt(r: ReceiptMeta) {
  const linked = Array.isArray(r.ledgerEntryIds) ? r.ledgerEntryIds : [];
  return {
    id: r.id,
    caption: r.caption,
    captionAlias: r.captionAlias,
    captionAmount: r.captionAmount,
    uploadedAt: r.uploadedAt,
    originalFilename: r.originalFilename,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    ledgerEntryIds: linked,
    linked: linked.length > 0,
    url: receiptPublicUrl(r.id),
  };
}

/** List receipts: GET ?all=1 | ?inbox=1 | ?ledgerEntryId=... */
export async function GET(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const all = req.nextUrl.searchParams.get("all")?.trim() === "1";
      if (all) {
        const receipts = await listAllReceipts();
        return NextResponse.json({
          success: true,
          receipts: receipts.map(publicReceipt),
        });
      }

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
          {
            success: false,
            error: "all=1, inbox=1, or ledgerEntryId is required",
          },
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
