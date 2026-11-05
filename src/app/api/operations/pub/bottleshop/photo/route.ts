import { NextRequest, NextResponse } from "next/server";
import { saveBottleProductPhoto } from "@/lib/operations/pub/bottleshop";
import { requireOpsAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Multipart upload: fields productId + file (or photo). */
export async function POST(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const form = await req.formData();
      const productId = String(form.get("productId") || "").trim();
      const file = form.get("file") ?? form.get("photo");
      if (!productId) {
        return NextResponse.json(
          { success: false, error: "productId is required" },
          { status: 400 }
        );
      }
      if (!(file instanceof File)) {
        return NextResponse.json(
          { success: false, error: "Photo file is required (field: file)" },
          { status: 400 }
        );
      }
      const arrayBuffer = await file.arrayBuffer();
      const product = await saveBottleProductPhoto(
        productId,
        Buffer.from(arrayBuffer)
      );
      return NextResponse.json({ success: true, product });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Upload failed",
        },
        { status: 400 }
      );
    }
  });
}
