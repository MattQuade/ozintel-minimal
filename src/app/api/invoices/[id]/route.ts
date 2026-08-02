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

/**
 * Draft: full structural edit (customer, dates, lines, notes, keyword, number).
 * Authorised/paid/void: notes + matchKeyword only (enforced in upsertInvoice).
 */
export async function PATCH(req: Request, { params }: Params) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const { id } = await params;
    const body = await req.json();
    const existing = await getInvoiceById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      );
    }

    const patch: Parameters<typeof upsertInvoice>[0] = {
      id,
      notes: body.notes,
      matchKeyword: body.matchKeyword,
    };
    if (body.number !== undefined) {
      patch.number = body.number;
    }

    if (existing.status === "draft") {
      if (body.customerId !== undefined) patch.customerId = body.customerId;
      if (body.issueDate !== undefined) patch.issueDate = body.issueDate;
      if (body.dueDate !== undefined) patch.dueDate = body.dueDate;
      if (Array.isArray(body.lines)) patch.lines = body.lines;
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
