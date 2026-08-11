import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { postPayRun } from "@/lib/accounting/payRuns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const { id } = await params;
      const payRun = await postPayRun(id);
      return NextResponse.json({ success: true, payRun });
    } catch (error) {
      console.error("Pay run post error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Post failed",
        },
        { status: 400 }
      );
    }
  });
}
