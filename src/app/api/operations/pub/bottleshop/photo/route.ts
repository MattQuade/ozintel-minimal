import { NextRequest, NextResponse } from "next/server";
import {
  saveBottleProductPhoto,
  updateBottleProduct,
} from "@/lib/operations/pub/bottleshop";
import { requireOpsAccess } from "@/lib/accounting/requireAccess";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Multipart upload: productId + file, optional name/price/quantity. */
export async function POST(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  let form: FormData;
  try {
    form = await req.formData();
  } catch (error) {
    console.error("[bottleshop photo] formData", error);
    return NextResponse.json(
      {
        success: false,
        error:
          "Could not read the photo upload (file may be too large). Crop again or use a smaller JPEG.",
      },
      { status: 413 }
    );
  }
  try {
    const productId = String(form.get("productId") || "").trim();
    const file = form.get("file") ?? form.get("photo");
    if (!productId) {
      return NextResponse.json(
        { success: false, error: "productId is required" },
        { status: 400 }
      );
    }
    // Node/undici sometimes yields Blob, not File — accept either.
    const blob =
      typeof Blob !== "undefined" && file instanceof Blob
        ? file
        : file &&
            typeof file === "object" &&
            typeof (file as { arrayBuffer?: unknown }).arrayBuffer ===
              "function"
          ? (file as Blob)
          : null;
    if (!blob) {
      return NextResponse.json(
        { success: false, error: "Photo file is required (field: file)" },
        { status: 400 }
      );
    }
    const name = String(form.get("name") || "").trim();
    const priceRaw = String(form.get("price") || "").trim();
    const quantityRaw = String(form.get("quantity") || "").trim();
    const arrayBuffer = await blob.arrayBuffer();
    if (!arrayBuffer.byteLength) {
      return NextResponse.json(
        { success: false, error: "Photo file is empty" },
        { status: 400 }
      );
    }
    const product = await runWithDataOwnerAsync(
      getBottleShopOwnerEmail(),
      async () => {
        if (name || priceRaw || quantityRaw) {
          await updateBottleProduct(productId, {
            name: name || undefined,
            price: priceRaw ? Number(priceRaw) : undefined,
            quantity: quantityRaw ? Number(quantityRaw) : undefined,
          });
        }
        return saveBottleProductPhoto(productId, Buffer.from(arrayBuffer));
      }
    );
    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error("[bottleshop photo]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 400 }
    );
  }
}
