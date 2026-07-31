import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { getInvoiceById } from "@/lib/accounting/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const { id } = await params;
    const invoice = await getInvoiceById(id);
    if (!invoice) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Invoice GET error:", error);
    return NextResponse.json(
      { error: "Failed to load invoice" },
      { status: 500 }
    );
  }
}
