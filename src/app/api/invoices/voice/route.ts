import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { readCustomers } from "@/lib/accounting/customers";
import {
  createDraftFromCustomerLast,
  readInvoices,
  upsertInvoice,
} from "@/lib/accounting/invoices";
import {
  matchCustomerByVoice,
  parseVoiceInvoiceTranscript,
} from "@/lib/invoices/voiceInvoiceParse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_REVENUE_CODE = "0105";

/**
 * Voice / typed invoice command → draft invoice.
 * Body: { transcript: string, customerId?: string }
 */
export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const body = await req.json().catch(() => ({}));
    const transcript = String(body.transcript || "").trim();
    if (!transcript) {
      return NextResponse.json(
        { success: false, error: "transcript required" },
        { status: 400 }
      );
    }

    const intent = parseVoiceInvoiceTranscript(transcript);
    if (intent.mode === "unknown" || !intent.customerQuery) {
      return NextResponse.json(
        {
          success: false,
          error: intent.notes[0] || "Could not understand that command",
          intent,
        },
        { status: 400 }
      );
    }

    const customers = await readCustomers();
    let customerId = String(body.customerId || "").trim();
    let matchedName = "";

    if (customerId) {
      const c = customers.find((x) => x.id === customerId);
      if (!c) {
        return NextResponse.json(
          { success: false, error: "Customer not found", intent },
          { status: 404 }
        );
      }
      matchedName = c.name;
    } else {
      const { match, candidates, ambiguous } = matchCustomerByVoice(
        intent.customerQuery,
        customers
      );
      if (ambiguous) {
        return NextResponse.json(
          {
            success: false,
            error: `Several customers match “${intent.customerQuery}” — pick one`,
            intent,
            candidates,
            ambiguous: true,
          },
          { status: 409 }
        );
      }
      if (!match) {
        return NextResponse.json(
          {
            success: false,
            error: `No customer matching “${intent.customerQuery}”`,
            intent,
            candidates,
          },
          { status: 404 }
        );
      }
      customerId = match.id;
      matchedName = match.name;
    }

    if (intent.mode === "from_last") {
      const result = await createDraftFromCustomerLast(customerId);
      return NextResponse.json({
        success: true,
        mode: "from_last",
        invoice: result.invoice,
        reusedDraft: result.reusedDraft,
        fromInvoiceNumber: result.fromInvoiceNumber,
        matchedCustomer: { id: customerId, name: matchedName },
        intent,
      });
    }

    // with_lines — draft with spoken line items (reuse open draft if any)
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + 14 * 86400000)
      .toISOString()
      .slice(0, 10);
    const existingDraft = (await readInvoices()).find(
      (inv) => inv.customerId === customerId && inv.status === "draft"
    );

    const invoice = await upsertInvoice({
      id: existingDraft?.id,
      number: existingDraft?.number,
      customerId,
      issueDate: today,
      dueDate,
      notes: `Created by voice: “${transcript}”`,
      lines: intent.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        accountCode: DEFAULT_REVENUE_CODE,
        hasGST: true,
      })),
    });

    return NextResponse.json({
      success: true,
      mode: "with_lines",
      invoice,
      matchedCustomer: { id: customerId, name: matchedName },
      intent,
    });
  } catch (error) {
    console.error("Invoice voice POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Voice invoice failed",
      },
      { status: 400 }
    );
  }
}
