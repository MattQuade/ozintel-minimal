import { promises as fs } from "fs";
import {
  getAccountingDataDir,
  getInvoicesFilePath,
} from "@/lib/dataPaths";
import {
  appendLedgerEntries,
  readBankAccounts,
  readCoa,
  type LedgerEntry,
} from "@/lib/accounting/store";
import { getCustomerById } from "@/lib/accounting/customers";

export type InvoiceStatus = "draft" | "authorised" | "paid" | "void";

export type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  /** Unit price excluding GST */
  unitPrice: number;
  accountCode: string;
  accountName: string;
  hasGST: boolean;
};

export type InvoicePayment = {
  id: string;
  date: string;
  amount: number;
  bankAccountId: string;
  bankAccountName: string;
  ledgerEntryIds: string[];
  note: string;
  createdAt: string;
};

export type Invoice = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  lines: InvoiceLine[];
  status: InvoiceStatus;
  /** Ex GST */
  subtotal: number;
  gstTotal: number;
  /** Incl GST */
  total: number;
  amountPaid: number;
  amountDue: number;
  notes: string;
  ledgerEntryIds: string[];
  journalRef: string;
  voidLedgerEntryIds: string[];
  payments: InvoicePayment[];
  authorisedAt?: string;
  voidedAt?: string;
  createdAt: string;
  updatedAt: string;
};

const AR_CODE = "2101";
const GST_CODE = "820";
const GST_RATE = 0.1;

let invoicesChain: Promise<unknown> = Promise.resolve();
function withInvoicesLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = invoicesChain.then(fn, fn);
  invoicesChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function ensureDir() {
  await fs.mkdir(getAccountingDataDir(), { recursive: true });
}

