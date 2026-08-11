import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { voidInvoice } from "@/lib/accounting/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const { id } = await params;
      const invoice = await voidInvoice(id);
      return NextResponse.json({ success: true, invoice });
    } catch (error) {
      console.error("Invoice void error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Void failed",
        },
        { status: 400 }
      );
    }
  });
}
