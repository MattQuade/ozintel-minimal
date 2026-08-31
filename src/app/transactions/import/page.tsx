'use client';

import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { classifyBatch, type BankRule } from '../../../core/rules/rulesEngine';
import AccountingGate from '@/components/AccountingGate';
import ReceiptAttach from '@/components/ReceiptAttach';
import { formatAuDate, toIsoDateInput } from '@/lib/accounting/dates';
import { normalizeBankImportRows } from '@/lib/accounting/bankImport';
import {
  findUniqueDepositInvoiceMatch,
  isDepositAmount,
  openInvoicesForManualAllocate,
  type InvoiceMatchCandidate,
} from '@/lib/accounting/invoiceDepositMatch';

type BankAccountOption = {
  id: string;
  name: string;
  accountNumber?: string;
};

type CoaOption = { code: string; name: string; type: string; noGST?: boolean };

type OpenInvoiceOption = InvoiceMatchCandidate;

/** Classified import row with optional receipt draft + post-save ledger link. */
type ClassifiedImportRow = {
  original: unknown[];
  rule?: unknown;
  type: string;
  accountCode?: string;
  accountName?: string;
  noGST?: boolean;
  descriptionOverride?: string;
  receiptIds?: string[];
  /** Set after row is written to ledger — enables immediate receipt linking. */
  ledgerEntryId?: string;
  /** Linked invoice when deposit allocated */
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceStatus?: string;
  invoiceAllocated?: boolean;
  invoiceAutoMatched?: boolean;
  [key: string]: unknown;
};

function money(n: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(n || 0);
}

