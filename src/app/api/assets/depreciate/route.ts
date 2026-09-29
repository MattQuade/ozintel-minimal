import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { runDepreciation } from "@/lib/accounting/assets";
import { getAuFyBounds } from "@/lib/accounting/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json().catch(() => ({}));
      const fy = getAuFyBounds();
      const result = await runDepreciation({
        from: String(body.from || fy.from),
        to: String(body.to || fy.to),
        preview: Boolean(body.preview),
      });
      return NextResponse.json({ success: true, ...result });
    } catch (error) {
      console.error("Depreciation run error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Run failed",
        },
        { status: 400 }
      );
    }
  });
}
