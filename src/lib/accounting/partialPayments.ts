import { round2 } from "@/lib/accounting/invoiceMath";
import { containsAsPhrase } from "@/core/rules/rulesEngine";
import { amountsMatch } from "@/lib/accounting/invoiceDepositMatch";

export type PartialInvoice = {
  id: string;
  number: string;
  customerName: string;
  matchKeyword: string;
  total: number;
  amountDue: number;
  status: string;
};

export type PartialDeposit = {
  id: string;
  date: string;
  amount: number;
  description: string;
  committed: boolean;
  /** Ledger id to attach when the user applies the payment. */
  ledgerEntryId?: string;
};

export type PartialPaymentGroup = {
  keyword: string;
  invoices: PartialInvoice[];
  payments: PartialDeposit[];
  paidTotal: number;
  invoiceTotal: number;
};

export function groupPartialPayments(
  invoices: PartialInvoice[],
  deposits: PartialDeposit[]
): PartialPaymentGroup[] {
  const open = invoices.filter(
    (inv) =>
      (inv.status === "authorised" || inv.status === "paid") &&
      String(inv.matchKeyword || "").trim() &&
      (Number(inv.amountDue) || 0) > 0.009
  );
  const byKeyword = new Map<string, PartialInvoice[]>();
  for (const inv of open) {
    const key = inv.matchKeyword.trim().toLowerCase();
    const list = byKeyword.get(key) || [];
    list.push(inv);
    byKeyword.set(key, list);
  }

  const groups: PartialPaymentGroup[] = [];
  for (const list of byKeyword.values()) {
    const keyword = list[0].matchKeyword.trim();
    const payments = deposits.filter((deposit) => {
      if (!containsAsPhrase(deposit.description, keyword)) return false;
      const coversAnInvoice = list.some((inv) =>
        amountsMatch(deposit.amount, inv.total)
      );
      return !coversAnInvoice;
    });
    if (payments.length === 0) continue;
    const paidTotal = round2(
      payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
    );
    const invoiceTotal = round2(
      list.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0)
    );
    groups.push({
      keyword,
      invoices: list.slice().sort((a, b) => a.number.localeCompare(b.number)),
      payments: payments
        .slice()
        .sort((a, b) => String(a.date).localeCompare(String(b.date))),
      paidTotal,
      invoiceTotal,
    });
  }
  return groups.sort((a, b) => a.keyword.localeCompare(b.keyword));
}
