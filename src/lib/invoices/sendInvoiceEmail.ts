import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import nodemailer from "nodemailer";
import type { Invoice } from "@/lib/accounting/invoices";
import { recordInvoiceEmailSend } from "@/lib/accounting/invoices";
import { getCustomerById } from "@/lib/accounting/customers";
import { getDataOwnerEmail } from "@/lib/dataOwnerContext";
import { buildInvoiceEmail } from "@/lib/invoices/buildInvoiceEmail";
import { buildInvoicePdf } from "@/lib/invoices/buildInvoicePdf";
import { INVOICE_BRAND, displayInvoiceNumber } from "@/lib/invoices/invoiceBrand";

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

function smtpUser(): string {
  return String(process.env.SMTP_USER || "admin@ozintel.com.au").trim();
}

/** BCC so a copy lands in the ozintel mailbox (SMTP never writes Sent itself). */
function smtpBccAddress(): string {
  const explicit = String(process.env.SMTP_BCC || "").trim();
  if (explicit) return explicit;
  return smtpUser();
}

function createTransport() {
  const host = String(process.env.SMTP_HOST || "ventraip.email").trim();
  const port = Number(process.env.SMTP_PORT || 587) || 587;
  const user = smtpUser();
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

function tokenSecret(): string {
  return (
    String(process.env.OZINTEL_SESSION_SECRET || "").trim() ||
    String(process.env.SMTP_PASSWORD || "").trim() ||
    "ozintel-invoice-open"
  );
}

export function publicInvoiceSiteOrigin(): string {
  const fromEnv =
    process.env.OZINTEL_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "";
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* ignore */
    }
  }
  return "https://ozintel.com.au";
}

/** Signed open-tracking token (includes owner silo for the public pixel). */
export function makeInvoiceOpenToken(input: {
  ownerEmail: string;
  invoiceId: string;
}): string {
  const payload = {
    o: String(input.ownerEmail || "").trim().toLowerCase(),
    i: String(input.invoiceId || "").trim(),
    n: randomBytes(8).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sig = createHmac("sha256", tokenSecret())
    .update(body)
    .digest("base64url")
    .slice(0, 22);
  return `${body}.${sig}`;
}

export function parseInvoiceOpenToken(
  token: string
): { ownerEmail: string; invoiceId: string } | null {
  const raw = String(token || "").trim();
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expect = createHmac("sha256", tokenSecret())
    .update(body)
    .digest("base64url")
    .slice(0, 22);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as { o?: string; i?: string };
    const ownerEmail = String(parsed.o || "").trim().toLowerCase();
    const invoiceId = String(parsed.i || "").trim();
    if (!ownerEmail || !invoiceId) return null;
    return { ownerEmail, invoiceId };
  } catch {
    return null;
  }
}

export function invoiceOpenPixelUrl(openToken: string): string {
  const origin = publicInvoiceSiteOrigin();
  return `${origin}/api/invoices/track/${encodeURIComponent(openToken)}`;
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
}): Promise<{ messageId: string; to: string; openToken: string }> {
  const { invoice, to } = input;
  if (invoice.status === "void") {
    throw new Error("Cannot email a void invoice");
  }
  const ownerEmail = getDataOwnerEmail() || smtpUser();
  const openToken = makeInvoiceOpenToken({
    ownerEmail,
    invoiceId: invoice.id,
  });
  const { subject, text, html } = buildInvoiceEmail(invoice, {
    openPixelUrl: invoiceOpenPixelUrl(openToken),
  });
  const pdf = await buildInvoicePdf(invoice);
  const safeNumber = displayInvoiceNumber(invoice.number || "invoice").replace(
    /[^\w.-]+/g,
    "-"
  );
  const transporter = createTransport();
  const bcc = smtpBccAddress();
  const info = await transporter.sendMail({
    from: smtpFromAddress(),
    to,
    // SMTP does not write Sent; BCC gives admin@ a mailbox copy of every send.
    bcc: bcc && bcc.toLowerCase() !== to.toLowerCase() ? bcc : undefined,
    replyTo: smtpUser(),
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
  const messageId = String(info.messageId || "");
  await recordInvoiceEmailSend({
    invoiceId: invoice.id,
    to,
    messageId,
    openToken,
  });
  return { messageId, to, openToken };
}