export default function BankImport() {
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [coa, setCoa] = useState<CoaOption[]>([]);
  const [openInvoices, setOpenInvoices] = useState<OpenInvoiceOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [preview, setPreview] = useState<any[]>([]);
  const [classified, setClassified] = useState<ClassifiedImportRow[]>([]);
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [ledgerSaved, setLedgerSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quarter, setQuarter] = useState('Q4 FY25/26');
  const [allocatingIndex, setAllocatingIndex] = useState<number | null>(null);

  const loadOpenInvoices = () =>
    fetch('/api/invoices/allocate-deposit')
      .then((r) => r.json())
      .then((d) => {
        setOpenInvoices(Array.isArray(d.invoices) ? d.invoices : []);
      })
      .catch(() => {});

  useEffect(() => {
    Promise.all([
      fetch('/api/bank-accounts'),
      fetch('/api/coa'),
      fetch('/api/invoices/allocate-deposit'),
    ])
      .then(async ([banksRes, coaRes, invRes]) => {
        const banks = await banksRes.json();
        const accounts = await coaRes.json();
        const invData = await invRes.json().catch(() => ({}));
        const bankList = Array.isArray(banks) ? banks : [];
        setBankAccounts(bankList);
        const nabBiz = bankList.find(
          (acc: BankAccountOption) =>
            acc.id === '2020' || String(acc.accountNumber || '').endsWith('4091')
        );
        if (nabBiz?.id) setSelectedAccount(nabBiz.id);
        else if (bankList[0]?.id) setSelectedAccount(bankList[0].id);
        setCoa(Array.isArray(accounts) ? accounts : []);
        setOpenInvoices(Array.isArray(invData.invoices) ? invData.invoices : []);
      })
      .catch(() => setStatus('Failed to load bank accounts / COA'));
  }, []);

  const accountsForType = (type: string) => {
    if (!type || type === 'Uncategorized') return coa;
    return coa.filter((a) => a.type === type);
  };

  const applyInvoiceAutoMatch = (
    rows: ClassifiedImportRow[],
    invoices: OpenInvoiceOption[]
  ): ClassifiedImportRow[] => {
    const used = new Set<string>();
    return rows.map((row) => {
      const amount = parseFloat(String(row.original[1] || 0));
      if (!isDepositAmount(amount)) return row;
      if (row.invoiceId) {
        used.add(row.invoiceId);
        return row;
      }
      const description = String(
        row.descriptionOverride || row.original[2] || ''
      );
      const match = findUniqueDepositInvoiceMatch(invoices, {
        amount,
        description,
        excludeInvoiceIds: used,
      });
      if (!match) return row;
      used.add(match.id);
      return {
        ...row,
        invoiceId: match.id,
        invoiceNumber: match.number,
        invoiceStatus: match.status,
        invoiceAutoMatched: true,
        invoiceAllocated: false,
        // Skip expense-style classification — payment journal handles AR
        type: 'Revenue',
        accountCode: '2101',
        accountName: 'Accounts Receivable (invoice allocate)',
        noGST: true,
        rule: 'Invoice auto-match',
      };
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStatus('Parsing CSV...');
    setPreview([]);
    setClassified([]);
    setSavedCount(0);
    setLedgerSaved(false);

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (result) => {
        const raw = result.data as unknown[][];
        const data = normalizeBankImportRows(raw);
        setPreview(data);
        const skipped = raw.length - data.length;
        setStatus(
          skipped > 0
            ? `✅ Parsed ${data.length} transactions (${skipped} header/blank rows skipped)`
            : `✅ Parsed ${data.length} transactions`
        );
      },
      error: (err) => setStatus('❌ Parse error: ' + err.message),
    });
  };

  const allocateRowToInvoice = async (
    item: ClassifiedImportRow,
    invoiceId: string,
    opts?: { autoMatched?: boolean }
  ): Promise<{ ok: boolean; invoice?: OpenInvoiceOption; error?: string }> => {
    const amount = parseFloat(String(item.original[1] || 0));
    const date =
      toIsoDateInput(String(item.original[0] ?? '')) ||
      String(item.original[0] ?? '');
    const description = String(
      item.descriptionOverride || item.original[2] || ''
    );

    const res = await fetch('/api/invoices/allocate-deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceId,
        amount,
        date,
        bankAccountId: selectedAccount,
        description,
        replaceLedgerEntryId: item.ledgerEntryId || undefined,
        autoMatched: Boolean(opts?.autoMatched || item.invoiceAutoMatched),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return {
        ok: false,
        error: data.error || `Allocate failed (${res.status})`,
      };
    }
    const inv = data.invoice as {
      id: string;
      number: string;
      status: string;
      amountDue: number;
      matchKeyword?: string;
      customerName?: string;
    };
    return {
      ok: true,
      invoice: {
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amountDue: inv.amountDue,
        matchKeyword: inv.matchKeyword,
        customerName: inv.customerName,
      },
    };
  };

  const persistClassified = async (rows: ClassifiedImportRow[]) => {
    const selectedBank = bankAccounts.find((acc) => acc.id === selectedAccount);

    // 1) Allocate invoice-linked deposits via payment journal (not ledger/add)
    const allocateTargets = rows
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) =>
          item.invoiceId &&
          !item.invoiceAllocated &&
          isDepositAmount(parseFloat(String(item.original[1] || 0)))
      );

    let nextRows = rows.map((r) => ({ ...r }));
    let allocated = 0;
    let allocateErrors = 0;

    for (const { item, index } of allocateTargets) {
      const result = await allocateRowToInvoice(item, String(item.invoiceId), {
        autoMatched: item.invoiceAutoMatched,
      });
      if (result.ok && result.invoice) {
        allocated += 1;
        nextRows[index] = {
          ...nextRows[index],
          invoiceAllocated: true,
          invoiceId: result.invoice.id,
          invoiceNumber: result.invoice.number,
          invoiceStatus: result.invoice.status,
          // Payment posts its own ledger lines — clear import ledger id if replaced
          ledgerEntryId: undefined,
          type: 'Revenue',
          accountCode: '2101',
          accountName: 'Accounts Receivable (invoice allocate)',
          noGST: true,
        };
      } else {
        allocateErrors += 1;
        console.error('Invoice allocate failed', result.error);
      }
    }

    // 2) Save non-invoice rows via normal ledger add
    const saveable = nextRows
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) =>
          item.type !== 'Uncategorized' &&
          !item.invoiceId &&
          !item.invoiceAllocated
      );

    const toSave = saveable.map(({ item }) => {
      const receiptIds = Array.isArray(item.receiptIds)
        ? item.receiptIds.filter((id) => typeof id === 'string' && id.trim())
        : [];
      const ruleObj =
        typeof item.rule === 'object' && item.rule
          ? (item.rule as BankRule)
          : null;
      return {
        date: toIsoDateInput(String(item.original[0] ?? '')) || item.original[0],
        amount: parseFloat(String(item.original[1] || 0)),
        description: item.descriptionOverride || String(item.original[2] || ''),
        type: item.type,
        accountCode: item.accountCode || '',
        accountName: item.accountName || '',
        noGST: Boolean(item.noGST),
        hasGST: !item.noGST,
        reconciled: ruleObj?.autoReconcile !== false && Boolean(ruleObj),
        category:
          typeof item.rule === 'object' && item.rule && 'name' in (item.rule as object)
            ? String((item.rule as { name?: string }).name || 'Manual')
            : String(item.rule || 'Manual'),
        bankAccountId: selectedAccount,
        bankAccountName: selectedBank?.name || 'Unknown',
        timestamp: new Date().toISOString(),
        quarter,
        source: 'bank-import' as const,
        ...(receiptIds.length > 0 ? { receiptIds } : {}),
      };
    });

    if (toSave.length === 0 && allocateTargets.length === 0) {
      setStatus('Nothing to save — all rows are Uncategorized');
      setLedgerSaved(false);
      setClassified(nextRows);
      return false;
    }

    setSaving(true);
    try {
      let count = allocated;
      let inboxAttached = 0;

      if (toSave.length > 0) {
        const res = await fetch('/api/ledger/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: toSave }),
        });
        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({}));
          setClassified(nextRows);
          setStatus(
            `❌ Failed to save${errorBody?.error ? `: ${errorBody.error}` : ` (${res.status})`}` +
              (allocated ? ` (${allocated} invoice payment(s) posted)` : '')
          );
          setLedgerSaved(false);
          await loadOpenInvoices();
          return false;
        }
        const data = await res.json();
        count += data.saved || toSave.length;
        inboxAttached = Number(data.inboxAttached) || 0;
        const extraPaid = Array.isArray(data.allocatedInvoices)
          ? data.allocatedInvoices.length
          : 0;
        allocated += extraPaid;
        const savedEntries = Array.isArray(data.savedEntries)
          ? data.savedEntries
          : [];

        saveable.forEach(({ index }, i) => {
          const saved = savedEntries[i] as
            | { id?: string; receiptIds?: string[] }
            | undefined;
          if (!saved?.id || !nextRows[index]) return;
          nextRows[index] = {
            ...nextRows[index],
            ledgerEntryId: String(saved.id),
            receiptIds:
              Array.isArray(saved.receiptIds) && saved.receiptIds.length > 0
                ? saved.receiptIds
                : nextRows[index].receiptIds || [],
          };
        });
      }

      setClassified(nextRows);
      setSavedCount(count);
      setLedgerSaved(allocateErrors === 0);
      const parts = [
        count ? `${count} posted` : null,
        allocated ? `${allocated} invoice payment(s)` : null,
        inboxAttached ? `${inboxAttached} receipt(s) attached` : null,
        allocateErrors ? `${allocateErrors} allocate error(s)` : null,
      ].filter(Boolean);
      setStatus(
        `💾 Saved — ${parts.join(', ')} → ${selectedBank?.name}`
      );
      await loadOpenInvoices();
      return allocateErrors === 0;
    } catch (error) {
      setClassified(nextRows);
      setStatus(
        `❌ Connection error${error instanceof Error ? `: ${error.message}` : ''}`
      );
      setLedgerSaved(false);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleClassify = async () => {
    if (preview.length === 0) return;
    setIsProcessing(true);
    setStatus('Classifying using Bank Rules + invoice match…');
    setLedgerSaved(false);

    try {
      const [rulesRes, invRes] = await Promise.all([
        fetch('/api/rules'),
        fetch('/api/invoices/allocate-deposit'),
      ]);
      const rules = (await rulesRes.json()) as BankRule[];
      const invData = await invRes.json().catch(() => ({}));
      const invoices: OpenInvoiceOption[] = Array.isArray(invData.invoices)
        ? invData.invoices
        : [];
      setOpenInvoices(invoices);

      const results = classifyBatch(
        preview,
        Array.isArray(rules) ? rules : [],
        selectedAccount || undefined
      ).map((r) => ({
        ...r,
        original: Array.isArray(r.original) ? r.original : [],
        receiptIds: [] as string[],
      })) as ClassifiedImportRow[];

      const withInvoices = applyInvoiceAutoMatch(results, invoices);
      setClassified(withInvoices);
      const matched = withInvoices.filter((r) => r.type !== 'Uncategorized').length;
      const autoInv = withInvoices.filter((r) => r.invoiceAutoMatched).length;
      setStatus(
        `✅ ${matched} matched / ${results.length}` +
          (autoInv ? ` (${autoInv} invoice auto-match)` : '') +
          ' — saving…'
      );
      await persistClassified(withInvoices);
    } catch (err) {
      console.error(err);
      setStatus('❌ Failed to load bank rules');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateType = (index: number, newType: string) => {
    const updated = [...classified];
    const current = updated[index];
    if (current.invoiceAllocated) return;
    const allowed = accountsForType(newType);
    const stillValid = allowed.some((a) => a.code === current.accountCode);
    updated[index] = {
      ...current,
      type: newType,
      rule: 'Manual',
      ...(stillValid
        ? {}
        : { accountCode: '', accountName: '', noGST: false }),
    };
    setClassified(updated);
    setLedgerSaved(false);
  };

  const updateAccount = (index: number, code: string) => {
    const current = classified[index];
    if (current?.invoiceAllocated) return;
    const account = coa.find((a) => a.code === code);
    const updated = [...classified];
    updated[index] = {
      ...updated[index],
      accountCode: code,
      accountName: account?.name || updated[index].accountName,
      noGST: account?.noGST ?? updated[index].noGST,
      type: account?.type || updated[index].type,
      rule: 'Manual',
    };
    setClassified(updated);
    setLedgerSaved(false);
  };

  const updateReceiptIds = (index: number, ids: string[]) => {
    const updated = [...classified];
    updated[index] = {
      ...updated[index],
      receiptIds: ids,
    };
    setClassified(updated);
    if (!updated[index].ledgerEntryId) {
      setLedgerSaved(false);
    }
  };

  const setManualInvoiceLink = (index: number, invoiceId: string) => {
    const updated = [...classified];
    const current = updated[index];
    if (current.invoiceAllocated) return;

    if (!invoiceId) {
      updated[index] = {
        ...current,
        invoiceId: undefined,
        invoiceNumber: undefined,
        invoiceStatus: undefined,
        invoiceAutoMatched: false,
        invoiceAllocated: false,
      };
      setClassified(updated);
      setLedgerSaved(false);
      return;
    }

    const inv = openInvoices.find((i) => i.id === invoiceId);
    updated[index] = {
      ...current,
      invoiceId,
      invoiceNumber: inv?.number,
      invoiceStatus: inv?.status,
      invoiceAutoMatched: false,
      invoiceAllocated: false,
      type: 'Revenue',
      accountCode: '2101',
      accountName: 'Accounts Receivable (invoice allocate)',
      noGST: true,
      rule: 'Invoice allocate',
    };
    setClassified(updated);
    setLedgerSaved(false);
  };

  const allocateNow = async (index: number) => {
    const item = classified[index];
    if (!item?.invoiceId || item.invoiceAllocated) return;
    setAllocatingIndex(index);
    try {
      const result = await allocateRowToInvoice(item, item.invoiceId, {
        autoMatched: item.invoiceAutoMatched,
      });
      if (!result.ok) {
        setStatus(`❌ ${result.error}`);
        return;
      }
      const updated = [...classified];
      updated[index] = {
        ...updated[index],
        invoiceAllocated: true,
        invoiceId: result.invoice?.id,
        invoiceNumber: result.invoice?.number,
        invoiceStatus: result.invoice?.status,
        ledgerEntryId: undefined,
      };
      setClassified(updated);
      setStatus(
        `✅ Allocated deposit to ${result.invoice?.number || 'invoice'}`
      );
      await loadOpenInvoices();
    } finally {
      setAllocatingIndex(null);
    }
  };

  return (
    <AccountingGate
      section="Transactions"
      backHref="/transactions"
      backLabel="← Back to Transactions"
    >
      <div className="p-10 max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">📥 Bank Import & Reconciliation</h1>
        <p className="text-gray-600 mb-8">
          Upload → Classify (auto-saves matched rows + invoice keyword matches) →
          Attach receipts / allocate deposits to invoices → save updates
        </p>

        <div className="bg-white rounded-3xl shadow-xl p-10">
          <div className="mb-8">
            <label className="block text-sm font-medium mb-2">
              Import to which Bank Account?
            </label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full max-w-md border border-gray-300 rounded-2xl px-5 py-3 text-lg"
            >
              {bankAccounts.length === 0 && <option value="">Loading…</option>}
              {bankAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                  {acc.accountNumber ? ` (${acc.accountNumber})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-3xl p-16 text-center">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="csvfile"
            />
            <label htmlFor="csvfile" className="cursor-pointer block">
              <div className="text-7xl mb-6">📤</div>
              <p className="text-2xl font-semibold">Upload ANZ / NAB CSV</p>
              <p className="text-gray-500">{fileName}</p>
              <p className="text-gray-400 text-sm mt-2">
                Inbox receipts (ww 79.13) attach automatically when this file is classified.
              </p>
            </label>
          </div>

          {status && <p className="text-center mt-8 text-lg font-medium">{status}</p>}
          {savedCount > 0 && (
            <p className="text-center text-sm text-gray-500">Ledger rows written: {savedCount}</p>
          )}

          {preview.length > 0 && classified.length === 0 && (
            <button
              onClick={handleClassify}
              disabled={isProcessing || !selectedAccount}
              className="mt-8 w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-5 rounded-2xl text-xl font-semibold"
            >
              {isProcessing ? 'Classifying & saving…' : `Classify ${preview.length} Transactions`}
            </button>
          )}

          {classified.length > 0 && (
            <>
              <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                  <p className="text-sm text-emerald-800">Matched (classified)</p>
                  <p className="text-3xl font-bold text-emerald-900">
                    {classified.filter((i) => i.type !== 'Uncategorized').length}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
                  <p className="text-sm text-amber-800">Unreconciled (uncategorized)</p>
                  <p className="text-3xl font-bold text-amber-900">
                    {classified.filter((i) => i.type === 'Uncategorized').length}
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-center">
                  <p className="text-sm text-sky-800">Invoice allocations</p>
                  <p className="text-3xl font-bold text-sky-900">
                    {classified.filter((i) => i.invoiceAllocated || i.invoiceId).length}
                  </p>
                </div>
              </div>

              <div className="mt-8 flex gap-4">
                {ledgerSaved ? (
                  <div className="flex-1 bg-emerald-100 text-emerald-900 py-5 rounded-2xl text-xl font-semibold text-center border border-emerald-300">
                    💾 Saved to Ledger (
                    {classified.filter((i) => i.type !== 'Uncategorized').length})
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => persistClassified(classified)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white py-5 rounded-2xl text-xl font-semibold"
                  >
                    {saving ? 'Saving…' : 'Save updates to Ledger'}
                  </button>
                )}
              </div>

              <div className="mt-10 overflow-x-auto max-h-[650px] border rounded-2xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-left">Rule</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Account</th>
                      <th className="px-3 py-3 text-left min-w-[200px]">Invoice</th>
                      <th className="px-3 py-3 text-left w-[140px]">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {classified.map((item, i) => {
                      const row = item.original;
                      const amount = parseFloat(String(row[1] || 0));
                      const isDeposit = isDepositAmount(amount);
                      const ruleName =
                        typeof item.rule === 'object' &&
                        item.rule &&
                        'name' in (item.rule as object)
                          ? String((item.rule as { name?: string }).name || 'Manual')
                          : String(item.rule || 'Manual');
                      const typeAccounts = accountsForType(item.type);
                      const receiptIds = Array.isArray(item.receiptIds)
                        ? item.receiptIds
                        : [];
                      const invoiceChoices = openInvoicesForManualAllocate(
                        openInvoices,
                        { preferAmount: amount }
                      );

                      return (
                        <tr
                          key={i}
                          className={
                            item.invoiceAllocated
                              ? 'bg-sky-50/80'
                              : 'hover:bg-gray-50'
                          }
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formatAuDate(String(row[0] ?? ''))}
                          </td>
                          <td className="px-4 py-3 font-medium">{String(row[1] ?? '')}</td>
                          <td className="px-4 py-3 max-w-xs truncate">
                            {String(row[2] || '—')}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{ruleName}</td>
                          <td className="px-4 py-3">
                            <select
                              value={item.type}
                              onChange={(e) => updateType(i, e.target.value)}
                              className="border rounded px-3 py-1 text-sm"
                              disabled={Boolean(item.invoiceAllocated)}
                            >
                              <option value="Revenue">Revenue</option>
                              <option value="Expense">Expense</option>
                              <option value="Asset">Asset</option>
                              <option value="Liability">Liability</option>
                              <option value="Equity">Equity</option>
                              <option value="Uncategorized">Uncategorized</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 min-w-[220px]">
                            {item.invoiceId ? (
                              <span className="text-xs text-sky-800">
                                Via invoice payment (Dr bank / Cr AR)
                              </span>
                            ) : (
                              <select
                                value={item.accountCode || ''}
                                onChange={(e) => updateAccount(i, e.target.value)}
                                className="border rounded px-2 py-1 text-sm w-full"
                                disabled={item.type === 'Uncategorized'}
                              >
                                <option value="">
                                  {item.type === 'Uncategorized'
                                    ? 'Pick a type first'
                                    : 'Select account'}
                                </option>
                                {typeAccounts.map((a) => (
                                  <option key={a.code} value={a.code}>
                                    {a.code} — {a.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {isDeposit ? (
                              <div className="flex flex-col gap-1 min-w-[180px]">
                                {item.invoiceAllocated ? (
                                  <div className="text-xs text-sky-900">
                                    <span className="font-semibold">
                                      {item.invoiceNumber}
                                    </span>
                                    <span className="ml-1 capitalize text-sky-700">
                                      · {item.invoiceStatus}
                                      {item.invoiceAutoMatched ? ' · auto' : ''}
                                    </span>
                                  </div>
                                ) : (
                                  <>
                                    <select
                                      value={item.invoiceId || ''}
                                      onChange={(e) =>
                                        setManualInvoiceLink(i, e.target.value)
                                      }
                                      className="border rounded px-2 py-1 text-xs w-full"
                                    >
                                      <option value="">Allocate to invoice…</option>
                                      {invoiceChoices.map((inv) => (
                                        <option key={inv.id} value={inv.id}>
                                          {inv.number} · {money(inv.amountDue)}
                                          {inv.matchKeyword
                                            ? ` · ${inv.matchKeyword}`
                                            : ''}
                                        </option>
                                      ))}
                                    </select>
                                    {item.invoiceId && (
                                      <button
                                        type="button"
                                        disabled={allocatingIndex === i}
                                        onClick={() => allocateNow(i)}
                                        className="text-xs bg-sky-700 text-white rounded px-2 py-1 hover:bg-sky-800 disabled:opacity-50"
                                      >
                                        {allocatingIndex === i
                                          ? 'Posting…'
                                          : item.invoiceAutoMatched
                                            ? 'Confirm auto-match'
                                            : 'Apply payment'}
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="flex flex-col gap-1 min-w-[120px]">
                              {!item.invoiceId && (
                                <ReceiptAttach
                                  compact
                                  receiptIds={receiptIds}
                                  onChange={(ids) => updateReceiptIds(i, ids)}
                                  ledgerEntryId={item.ledgerEntryId}
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </AccountingGate>
  );
}
