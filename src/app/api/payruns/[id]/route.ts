import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  getPayRunById,
  updateDraftPayRun,
} from "@/lib/accounting/payRuns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const { id } = await params;
    const payRun = await getPayRunById(id);
    if (!payRun) {
      return NextResponse.json(
        { error: "Pay run not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(payRun);
  } catch (error) {
    console.error("Pay run GET error:", error);
    return NextResponse.json(
      { error: "Failed to load pay run" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const { id } = await params;
    const body = await req.json();
    const payRun = await updateDraftPayRun(id, body || {});
    return NextResponse.json({ success: true, payRun });
  } catch (error) {
    console.error("Pay run PATCH error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Update failed",
      },
      { status: 400 }
    );
  }
}
