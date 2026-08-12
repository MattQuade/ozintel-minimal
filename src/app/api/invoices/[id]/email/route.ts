import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { getInvoiceById } from "@/lib/accounting/invoices";
import {
  resolveInvoiceRecipient,
  sendInvoiceEmail,
  smtpConfigured,
} from "@/lib/invoices/sendInvoiceEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Preview or send an invoice email.
 * Body: { confirm?: boolean, to?: string }
 * confirm false/omitted → returns recipient without sending.
 */
export async function POST(req: Request, { params }: Params) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const { id } = await params;
      const invoice = await getInvoiceById(id);
      if (!invoice) {
        return NextResponse.json(
          { success: false, error: "Invoice not found" },
          { status: 404 }
        );
      }

      const body = await req.json().catch(() => ({}));
      const confirm = Boolean(body.confirm);
      const { to, customerName } = await resolveInvoiceRecipient(
        invoice,
        body.to
      );

      if (!confirm) {
        return NextResponse.json({
          success: true,
          needsConfirm: true,
          to,
          customerName,
          invoiceNumber: invoice.number,
          invoiceId: invoice.id,
          smtpReady: smtpConfigured(),
          label: `Email ${invoice.number} to ${to}? Say send to confirm.`,
        });
      }

      const sent = await sendInvoiceEmail({ invoice, to });
      return NextResponse.json({
        success: true,
        sent: true,
        to: sent.to,
        invoiceNumber: invoice.number,
        invoiceId: invoice.id,
        href: `/invoices/${invoice.id}`,
        label: `Sent ${invoice.number} to ${sent.to}`,
      });
    } catch (error) {
      console.error("Invoice email error:", error);
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to email invoice",
        },
        { status: 400 }
      );
    }
  });
}
