import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  readInvoices,
  recordInvoicePayment,
} from "@/lib/accounting/invoices";
import { readLedger } from "@/lib/accounting/store";
import { readImportBatch } from "@/lib/accounting/importBatch";
import { toIsoDateInput } from "@/lib/accounting/dates";
import { round2 } from "@/lib/accounting/invoiceMath";
import {
  groupPartialPayments,
  type PartialDeposit,
  type PartialInvoice,
} from "@/lib/accounting/partialPayments";
import { containsAsPhrase } from "@/core/rules/rulesEngine";
import { amountsMatch } from "@/lib/accounting/invoiceDepositMatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function depositsFromLedger(
  entries: Array<Record<string, unknown>>,
  linked: Set<string>
): PartialDeposit[] {
  const out: PartialDeposit[] = [];
  for (const entry of entries) {
    const role = String(entry.journalRole || "");
    const source = String(entry.source || "");
    const id = String(entry.id || "");
    if (!id || linked.has(id)) continue;
    if (role === "gst" || role === "personal" || role === "ar") continue;
    const bankFace = role === "bank" || (source === "bank-import" && !role);
    if (!bankFace) continue;
    const amount = round2(Number(entry.amount) || 0);
    if (amount <= 0.009) continue;
    const ledgerEntryId = role === "bank" ? id.replace(/-bank$/, "") : id;
    if (linked.has(ledgerEntryId)) continue;
    out.push({
      id,
      ledgerEntryId,
      date: toIsoDateInput(String(entry.date || "")) || String(entry.date || ""),
      amount,
      description: String(entry.description || ""),
      committed: true,
    });
  }
  return out;
}

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    const [invoices, ledger, batch] = await Promise.all([
      readInvoices(),
      readLedger(),
      readImportBatch(),
    ]);
    const linked = new Set<string>();
    for (const inv of invoices) {
      for (const payment of inv.payments || []) {
        for (const id of payment.ledgerEntryIds || []) linked.add(String(id));
      }
    }
    const open: PartialInvoice[] = invoices.map((inv) => ({
      id: inv.id,
      number: inv.number,
      customerName: inv.customerName,
      matchKeyword: inv.matchKeyword,
      total: inv.total,
      amountDue: inv.amountDue,
      status: inv.status,
    }));
    const deposits: PartialDeposit[] = [
      ...depositsFromLedger(ledger as Array<Record<string, unknown>>, linked),
      ...batch
        .filter((line) => line.amount > 0.009)
        .map((line) => ({
          id: line.id,
          date: line.date,
          amount: line.amount,
          description: line.bankDescription,
          committed: false,
        })),
    ];
    return NextResponse.json({ groups: groupPartialPayments(open, deposits) });
  });
}

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body.invoiceId || "").trim();
    const invoices = await readInvoices();
    const inv = invoices.find((item) => item.id === invoiceId);
    if (!inv) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      );
    }
    if (inv.status !== "authorised" && inv.status !== "paid") {
      return NextResponse.json(
        { success: false, error: "Authorise the invoice before applying payments" },
        { status: 400 }
      );
    }
    const keyword = String(inv.matchKeyword || "").trim();
    if (!keyword) {
      return NextResponse.json(
        { success: false, error: "This invoice has no bank keyword" },
        { status: 400 }
      );
    }
    const ledger = await readLedger();
    const linked = new Set<string>();
    for (const item of invoices) {
      for (const payment of item.payments || []) {
        for (const id of payment.ledgerEntryIds || []) linked.add(String(id));
      }
    }
    const deposits = depositsFromLedger(
      ledger as Array<Record<string, unknown>>,
      linked
    )
      .filter(
        (deposit) =>
          containsAsPhrase(deposit.description, keyword) &&
          !amountsMatch(deposit.amount, inv.total)
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    let applied = 0;
    let current = inv;
    for (const deposit of deposits) {
      if (current.amountDue <= 0.009) break;
      current = await recordInvoicePayment(current.id, {
        amount: Math.min(deposit.amount, current.amountDue),
        date: deposit.date,
        bankAccountId: String(
          ledger.find((entry) => entry.id === deposit.ledgerEntryId)?.bankAccountId ||
            ledger.find((entry) => entry.id === deposit.id)?.bankAccountId ||
            ""
        ),
        note: `Partial payment · “${deposit.description.slice(0, 120)}”`,
        reconciled: true,
        postJournal: false,
        bankLedgerEntryId: deposit.ledgerEntryId,
      });
      applied += 1;
    }
    return NextResponse.json({
      success: true,
      applied,
      invoice: {
        id: current.id,
        number: current.number,
        status: current.status,
        amountDue: current.amountDue,
      },
    });
  });
}
