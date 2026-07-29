import { NextRequest, NextResponse } from "next/server";
import { verifyForestryReportAccess } from "@/lib/operations/forestry/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const accessCode = String(body.accessCode || "").trim();
    if (!accessCode) {
      return NextResponse.json(
        { success: false, error: "Access code is required" },
        { status: 400 }
      );
    }
    const report = await verifyForestryReportAccess(id, accessCode);
    return NextResponse.json({ success: true, report });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to verify access";
    const status = message === "Invalid access code" ? 403 : 404;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
