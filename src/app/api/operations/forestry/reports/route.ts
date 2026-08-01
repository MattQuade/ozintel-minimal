import { NextRequest, NextResponse } from "next/server";
import {
  createForestryReport,
  listForestryReports,
} from "@/lib/operations/forestry/reports";
import { requireOpsAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await requireOpsAccess(req, "forestryOps");
  if (!access.ok) return access.response;
  try {
    const reports = await listForestryReports();
    return NextResponse.json({ success: true, reports });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to load forestry reports" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const access = await requireOpsAccess(req, "forestryOps");
  if (!access.ok) return access.response;
  try {
    const form = await req.formData();
    const clientName = String(form.get("clientName") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    const accessCode = String(form.get("accessCode") || "").trim();
    const capturedAt = String(form.get("capturedAt") || "").trim();
    const latitudeRaw = String(form.get("latitude") || "").trim();
    const longitudeRaw = String(form.get("longitude") || "").trim();
    const photo = form.get("photo");

    if (!clientName) {
      return NextResponse.json(
        { success: false, error: "Client name is required" },
        { status: 400 }
      );
    }
    if (!notes) {
      return NextResponse.json(
        { success: false, error: "Notes are required" },
        { status: 400 }
      );
    }
    if (!accessCode) {
      return NextResponse.json(
        { success: false, error: "Access code is required" },
        { status: 400 }
      );
    }
    if (!(photo instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Photo is required" },
        { status: 400 }
      );
    }
    if (!photo.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "Photo must be an image" },
        { status: 400 }
      );
    }

    const arrayBuffer = await photo.arrayBuffer();
    const result = await createForestryReport({
      clientName,
      notes,
      accessCode,
      photoBuffer: Buffer.from(arrayBuffer),
      photoMimeType: photo.type || "image/jpeg",
      latitude: latitudeRaw ? Number(latitudeRaw) : null,
      longitude: longitudeRaw ? Number(longitudeRaw) : null,
      capturedAt,
    });

    return NextResponse.json({ success: true, report: result });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to save forestry report",
      },
      { status: 400 }
    );
  }
}
