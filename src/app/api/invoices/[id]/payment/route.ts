import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { recordInvoicePayment } from "@/lib/accounting/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const { id } = await params;
      const body = await req.json();
      const invoice = await recordInvoicePayment(id, {
        amount: Number(body.amount),
        date: String(body.date || ""),
        bankAccountId: String(body.bankAccountId || ""),
        note: body.note ? String(body.note) : undefined,
      });
      return NextResponse.json({ success: true, invoice });
    } catch (error) {
      console.error("Invoice payment error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Payment failed",
        },
        { status: 400 }
      );
    }
  });
}
