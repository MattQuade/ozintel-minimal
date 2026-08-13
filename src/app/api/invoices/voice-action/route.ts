import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  getInvoiceById,
  readInvoices,
  upsertInvoice,
  type Invoice,
} from "@/lib/accounting/invoices";
import { readCustomers } from "@/lib/accounting/customers";
import { matchCustomerByVoice } from "@/lib/invoices/voiceInvoiceParse";
import {
  applyInvoiceVoiceField,
  fieldPrompt,
  type InvoiceVoiceField,
} from "@/lib/invoices/applyInvoiceVoiceField";
import {
  resolveInvoiceRecipient,
  sendInvoiceEmail,
  smtpConfigured,
} from "@/lib/invoices/sendInvoiceEmail";
import {
  applyInvoiceNumberSuffix,
  invoiceDateSuffixFromDate,
  parsePlatformVoiceCommand,
} from "@/lib/voice/platformNav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function latestSendable(invoices: Invoice[], customerId?: string): Invoice | null {
  let list = invoices.filter((i) => i.status !== "void");
  if (customerId) list = list.filter((i) => i.customerId === customerId);
  if (!list.length) return null;
  list.sort((a, b) =>
    String(b.updatedAt || b.createdAt || "").localeCompare(
      String(a.updatedAt || a.createdAt || "")
    )
  );
  return list[0];
}

function latestDraft(invoices: Invoice[]): Invoice | null {
  const drafts = invoices.filter((i) => i.status === "draft");
  if (!drafts.length) return null;
  drafts.sort((a, b) =>
    String(b.updatedAt || b.createdAt || "").localeCompare(
      String(a.updatedAt || a.createdAt || "")
    )
  );
  return drafts[0];
}

