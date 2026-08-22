import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteReceipt,
  getReceiptFile,
  getReceiptMeta,
  receiptPublicUrl,
  replaceReceiptFile,
} from "@/lib/accounting/receipts";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const { id } = await context.params;
      const { meta, filePath } = await getReceiptFile(id);
      const buffer = await fs.readFile(filePath);
      const disposition = meta.mimeType.startsWith("image/")
        ? "inline"
        : `attachment; filename="${encodeURIComponent(meta.originalFilename)}"`;
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": meta.mimeType || "application/octet-stream",
          "Content-Disposition": disposition,
          "Cache-Control": "private, max-age=60",
          "X-Receipt-Id": meta.id,
          "X-Receipt-Url": receiptPublicUrl(meta.id),
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load receipt";
      const status = message === "Receipt not found" ? 404 : 500;
      return new NextResponse(message, { status });
    }
  });
}

/** Replace receipt image after re-crop (multipart field: file). */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const { id } = await context.params;
      const existing = await getReceiptMeta(id);
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Receipt not found" },
          { status: 404 }
        );
      }

      const form = await req.formData();
      const file = form.get("file") ?? form.get("receipt") ?? form.get("photo");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { success: false, error: "File is required (field: file)" },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const meta = await replaceReceiptFile({
        id,
        buffer: Buffer.from(arrayBuffer),
        mimeType: file.type || "application/octet-stream",
        originalFilename: file.name || existing.originalFilename,
      });

      return NextResponse.json({
        success: true,
        receipt: {
          ...meta,
          url: `${receiptPublicUrl(meta.id)}?v=${meta.sizeBytes}`,
          linked: (meta.ledgerEntryIds || []).length > 0,
        },
      });
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        {
          success: false,
          error:
            err instanceof Error ? err.message : "Failed to replace receipt",
        },
        { status: 400 }
      );
    }
  });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const { id } = await context.params;
      const ok = await deleteReceipt(id);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: "Receipt not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "Failed to delete receipt",
        },
        { status: 500 }
      );
    }
  });
}
