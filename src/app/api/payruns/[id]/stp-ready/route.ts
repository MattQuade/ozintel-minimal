import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { markPayRunStpReady } from "@/lib/accounting/payRuns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Placeholder: mark posted pay run as ready for future STP lodgement (no ATO submit). */
export async function POST(req: Request, { params }: Params) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const { id } = await params;
      const payRun = await markPayRunStpReady(id);
      return NextResponse.json({ success: true, payRun });
    } catch (error) {
      console.error("Pay run STP-ready error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed",
        },
        { status: 400 }
      );
    }
  });
}