async function writeInvoicesUnlocked(invoices: Invoice[]) {
  await ensureDir();
  const target = getInvoicesFilePath();
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(invoices, null, 2), "utf8");
  try {
    await fs.rename(tmp, target);
  } catch {
    await fs.copyFile(tmp, target);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

async function readInvoicesUnlocked(): Promise<Invoice[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(getInvoicesFilePath(), "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as Invoice[]) : [];
  } catch {
    await writeInvoicesUnlocked([]);
    return [];
  }
}

export async function readInvoices(): Promise<Invoice[]> {
  return readInvoicesUnlocked();
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const invoices = await readInvoicesUnlocked();
  return invoices.find((inv) => inv.id === id) || null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeLineTotals(line: InvoiceLine): {
  excl: number;
  gst: number;
  incl: number;
} {
  const excl = round2(
    (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
  );
  const gst = line.hasGST ? round2(excl * GST_RATE) : 0;
  return { excl, gst, incl: round2(excl + gst) };
}

export function computeInvoiceTotals(lines: InvoiceLine[]): {
  subtotal: number;
  gstTotal: number;
  total: number;
} {
  let subtotal = 0;
  let gstTotal = 0;
  for (const line of lines) {
    const t = computeLineTotals(line);
    subtotal = round2(subtotal + t.excl);
    gstTotal = round2(gstTotal + t.gst);
  }
  return {
    subtotal,
    gstTotal,
    total: round2(subtotal + gstTotal),
  };
}

function nextInvoiceNumber(invoices: Invoice[]): string {
  let max = 0;
  for (const inv of invoices) {
    const m = String(inv.number || "").match(/INV-(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `INV-${String(max + 1).padStart(4, "0")}`;
}

function normalizeLine(input: Partial<InvoiceLine>, index: number): InvoiceLine {
  const description = String(input.description || "").trim();
  const accountCode = String(input.accountCode || "").trim();
  if (!description) throw new Error(`Line ${index + 1}: description required`);
  if (!accountCode) throw new Error(`Line ${index + 1}: account required`);
  return {
    id: String(input.id || `line-${Date.now()}-${index}`),
    description,
    quantity: Number(input.quantity) || 0,
    unitPrice: Number(input.unitPrice) || 0,
    accountCode,
    accountName: String(input.accountName || "").trim(),
    hasGST: input.hasGST !== false,
  };
}

async function enrichLines(lines: InvoiceLine[]): Promise<InvoiceLine[]> {
  const coa = await readCoa();
  const byCode = new Map(coa.map((a) => [a.code, a]));
  return lines.map((line) => {
    const acc = byCode.get(line.accountCode);
    return {
      ...line,
      accountName: line.accountName || acc?.name || "",
      hasGST: acc?.noGST ? false : line.hasGST,
    };
  });
}

function applyMoneyFields(
  invoice: Invoice,
  totals: { subtotal: number; gstTotal: number; total: number }
): Invoice {
  const amountPaid = round2(invoice.amountPaid || 0);
  const amountDue = round2(Math.max(0, totals.total - amountPaid));
  let status = invoice.status;
  if (status === "authorised" || status === "paid") {
    status = amountDue <= 0.009 && totals.total > 0 ? "paid" : "authorised";
  }
  return {
    ...invoice,
    ...totals,
    amountPaid,
    amountDue,
    status,
  };
}

export async function upsertInvoice(
  input: Partial<Invoice> & { lines?: Partial<InvoiceLine>[] }
): Promise<Invoice> {
  return withInvoicesLock(async () => {
    const invoices = await readInvoicesUnlocked();
    const id = input.id ? String(input.id) : "";
    const idx = id ? invoices.findIndex((inv) => inv.id === id) : -1;
    const existing = idx >= 0 ? invoices[idx] : undefined;

    if (
      existing &&
      (existing.status === "authorised" ||
        existing.status === "paid" ||
        existing.status === "void")
    ) {
      // Allow notes-only style edits? MVP: block structural edits after authorise
      if (input.status && input.status !== existing.status) {
        // status changes go through authorise/pay/void actions
      }
      const editableNotes = String(input.notes ?? existing.notes ?? "");
      const next: Invoice = {
        ...existing,
        notes: editableNotes,
        updatedAt: new Date().toISOString(),
      };
      invoices[idx] = next;
      await writeInvoicesUnlocked(invoices);
      return next;
    }

    const customerId = String(input.customerId || existing?.customerId || "").trim();
    if (!customerId) throw new Error("Customer is required");
    const customer = await getCustomerById(customerId);
    if (!customer) throw new Error("Customer not found");

    const rawLines = Array.isArray(input.lines)
      ? input.lines
      : existing?.lines || [];
    if (rawLines.length === 0) throw new Error("At least one line item is required");
    const lines = await enrichLines(
      rawLines.map((l, i) => normalizeLine(l, i))
    );
    const totals = computeInvoiceTotals(lines);
    const now = new Date().toISOString();

    const base: Invoice = {
      id: existing?.id || `INV-${Date.now()}`,
      number: existing?.number || nextInvoiceNumber(invoices),
      customerId,
      customerName: customer.name,
      issueDate: String(
        input.issueDate || existing?.issueDate || now.slice(0, 10)
      ),
      dueDate: String(
        input.dueDate ||
          existing?.dueDate ||
          new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
      ),
      lines,
      status: "draft",
      subtotal: totals.subtotal,
      gstTotal: totals.gstTotal,
      total: totals.total,
      amountPaid: 0,
      amountDue: totals.total,
      notes: String(input.notes ?? existing?.notes ?? "").trim(),
      ledgerEntryIds: existing?.ledgerEntryIds || [],
      journalRef: existing?.journalRef || "",
      voidLedgerEntryIds: existing?.voidLedgerEntryIds || [],
      payments: existing?.payments || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const next = applyMoneyFields(base, totals);
    if (idx >= 0) invoices[idx] = next;
    else invoices.push(next);
    await writeInvoicesUnlocked(invoices);
    return next;
  });
}

export async function deleteInvoice(id: string): Promise<boolean> {
  return withInvoicesLock(async () => {
    const invoices = await readInvoicesUnlocked();
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return false;
    if (inv.status !== "draft") {
      throw new Error("Only draft invoices can be deleted");
    }
    const next = invoices.filter((i) => i.id !== id);
    await writeInvoicesUnlocked(next);
    return true;
  });
}

function stampId(prefix: string, index: number): string {
  return `${prefix}-${Date.now()}-${index}`;
}

/**
 * Authorise: Dr AR (total), Cr Revenue (excl GST per account), Cr GST Payable (820).
 * Idempotent — refuses if already authorised/paid/void.
 */
export async function authoriseInvoice(id: string): Promise<Invoice> {
  return withInvoicesLock(async () => {
    const invoices = await readInvoicesUnlocked();
    const idx = invoices.findIndex((inv) => inv.id === id);
    if (idx < 0) throw new Error("Invoice not found");
    const inv = invoices[idx];

    if (inv.status === "authorised" || inv.status === "paid") {
      throw new Error("Invoice is already authorised");
    }
    if (inv.status === "void") {
      throw new Error("Cannot authorise a void invoice");
    }
    if (inv.ledgerEntryIds.length > 0) {
      throw new Error("Invoice already has ledger entries");
    }
    if (!inv.lines.length || inv.total <= 0) {
      throw new Error("Invoice has no amount to post");
    }

    const coa = await readCoa();
    const byCode = new Map(coa.map((a) => [a.code, a]));
    const ar = byCode.get(AR_CODE);
    const gstAcc = byCode.get(GST_CODE);
    const journalRef = `INV-AUTH-${inv.number}`;
    const desc = `Invoice ${inv.number} — ${inv.customerName}`;
    const ts = new Date().toISOString();

    const revenueByCode = new Map<
      string,
      { excl: number; gst: number; name: string }
    >();
    for (const line of inv.lines) {
      const t = computeLineTotals(line);
      if (t.excl === 0) continue;
      const prev = revenueByCode.get(line.accountCode) || {
        excl: 0,
        gst: 0,
        name: line.accountName,
      };
      prev.excl = round2(prev.excl + t.excl);
      prev.gst = round2(prev.gst + t.gst);
      prev.name = line.accountName || prev.name;
      revenueByCode.set(line.accountCode, prev);
    }

    const entries: Partial<LedgerEntry>[] = [];
    let i = 0;

    // Dr Accounts Receivable (total incl GST)
    entries.push({
      id: stampId("inv-ar", i++),
      date: inv.issueDate,
      description: desc,
      amount: inv.total,
      type: ar?.type || "Asset",
      account: `${AR_CODE} - ${ar?.name || "Accounts Receivable"}`,
      accountCode: AR_CODE,
      accountName: ar?.name || "Accounts Receivable",
      hasGST: false,
      noGST: true,
      reconciled: false,
      source: "invoice",
      invoiceId: inv.id,
      invoiceNumber: inv.number,
      journalRef,
      timestamp: ts,
    });

    for (const [code, { excl, gst, name }] of revenueByCode) {
      const acc = byCode.get(code);
      entries.push({
        id: stampId("inv-rev", i++),
        date: inv.issueDate,
        description: desc,
        amount: -excl,
        type: acc?.type || "Revenue",
        account: `${code} - ${name || acc?.name || ""}`,
        accountCode: code,
        accountName: name || acc?.name || "",
        hasGST: false,
        noGST: true,
        /** Tax-exclusive revenue — BAS converts when gstExclusive */
        ...(gst > 0.009
          ? { gstExclusive: true, gstAmount: gst }
          : {}),
        reconciled: false,
        source: "invoice",
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        journalRef,
        timestamp: ts,
      });
    }

    if (inv.gstTotal > 0.009) {
      entries.push({
        id: stampId("inv-gst", i++),
        date: inv.issueDate,
        description: desc,
        amount: -inv.gstTotal,
        type: gstAcc?.type || "Liability",
        account: `${GST_CODE} - ${gstAcc?.name || "GST"}`,
        accountCode: GST_CODE,
        accountName: gstAcc?.name || "GST",
        hasGST: false,
        noGST: true,
        reconciled: false,
        source: "invoice",
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        journalRef,
        timestamp: ts,
      });
    }

    const debit = entries
      .filter((e) => (e.amount || 0) > 0)
      .reduce((s, e) => s + (e.amount || 0), 0);
    const credit = entries
      .filter((e) => (e.amount || 0) < 0)
      .reduce((s, e) => s + Math.abs(e.amount || 0), 0);
    if (Math.abs(debit - credit) > 0.02) {
      throw new Error(
        `Unbalanced invoice journal (Dr ${debit} vs Cr ${credit})`
      );
    }

    const result = await appendLedgerEntries(entries);
    const now = new Date().toISOString();
    const next: Invoice = {
      ...inv,
      status: "authorised",
      ledgerEntryIds: result.savedEntries.map((e) => e.id),
      journalRef,
      authorisedAt: now,
      amountDue: inv.total,
      amountPaid: 0,
      updatedAt: now,
    };
    invoices[idx] = next;
    await writeInvoicesUnlocked(invoices);
    return next;
  });
}

/**
 * Void authorised unpaid invoice by posting reversing journal.
 * Blocked if any payments recorded.
 */
export async function voidInvoice(id: string): Promise<Invoice> {
  return withInvoicesLock(async () => {
    const invoices = await readInvoicesUnlocked();
    const idx = invoices.findIndex((inv) => inv.id === id);
    if (idx < 0) throw new Error("Invoice not found");
    const inv = invoices[idx];

    if (inv.status === "void") throw new Error("Invoice is already void");
    if (inv.status === "draft") {
      // Soft-void draft without ledger
      const next: Invoice = {
        ...inv,
        status: "void",
        voidedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      invoices[idx] = next;
      await writeInvoicesUnlocked(invoices);
      return next;
    }
    if (inv.payments.length > 0 || inv.amountPaid > 0.009) {
      throw new Error(
        "Cannot void an invoice with payments — reverse payments first (not supported in MVP)"
      );
    }
    if (!inv.ledgerEntryIds.length) {
      throw new Error("Authorised invoice missing ledger entries");
    }

    const coa = await readCoa();
    const byCode = new Map(coa.map((a) => [a.code, a]));
    const ar = byCode.get(AR_CODE);
    const gstAcc = byCode.get(GST_CODE);
    const journalRef = `INV-VOID-${inv.number}`;
    const desc = `Void invoice ${inv.number} — ${inv.customerName}`;
    const ts = new Date().toISOString();
    const voidDate = new Date().toISOString().slice(0, 10);

    const revenueByCode = new Map<
      string,
      { excl: number; gst: number; name: string }
    >();
    for (const line of inv.lines) {
      const t = computeLineTotals(line);
      if (t.excl === 0) continue;
      const prev = revenueByCode.get(line.accountCode) || {
        excl: 0,
        gst: 0,
        name: line.accountName,
      };
      prev.excl = round2(prev.excl + t.excl);
      prev.gst = round2(prev.gst + t.gst);
      prev.name = line.accountName || prev.name;
      revenueByCode.set(line.accountCode, prev);
    }

    const entries: Partial<LedgerEntry>[] = [];
    let i = 0;

    // Reverse: Cr AR, Dr Revenue, Dr GST
    entries.push({
      id: stampId("void-ar", i++),
      date: voidDate,
      description: desc,
      amount: -inv.total,
      type: ar?.type || "Asset",
      account: `${AR_CODE} - ${ar?.name || "Accounts Receivable"}`,
      accountCode: AR_CODE,
      accountName: ar?.name || "Accounts Receivable",
      hasGST: false,
      noGST: true,
      reconciled: false,
      source: "invoice-void",
      invoiceId: inv.id,
      invoiceNumber: inv.number,
      journalRef,
      timestamp: ts,
    });

    for (const [code, { excl, gst, name }] of revenueByCode) {
      const acc = byCode.get(code);
      entries.push({
        id: stampId("void-rev", i++),
        date: voidDate,
        description: desc,
        amount: excl,
        type: acc?.type || "Revenue",
        account: `${code} - ${name || acc?.name || ""}`,
        accountCode: code,
        accountName: name || acc?.name || "",
        hasGST: false,
        noGST: true,
        ...(gst > 0.009
          ? { gstExclusive: true, gstAmount: gst }
          : {}),
        reconciled: false,
        source: "invoice-void",
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        journalRef,
        timestamp: ts,
      });
    }

    if (inv.gstTotal > 0.009) {
      entries.push({
        id: stampId("void-gst", i++),
        date: voidDate,
        description: desc,
        amount: inv.gstTotal,
        type: gstAcc?.type || "Liability",
        account: `${GST_CODE} - ${gstAcc?.name || "GST"}`,
        accountCode: GST_CODE,
        accountName: gstAcc?.name || "GST",
        hasGST: false,
        noGST: true,
        reconciled: false,
        source: "invoice-void",
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        journalRef,
        timestamp: ts,
      });
    }

    const result = await appendLedgerEntries(entries);
    const now = new Date().toISOString();
    const next: Invoice = {
      ...inv,
      status: "void",
      voidLedgerEntryIds: result.savedEntries.map((e) => e.id),
      voidedAt: now,
      amountDue: 0,
      updatedAt: now,
    };
    invoices[idx] = next;
    await writeInvoicesUnlocked(invoices);
    return next;
  });
}

export async function recordInvoicePayment(
  id: string,
  input: {
    amount: number;
    date: string;
    bankAccountId: string;
    note?: string;
  }
): Promise<Invoice> {
  return withInvoicesLock(async () => {
    const invoices = await readInvoicesUnlocked();
    const idx = invoices.findIndex((inv) => inv.id === id);
    if (idx < 0) throw new Error("Invoice not found");
    const inv = invoices[idx];

    if (inv.status !== "authorised" && inv.status !== "paid") {
      throw new Error("Only authorised invoices can receive payments");
    }

    const amount = round2(Number(input.amount) || 0);
    if (amount <= 0) throw new Error("Payment amount must be positive");
    if (amount > inv.amountDue + 0.01) {
      throw new Error(
        `Payment ${amount} exceeds amount due ${inv.amountDue}`
      );
    }

    const banks = await readBankAccounts();
    const bank = banks.find((b) => b.id === input.bankAccountId);
    if (!bank) throw new Error("Bank account not found");

    const coa = await readCoa();
    const byCode = new Map(coa.map((a) => [a.code, a]));
    // Bank ledger code is typically the bank account id (e.g. 2020)
    const bankCode = bank.id;
    const bankCoa = byCode.get(bankCode);
    const ar = byCode.get(AR_CODE);
    const journalRef = `INV-PAY-${inv.number}-${Date.now()}`;
    const desc = `Payment ${inv.number} — ${inv.customerName}`;
    const ts = new Date().toISOString();
    const payDate = String(input.date || new Date().toISOString().slice(0, 10));

    const entries: Partial<LedgerEntry>[] = [
      {
        id: stampId("pay-bank", 0),
        date: payDate,
        description: desc,
        amount: amount,
        type: bankCoa?.type || "Asset",
        account: `${bankCode} - ${bankCoa?.name || bank.name}`,
        accountCode: bankCode,
        accountName: bankCoa?.name || bank.name,
        bankAccountId: bank.id,
        bankAccountName: bank.name,
        hasGST: false,
        noGST: true,
        reconciled: false,
        source: "invoice-payment",
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        journalRef,
        timestamp: ts,
      },
      {
        id: stampId("pay-ar", 1),
        date: payDate,
        description: desc,
        amount: -amount,
        type: ar?.type || "Asset",
        account: `${AR_CODE} - ${ar?.name || "Accounts Receivable"}`,
        accountCode: AR_CODE,
        accountName: ar?.name || "Accounts Receivable",
        hasGST: false,
        noGST: true,
        reconciled: false,
        source: "invoice-payment",
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        journalRef,
        timestamp: ts,
      },
    ];

    const result = await appendLedgerEntries(entries);
    const payment: InvoicePayment = {
      id: `PAY-${Date.now()}`,
      date: payDate,
      amount,
      bankAccountId: bank.id,
      bankAccountName: bank.name,
      ledgerEntryIds: result.savedEntries.map((e) => e.id),
      note: String(input.note || "").trim(),
      createdAt: ts,
    };

    const amountPaid = round2(inv.amountPaid + amount);
    const amountDue = round2(Math.max(0, inv.total - amountPaid));
    const next: Invoice = {
      ...inv,
      payments: [...inv.payments, payment],
      amountPaid,
      amountDue,
      status: amountDue <= 0.009 ? "paid" : "authorised",
      updatedAt: ts,
    };
    invoices[idx] = next;
    await writeInvoicesUnlocked(invoices);
    return next;
  });
}