/** INV-0246 or INV-0246-0709-26 → 246 */
function primaryInvoiceSeq(number: string): number | null {
  const raw = String(number || "").trim();
  const inv = raw.match(/INV-(\d+)/i);
  if (inv) return parseInt(inv[1], 10);
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

function invoicesMatchingNumber(
  invoices: Invoice[],
  numberQuery: string
): Invoice[] {
  const q = parseInt(String(numberQuery || "").replace(/\D/g, ""), 10);
  if (!Number.isFinite(q)) return [];
  return invoices.filter((inv) => primaryInvoiceSeq(inv.number) === q);
}

function newestInvoice(list: Invoice[]): Invoice {
  const copy = [...list];
  copy.sort((a, b) =>
    String(b.updatedAt || b.createdAt || "").localeCompare(
      String(a.updatedAt || a.createdAt || "")
    )
  );
  return copy[0];
}

/**
 * Execute voice actions that need server state (edit target, number suffix).
 * Body: { transcript: string, invoiceId?: string }
 */
export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json().catch(() => ({}));
      const field = String(body.field || "").trim() as InvoiceVoiceField | "";
      if (field) {
        const invoiceId = String(body.invoiceId || "").trim();
        if (!invoiceId) {
          return NextResponse.json(
            { success: false, error: "Open an invoice first" },
            { status: 400 }
          );
        }
        const invoice = await getInvoiceById(invoiceId);
        if (!invoice) {
          return NextResponse.json(
            { success: false, error: "Invoice not found" },
            { status: 404 }
          );
        }
        const applied = await applyInvoiceVoiceField({
          invoice,
          field,
          value: String(body.value ?? body.transcript ?? ""),
          lineIndex:
            typeof body.lineIndex === "number" ? body.lineIndex : undefined,
          createLine: Boolean(body.createLine),
          asOfDate: String(body.asOfDate || ""),
        });
        return NextResponse.json({
          success: true,
          action: "edit_invoice_field",
          reload: true,
          href: applied.href,
          label: applied.label,
          invoice: {
            id: applied.invoice.id,
            number: applied.invoice.number,
          },
        });
      }

      const transcript = String(body.transcript || "").trim();
      if (!transcript) {
        return NextResponse.json(
          { success: false, error: "transcript required" },
          { status: 400 }
        );
      }

      const cmd = parsePlatformVoiceCommand(transcript);
      if (!cmd) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Didn’t catch that. Try “Open Accounting”, “Open Railway Hotel 246”, or “Edit invoice”.",
          },
          { status: 400 }
        );
      }

      if (cmd.type === "navigate" || cmd.type === "edit_invoices") {
        return NextResponse.json({
          success: true,
          action: cmd.type,
          href: cmd.href,
          label: cmd.label,
        });
      }

      if (cmd.type === "stop_listening") {
        return NextResponse.json({
          success: true,
          action: "stop_listening",
          label: cmd.label,
        });
      }

      if (cmd.type === "open_invoice") {
        const invoices = await readInvoices();
        const byNumber = invoicesMatchingNumber(invoices, cmd.numberQuery);
        let invoice: Invoice | null = null;

        if (cmd.customerQuery) {
          const customers = [
            ...new Map(
              invoices.map((inv) => [
                inv.customerId,
                { id: inv.customerId, name: inv.customerName },
              ])
            ).values(),
          ];
          const { match, ambiguous, candidates } = matchCustomerByVoice(
            cmd.customerQuery,
            customers
          );
          if (ambiguous) {
            return NextResponse.json(
              {
                success: false,
                error: `Several customers match “${cmd.customerQuery}” — pick one`,
                candidates,
                ambiguous: true,
              },
              { status: 409 }
            );
          }
          if (match) {
            const forCustomer = byNumber.filter(
              (inv) => inv.customerId === match.id
            );
            if (forCustomer.length === 1) invoice = forCustomer[0];
            else if (forCustomer.length > 1) invoice = newestInvoice(forCustomer);
            else if (byNumber.length === 1) invoice = byNumber[0];
            else {
              return NextResponse.json(
                {
                  success: false,
                  error: `No invoice ${cmd.numberQuery} for ${match.name}`,
                },
                { status: 404 }
              );
            }
          } else if (byNumber.length === 1) {
            invoice = byNumber[0];
          } else if (byNumber.length > 1) {
            return NextResponse.json(
              {
                success: false,
                error: `Several invoices match ${cmd.numberQuery} — say the customer name too`,
              },
              { status: 409 }
            );
          } else {
            return NextResponse.json(
              {
                success: false,
                error: `No invoice matching “${cmd.customerQuery} ${cmd.numberQuery}”`,
              },
              { status: 404 }
            );
          }
        } else if (byNumber.length === 1) {
          invoice = byNumber[0];
        } else if (byNumber.length > 1) {
          return NextResponse.json(
            {
              success: false,
              error: `Several invoices match ${cmd.numberQuery} — say the customer, e.g. “Open Railway Hotel ${cmd.numberQuery}”`,
            },
            { status: 409 }
          );
        } else {
          return NextResponse.json(
            { success: false, error: `No invoice ${cmd.numberQuery}` },
            { status: 404 }
          );
        }

        if (!invoice) {
          return NextResponse.json(
            { success: false, error: `No invoice ${cmd.numberQuery}` },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          action: "open_invoice",
          href: `/invoices/${invoice.id}`,
          label: `Open ${invoice.number} — ${invoice.customerName}`,
          invoice: { id: invoice.id, number: invoice.number },
        });
      }

      if (cmd.type === "go_back") {
        return NextResponse.json({
          success: true,
          action: "go_back",
          label: cmd.label,
        });
      }

      if (cmd.type === "edit_invoice_number") {
        if (!cmd.suffix && !cmd.useIssueDate) {
          return NextResponse.json({
            success: true,
            action: "edit_invoice_number",
            awaitingSuffix: true,
            label: "Say the number suffix…",
          });
        }
        // Apply suffix using the same path as append_invoice_suffix
        const invoices = await readInvoices();
        const requestedId = String(body.invoiceId || "").trim();
        let invoice = requestedId
          ? invoices.find((i) => i.id === requestedId) || null
          : latestDraft(invoices);

        if (!invoice) {
          return NextResponse.json(
            {
              success: false,
              error: "No draft invoice found to update the number",
            },
            { status: 404 }
          );
        }
        if (invoice.status !== "draft") {
          return NextResponse.json(
            {
              success: false,
              error: `Only draft invoice numbers can change (${invoice.number} is ${invoice.status})`,
            },
            { status: 400 }
          );
        }

        const suffix = cmd.useIssueDate
          ? invoiceDateSuffixFromDate(invoice.issueDate || invoice.orderDate)
          : cmd.suffix;

        if (!suffix) {
          return NextResponse.json(
            { success: false, error: "Could not parse the number suffix" },
            { status: 400 }
          );
        }

        const nextNumber = applyInvoiceNumberSuffix(invoice.number, suffix);
        if (nextNumber === invoice.number) {
          return NextResponse.json({
            success: true,
            action: "edit_invoice_number",
            href: `/invoices/${invoice.id}`,
            label: `Number already ${invoice.number}`,
            invoice,
            suffix,
          });
        }

        const updated = await upsertInvoice({
          id: invoice.id,
          number: nextNumber,
        });

        return NextResponse.json({
          success: true,
          action: "edit_invoice_number",
          href: `/invoices/${updated.id}`,
          label: `Number → ${updated.number}`,
          invoice: updated,
          suffix,
          previousNumber: invoice.number,
        });
      }

      if (cmd.type === "select_customer") {
        const query = String(cmd.customerQuery || "").trim();
        if (!query) {
          return NextResponse.json({
            success: true,
            action: "select_customer",
            href: "/invoices/new",
            label: "Select customer",
          });
        }
        const customers = await readCustomers();
        const { match, candidates, ambiguous } = matchCustomerByVoice(
          query,
          customers
        );
        if (ambiguous) {
          return NextResponse.json(
            {
              success: false,
              error: `Several customers match “${query}” — pick one`,
              ambiguous: true,
              candidates,
            },
            { status: 409 }
          );
        }
        if (!match) {
          return NextResponse.json(
            {
              success: false,
              error: `No customer matching “${query}”`,
              candidates,
            },
            { status: 404 }
          );
        }
        return NextResponse.json({
          success: true,
          action: "select_customer",
          href: `/invoices/new?customerId=${encodeURIComponent(match.id)}`,
          label: `Selected ${match.name}`,
          matchedCustomer: match,
        });
      }

      if (cmd.type === "edit_invoice") {
        const draft = latestDraft(await readInvoices());
        if (!draft) {
          return NextResponse.json(
            {
              success: false,
              error: "No draft invoice to edit — create one first",
            },
            { status: 404 }
          );
        }
        return NextResponse.json({
          success: true,
          action: "edit_invoice",
          href: `/invoices/${draft.id}/edit`,
          label: `Edit ${draft.number}`,
          invoice: { id: draft.id, number: draft.number },
        });
      }

      if (cmd.type === "append_invoice_suffix") {
        const invoices = await readInvoices();
        const requestedId = String(body.invoiceId || "").trim();
        let invoice = requestedId
          ? invoices.find((i) => i.id === requestedId) || null
          : latestDraft(invoices);

        if (!invoice) {
          return NextResponse.json(
            {
              success: false,
              error: "No draft invoice found to update the number",
            },
            { status: 404 }
          );
        }
        if (invoice.status !== "draft") {
          return NextResponse.json(
            {
              success: false,
              error: `Only draft invoice numbers can change (${invoice.number} is ${invoice.status})`,
            },
            { status: 400 }
          );
        }

        const suffix = cmd.useIssueDate
          ? invoiceDateSuffixFromDate(invoice.issueDate || invoice.orderDate)
          : cmd.suffix;

        if (!suffix) {
          return NextResponse.json(
            { success: false, error: "Could not parse the number suffix" },
            { status: 400 }
          );
        }

        const nextNumber = applyInvoiceNumberSuffix(invoice.number, suffix);
        if (nextNumber === invoice.number) {
          return NextResponse.json({
            success: true,
            action: "append_invoice_suffix",
            href: `/invoices/${invoice.id}`,
            label: `Number already ${invoice.number}`,
            invoice,
            suffix,
          });
        }

        const updated = await upsertInvoice({
          id: invoice.id,
          number: nextNumber,
        });

        return NextResponse.json({
          success: true,
          action: "append_invoice_suffix",
          href: `/invoices/${updated.id}`,
          label: `Number → ${updated.number}`,
          invoice: updated,
          suffix,
          previousNumber: invoice.number,
        });
      }

      if (cmd.type === "confirm_send" || cmd.type === "cancel_send") {
        return NextResponse.json({
          success: true,
          action: cmd.type,
          label: cmd.label,
        });
      }

      if (cmd.type === "add_line_item" || cmd.type === "edit_invoice_field") {
        const invoiceId = String(body.invoiceId || "").trim();
        if (!invoiceId) {
          return NextResponse.json(
            {
              success: false,
              error: "Open an invoice first, then say that command",
            },
            { status: 400 }
          );
        }
        const invoice = await getInvoiceById(invoiceId);
        if (!invoice) {
          return NextResponse.json(
            { success: false, error: "Invoice not found" },
            { status: 404 }
          );
        }
        const nextField: InvoiceVoiceField =
          cmd.type === "add_line_item" ? "description" : cmd.field;
        const lineEdit =
          cmd.type === "add_line_item" ||
          nextField === "description" ||
          nextField === "quantity" ||
          nextField === "unitPrice" ||
          nextField === "account" ||
          nextField === "tax";
        return NextResponse.json({
          success: true,
          action: cmd.type,
          needsValue: true,
          field: nextField,
          createLine: cmd.type === "add_line_item",
          lineIndex:
            cmd.type === "edit_invoice_field" ? cmd.lineIndex : undefined,
          invoiceId: invoice.id,
          href: lineEdit
            ? `/invoices/${invoice.id}/edit`
            : `/invoices/${invoice.id}`,
          prompt: fieldPrompt(nextField),
          label: fieldPrompt(nextField),
        });
      }

      if (cmd.type === "email_invoice") {
        const invoices = await readInvoices();
        const requestedId = String(body.invoiceId || "").trim();
        let invoice: Invoice | null = requestedId
          ? invoices.find((i) => i.id === requestedId) || null
          : null;

        if (!invoice) invoice = latestSendable(invoices);
        if (!invoice) {
          return NextResponse.json(
            { success: false, error: "No invoice to email" },
            { status: 404 }
          );
        }

        const { to, customerName } = await resolveInvoiceRecipient(invoice);
        if (!body.confirm) {
          return NextResponse.json({
            success: true,
            action: "email_invoice",
            needsConfirm: true,
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            to,
            customerName,
            href: `/invoices/${invoice.id}`,
            smtpReady: smtpConfigured(),
            label: `Email ${invoice.number} to ${to}? Say send to confirm.`,
          });
        }

        const sent = await sendInvoiceEmail({ invoice, to });
        return NextResponse.json({
          success: true,
          action: "email_invoice",
          sent: true,
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          to: sent.to,
          href: `/invoices/${invoice.id}`,
          label: `Sent ${invoice.number} to ${sent.to}`,
        });
      }

      return NextResponse.json(
        { success: false, error: "Unsupported command" },
        { status: 400 }
      );
    } catch (error) {
      console.error("Invoice voice-action error:", error);
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error ? error.message : "Voice command failed",
        },
        { status: 400 }
      );
    }
  });
}
