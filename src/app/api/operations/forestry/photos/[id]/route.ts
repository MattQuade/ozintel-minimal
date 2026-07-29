import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { getForestryPhotoForAccess } from "@/lib/operations/forestry/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const accessCode = req.nextUrl.searchParams.get("code")?.trim() || "";
    if (!accessCode) {
      return new NextResponse("Access code required", { status: 400 });
    }
    const { report, photoPath } = await getForestryPhotoForAccess(id, accessCode);
    const buffer = await fs.readFile(photoPath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": report.photoMimeType || "image/jpeg",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load photo";
    const status = message === "Invalid access code" ? 403 : 404;
    return new NextResponse(message, { status });
  }
}
