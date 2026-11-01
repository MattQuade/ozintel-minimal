import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  deleteInvoiceItem,
  listInvoiceItems,
  saveInvoiceItem,
} from "@/lib/accounting/invoiceItems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    const items = await listInvoiceItems();
    return NextResponse.json({ items });
  });
}

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json();
      const item = await saveInvoiceItem(body);
      return NextResponse.json({ success: true, item });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : "Save failed" },
        { status: 400 }
      );
    }
  });
}

export async function DELETE(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing item" }, { status: 400 });
    }
    const removed = await deleteInvoiceItem(id);
    return NextResponse.json({ success: removed });
  });
}
