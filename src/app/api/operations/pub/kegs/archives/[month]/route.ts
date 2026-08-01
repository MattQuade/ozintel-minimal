import { NextRequest, NextResponse } from "next/server";
import { readArchive } from "@/lib/operations/pub/kegs";
import { requireOpsAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ month: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  try {
    const { month } = await params;
    const snapshot = await readArchive(month);
    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: "Archive not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      ...snapshot,
      locked: true,
      entries: [...snapshot.entries].reverse(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to load archive" },
      { status: 500 }
    );
  }
}
