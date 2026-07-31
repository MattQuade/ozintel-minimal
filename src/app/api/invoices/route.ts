import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  deleteInvoice,
  readInvoices,
  upsertInvoice,
} from "@/lib/accounting/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const invoices = await readInvoices();
    invoices.sort((a, b) =>
      String(b.issueDate).localeCompare(String(a.issueDate))
    );
    return NextResponse.json(invoices);
  } catch (error) {
    console.error("Invoices GET error:", error);
    return NextResponse.json(
      { error: "Failed to load invoices" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const body = await req.json();
    const invoice = await upsertInvoice(body || {});
    return NextResponse.json({ success: true, invoice });
  } catch (error) {
    console.error("Invoices POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Save failed",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json(
        { success: false, error: "id required" },
        { status: 400 }
      );
    }
    const ok = await deleteInvoice(id);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Invoices DELETE error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Delete failed",
      },
      { status: 400 }
    );
  }
}
