import { NextRequest, NextResponse } from "next/server";
import { readBottleProductPhoto } from "@/lib/operations/pub/bottleshop";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public product photo from the bottle-shop owner silo on the Fly volume. */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const photo = await runWithDataOwnerAsync(getBottleShopOwnerEmail(), () =>
      readBottleProductPhoto(id)
    );
    if (!photo) {
      return new NextResponse("Photo not found", { status: 404 });
    }
    return new NextResponse(new Uint8Array(photo.buffer), {
      status: 200,
      headers: {
        "Content-Type": photo.contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error(error);
    return new NextResponse("Failed to load photo", { status: 500 });
  }
}
