import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { getInvoiceById, upsertInvoice } from "@/lib/accounting/invoices";

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

/** Update notes / matchKeyword / print fields (any status); number editable while draft. */
export async function PATCH(req: Request, { params }: Params) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const { id } = await params;
    const body = await req.json();
    const patch: Parameters<typeof upsertInvoice>[0] = {
      id,
      notes: body.notes,
      matchKeyword: body.matchKeyword,
    };
    if (body.number !== undefined) {
      patch.number = body.number;
    }
    if (body.orderDate !== undefined) {
      patch.orderDate = body.orderDate;
    }
    if (body.subject !== undefined) {
      patch.subject = body.subject;
    }
    const invoice = await upsertInvoice(patch);
    return NextResponse.json({ success: true, invoice });
  } catch (error) {
    console.error("Invoice PATCH error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Update failed",
      },
      { status: 400 }
    );
  }
}
