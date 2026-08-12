import nodemailer from "nodemailer";
import type { Invoice } from "@/lib/accounting/invoices";
import { getCustomerById } from "@/lib/accounting/customers";
import { buildInvoiceEmail } from "@/lib/invoices/buildInvoiceEmail";
import { buildInvoicePdf } from "@/lib/invoices/buildInvoicePdf";
import { INVOICE_BRAND } from "@/lib/invoices/invoiceBrand";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function smtpConfigured(): boolean {
  return Boolean(String(process.env.SMTP_PASSWORD || "").trim());
}

export function smtpFromAddress(): string {
  const from = String(process.env.SMTP_FROM || "").trim();
  if (from) return from;
  const user = String(process.env.SMTP_USER || "admin@ozintel.com.au").trim();
  return `${INVOICE_BRAND.businessName} <${user}>`;
}

function createTransport() {
  const host = String(process.env.SMTP_HOST || "ventraip.email").trim();
  const port = Number(process.env.SMTP_PORT || 587) || 587;
  const user = String(process.env.SMTP_USER || "admin@ozintel.com.au").trim();
  const pass = String(process.env.SMTP_PASSWORD || "").trim();
  if (!pass) {
    throw new Error(
      "SMTP is not configured — set SMTP_PASSWORD in Render (VentraIP mailbox password for admin@ozintel.com.au)"
    );
  }
  const secure =
    String(process.env.SMTP_SECURE || "").toLowerCase() === "true" ||
    port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
  });
}

export async function resolveInvoiceRecipient(
  invoice: Invoice,
  overrideTo?: string
): Promise<{ to: string; customerName: string }> {
  const override = String(overrideTo || "").trim();
  if (override) {
    if (!EMAIL_RE.test(override)) {
      throw new Error(`Invalid email address: ${override}`);
    }
    return { to: override, customerName: invoice.customerName };
  }
  const customer = await getCustomerById(invoice.customerId);
  const to = String(customer?.email || "").trim();
  if (!to || !EMAIL_RE.test(to)) {
    throw new Error(
      `No email on file for ${invoice.customerName} — add one on the customer record first`
    );
  }
  return { to, customerName: invoice.customerName };
}

export async function sendInvoiceEmail(input: {
  invoice: Invoice;
  to: string;
}): Promise<{ messageId: string; to: string }> {
  const { invoice, to } = input;
  if (invoice.status === "void") {
    throw new Error("Cannot email a void invoice");
  }
  const { subject, text, html } = buildInvoiceEmail(invoice);
  const pdf = await buildInvoicePdf(invoice);
  const safeNumber = String(invoice.number || "invoice").replace(
    /[^\w.-]+/g,
    "-"
  );
  const transporter = createTransport();
  const info = await transporter.sendMail({
    from: smtpFromAddress(),
    to,
    replyTo: String(process.env.SMTP_USER || "admin@ozintel.com.au").trim(),
    subject,
    text,
    html,
    attachments: [
      {
        filename: `Invoice-${safeNumber}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });
  return { messageId: String(info.messageId || ""), to };
}
