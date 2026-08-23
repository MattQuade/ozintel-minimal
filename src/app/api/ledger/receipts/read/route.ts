import { NextRequest, NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { readReceiptImage } from "@/lib/accounting/ocrReceipt";
import { detectAmountFromOcr } from "@/lib/accounting/parseReceiptOcr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** OCR can be slow on first language download / cold start. */
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * POST multipart: file (receipt image)
 * Returns suggested caption fields for the Confirm step.
 */
export async function POST(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const form = await req.formData();
      const file = form.get("file") ?? form.get("receipt") ?? form.get("photo");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { success: false, error: "File is required (field: file)" },
          { status: 400 }
        );
      }
      if (file.size <= 0 || file.size > MAX_BYTES) {
        return NextResponse.json(
          { success: false, error: "Image must be under 8MB" },
          { status: 400 }
        );
      }
      const mime = String(file.type || "").toLowerCase();
      if (mime && !mime.startsWith("image/")) {
        return NextResponse.json(
          { success: false, error: "Only image files can be read" },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const { suggestion, text } = await readReceiptImage(buffer);
      const amountOnly = suggestion
        ? null
        : detectAmountFromOcr(text)?.amount ?? null;

      if (!suggestion) {
        return NextResponse.json({
          success: true,
          suggestion: null,
          amount: amountOnly,
          message: amountOnly
            ? `Read $${Number(amountOnly).toFixed(2)} — type merchant`
            : "Could not read merchant and total — type a caption",
          textPreview: text.slice(0, 200),
        });
      }

      return NextResponse.json({
        success: true,
        suggestion: {
          alias: suggestion.alias,
          amount: suggestion.amount,
          display: suggestion.display,
          merchantLabel: suggestion.merchantLabel,
          confidence: suggestion.confidence,
        },
      });
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        {
          success: false,
          error:
            err instanceof Error ? err.message : "Failed to read receipt image",
        },
        { status: 500 }
      );
    }
  });
}
