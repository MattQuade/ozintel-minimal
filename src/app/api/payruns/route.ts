import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  createPayRun,
  deletePayRun,
  readPayRuns,
} from "@/lib/accounting/payRuns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const runs = await readPayRuns();
      runs.sort((a, b) =>
        String(b.periodEnd || "").localeCompare(String(a.periodEnd || ""))
      );
      return NextResponse.json(runs);
    } catch (error) {
      console.error("Pay runs GET error:", error);
      return NextResponse.json(
        { error: "Failed to load pay runs" },
        { status: 500 }
      );
    }
  });
}

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json();
      const payRun = await createPayRun(body || {});
      return NextResponse.json({ success: true, payRun });
    } catch (error) {
      console.error("Pay runs POST error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Create failed",
        },
        { status: 400 }
      );
    }
  });
}

export async function DELETE(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json().catch(() => ({}));
      const id = String(body.id || "").trim();
      if (!id) {
        return NextResponse.json(
          { success: false, error: "id required" },
          { status: 400 }
        );
      }
      const ok = await deletePayRun(id);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: "Pay run not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("Pay runs DELETE error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Delete failed",
        },
        { status: 400 }
      );
    }
  });
}
