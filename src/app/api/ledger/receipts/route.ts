import { NextRequest, NextResponse } from "next/server";
import {
  createReceipt,
  listReceiptsByLedgerEntry,
  receiptPublicUrl,
} from "@/lib/accounting/receipts";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List receipts for a ledger entry: GET ?ledgerEntryId=... */
export async function GET(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const ledgerEntryId =
      req.nextUrl.searchParams.get("ledgerEntryId")?.trim() || "";
    if (!ledgerEntryId) {
      return NextResponse.json(
        { success: false, error: "ledgerEntryId is required" },
        { status: 400 }
      );
    }
    const receipts = await listReceiptsByLedgerEntry(ledgerEntryId);
    return NextResponse.json({
      success: true,
      receipts: receipts.map((r) => ({
        ...r,
        url: receiptPublicUrl(r.id),
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, error: "Failed to list receipts" },
      { status: 500 }
    );
  }
}

/** Upload receipt (multipart). Optional form field ledgerEntryId to link immediately. */
export async function POST(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const form = await req.formData();
    const file = form.get("file") ?? form.get("receipt") ?? form.get("photo");
    const ledgerEntryId = String(form.get("ledgerEntryId") || "").trim();

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
    });

    return NextResponse.json({
      success: true,
      receipt: {
        ...meta,
        url: receiptPublicUrl(meta.id),
      },
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
}
