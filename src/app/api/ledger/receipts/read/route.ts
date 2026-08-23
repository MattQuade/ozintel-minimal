import { NextRequest, NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { readReceiptImage } from "@/lib/accounting/ocrReceipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const MAX_BYTES = 18 * 1024 * 1024;

/**
 * POST multipart: file (receipt image)
 * Returns suggested caption fields. Always typeable on the client.
 */
export async function POST(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      let form: FormData;
      try {
        form = await req.formData();
      } catch (parseErr) {
        console.error(parseErr);
        return NextResponse.json(
          {
            success: false,
            error:
              "Could not read the photo upload (file too large or interrupted). Retake and try again.",
          },
          { status: 400 }
        );
      }
      const file = form.get("file") ?? form.get("receipt") ?? form.get("photo");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { success: false, error: "File is required (field: file)" },
          { status: 400 }
        );
      }
      if (file.size <= 0 || file.size > MAX_BYTES) {
        return NextResponse.json(
          { success: false, error: "Image must be under 18MB" },
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
      const { suggestion, text } = await Promise.race([
        readReceiptImage(buffer),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("OCR read timed out after 12s")),
            12_000
          );
        }),
      ]);

      if (!suggestion) {
        return NextResponse.json({
          success: true,
          suggestion: null,
          message: "Could not read merchant and total — type a caption",
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
