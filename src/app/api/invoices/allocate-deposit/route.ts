import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  allocateBankDepositToInvoice,
  autoMatchDepositToInvoice,
  listOpenInvoicesForAllocation,
} from "@/lib/accounting/invoices";
import { toIsoDateInput } from "@/lib/accounting/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Open invoices for bank-import allocate dropdown. */
export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const invoices = await listOpenInvoicesForAllocation();
      return NextResponse.json({
        success: true,
        invoices: invoices.map((inv) => ({
          id: inv.id,
          number: inv.number,
          customerName: inv.customerName,
          status: inv.status,
          amountDue: inv.amountDue,
          matchKeyword: inv.matchKeyword || "",
        })),
      });
    } catch (error) {
      console.error("Allocate-deposit GET error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to load open invoices" },
        { status: 500 }
      );
    }
  });
}

/**
 * Allocate a bank deposit to an invoice (posts payment journal).
 * Body: { invoiceId?, amount, date, bankAccountId, description?, replaceLedgerEntryId?, autoMatch? }
 * When autoMatch is true and invoiceId omitted, unique keyword+amount match is applied.
 */
export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json();
      const amount = Number(body.amount);
      const dateRaw = String(body.date || "");
      const date = toIsoDateInput(dateRaw) || dateRaw.slice(0, 10);
      const bankAccountId = String(body.bankAccountId || "").trim();
      const description = body.description ? String(body.description) : "";
      const replaceLedgerEntryId = body.replaceLedgerEntryId
        ? String(body.replaceLedgerEntryId)
        : undefined;

      if (!bankAccountId) {
        return NextResponse.json(
          { success: false, error: "bankAccountId required" },
          { status: 400 }
        );
      }
      if (!(amount > 0)) {
        return NextResponse.json(
          { success: false, error: "Deposit amount must be positive" },
          { status: 400 }
        );
      }

      let invoiceId = String(body.invoiceId || "").trim();
      let autoMatched = Boolean(body.autoMatched || body.autoMatch);

      if (!invoiceId && (body.autoMatch || body.autoMatched)) {
        const matched = await autoMatchDepositToInvoice({
          amount,
          description,
          excludeInvoiceIds: Array.isArray(body.excludeInvoiceIds)
            ? body.excludeInvoiceIds.map(String)
            : undefined,
        });
        if (!matched) {
          return NextResponse.json(
            { success: false, error: "No unique invoice match", matched: false },
            { status: 404 }
          );
        }
        invoiceId = matched.id;
        autoMatched = true;
      }

      if (!invoiceId) {
        return NextResponse.json(
          { success: false, error: "invoiceId required" },
          { status: 400 }
        );
      }

      const invoice = await allocateBankDepositToInvoice({
        invoiceId,
        amount,
        date,
        bankAccountId,
        description,
        replaceLedgerEntryId,
        autoMatched,
      });

      return NextResponse.json({
        success: true,
        invoice,
        autoMatched,
      });
    } catch (error) {
      console.error("Allocate-deposit POST error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Allocate failed",
        },
        { status: 400 }
      );
    }
  });
}
