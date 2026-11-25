import {
  createTransport,
  smtpBccAddress,
  smtpConfigured,
  smtpFromAddress,
  smtpUser,
} from "@/lib/invoices/sendInvoiceEmail";
import { getSignDoc, readSignPdf, signPdfFileName } from "@/lib/signDocs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeRecipient(raw: string): string {
  const to = String(raw || "").trim();
  if (!EMAIL_RE.test(to) || to.length > 180) throw new Error("Type a valid email address.");
  return to;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Email the signed PDF from the same mailbox that sends invoices. */
export async function sendSignedDocEmail(input: {
  id: string;
  callerEmail: string;
  to: string;
}): Promise<{ to: string; fileName: string }> {
  const to = normalizeRecipient(input.to);
  const doc = await getSignDoc(input.id, input.callerEmail);
  if (!doc) throw new Error("Document not found.");
  const pdf = await readSignPdf(doc.id, input.callerEmail);
  if (!pdf?.length) throw new Error("Document not found.");
  if (!smtpConfigured()) {
    throw new Error(
      "SMTP is not configured — set SMTP_PASSWORD on Fly (VentraIP mailbox password for admin@ozintel.com.au)"
    );
  }
  const fileName = signPdfFileName(doc.fileName, doc.title);
  const subject = fileName.replace(/[\r\n]+/g, " ").slice(0, 180);
  const bcc = smtpBccAddress();
  const transporter = createTransport();
  await transporter.sendMail({
    from: smtpFromAddress(),
    to,
    bcc: bcc && bcc.toLowerCase() !== to.toLowerCase() ? bcc : undefined,
    replyTo: smtpUser(),
    subject,
    text: `The document is attached.\n\n${fileName}\n`,
    html: `<p>The document is attached.</p><p>${escapeHtml(fileName)}</p>`,
    attachments: [{ filename: fileName, content: pdf, contentType: "application/pdf" }],
  });
  return { to, fileName };
}
