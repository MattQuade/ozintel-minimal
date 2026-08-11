import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  readInvoices,
  upsertInvoice,
  type Invoice,
} from "@/lib/accounting/invoices";
import { readCustomers } from "@/lib/accounting/customers";
import { matchCustomerByVoice } from "@/lib/invoices/voiceInvoiceParse";
import {
  applyInvoiceNumberSuffix,
  invoiceDateSuffixFromDate,
  parsePlatformVoiceCommand,
} from "@/lib/voice/platformNav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
              "Didn’t catch that. Try “Open Accounting”, “Edit invoice”, or “Add date to invoice number”.",
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
