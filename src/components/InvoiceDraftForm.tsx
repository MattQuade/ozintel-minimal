'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate } from '@/lib/accounting/dates';
import {
  computeInvoiceTotals,
  computeLineTotals,
} from '@/lib/accounting/invoiceMath';

type Customer = { id: string; name: string };
type CoaOption = { code: string; name: string; type: string; noGST?: boolean };

type LineDraft = {
  id: string;
  description: string;
  /** Empty string while the user is typing so fields are not prefilled with 0/1. */
  quantity: number | '';
  unitPrice: number | '';
  accountCode: string;
  hasGST: boolean;
};

export type InvoiceDraftInitial = {
  id: string;
  number: string;
  customerId: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  matchKeyword?: string;
  lines: Array<{
    id?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    accountCode: string;
    hasGST: boolean;
  }>;
};

function lineForMath(line: LineDraft) {
  return {
    ...line,
    quantity: line.quantity === '' ? 0 : Number(line.quantity),
    unitPrice: line.unitPrice === '' ? 0 : Number(line.unitPrice),
  };
}

function money(n: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(n || 0);
}

function blankLine(accountCode = '0105'): LineDraft {
  return {
    id: String(Date.now()),
    description: '',
    quantity: '',
    unitPrice: '',
    accountCode,
    hasGST: true,
  };
}

type Props = {
  mode: 'create' | 'edit';
  initial?: InvoiceDraftInitial;
};

export default function InvoiceDraftForm({ mode, initial }: Props) {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [coa, setCoa] = useState<CoaOption[]>([]);
  const [customerId, setCustomerId] = useState(initial?.customerId || '');
  const [issueDate, setIssueDate] = useState(
    initial?.issueDate || new Date().toISOString().slice(0, 10)
  );
  const [dueDate, setDueDate] = useState(
    initial?.dueDate ||
      new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState(initial?.notes || '');
  const [matchKeyword, setMatchKeyword] = useState(
    String(initial?.matchKeyword || '')
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => {
    if (initial?.lines?.length) {
      return initial.lines.map((l, i) => ({
        id: l.id || `line-${i}`,
        description: l.description || '',
        quantity: Number.isFinite(Number(l.quantity)) ? Number(l.quantity) : '',
        unitPrice: Number.isFinite(Number(l.unitPrice))
          ? Number(l.unitPrice)
          : '',
        accountCode: l.accountCode || '0105',
        hasGST: l.hasGST !== false,
      }));
    }
    return [blankLine()];
  });

  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch('/api/coa')
      .then((r) => r.json())
      .then((d) => {
        const all = Array.isArray(d) ? d : [];
        setCoa(all.filter((a: CoaOption) => a.type === 'Revenue'));
      })
      .catch(() => {});
  }, []);

  const revenueAccounts = useMemo(() => (coa.length ? coa : []), [coa]);

  const totals = useMemo(
    () => computeInvoiceTotals(lines.map(lineForMath)),
    [lines]
  );

  const updateLine = (id: string, patch: Partial<LineDraft>) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        if (patch.accountCode) {
          const acc = revenueAccounts.find((a) => a.code === patch.accountCode);
          if (acc?.noGST) next.hasGST = false;
        }
        return next;
      })
    );
  };

  const save = async () => {
    setError('');
    if (!customerId) {
      setError('Select a customer');
      return;
    }
    if (
      !lines.some(
        (l) =>
          l.description.trim() && l.quantity !== '' && Number(l.quantity) !== 0
      )
    ) {
      setError('Add at least one line item');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        customerId,
        issueDate,
        dueDate,
        notes,
        matchKeyword,
        lines: lines
          .filter(
            (l) =>
              l.description.trim() &&
              l.quantity !== '' &&
              Number.isFinite(Number(l.quantity))
          )
          .map((l) => ({
            description: l.description,
            quantity: Number(l.quantity),
            unitPrice: l.unitPrice === '' ? 0 : Number(l.unitPrice),
            accountCode: l.accountCode,
            hasGST: l.hasGST,
          })),
      };

      const res =
        mode === 'edit' && initial?.id
          ? await fetch(`/api/invoices/${initial.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
          : await fetch('/api/invoices', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      router.push(`/invoices/${data.invoice.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const backHref =
    mode === 'edit' && initial?.id ? `/invoices/${initial.id}` : '/invoices';
  const backLabel =
    mode === 'edit' ? '← Back to invoice' : '← Back to Invoices';
  const defaultAccount = revenueAccounts[0]?.code || '0105';

  return (
    <AccountingGate section="Invoices" backHref={backHref} backLabel={backLabel}>
      <div className="p-8 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">
          {mode === 'edit'
            ? `Edit draft ${initial?.number || ''}`.trim()
            : 'New invoice'}
        </h1>
        <p className="text-slate-500 mb-8">
          {mode === 'edit'
            ? 'Update this draft, then authorise from the invoice page to post AR / revenue / GST.'
            : 'Saves as draft. Authorise from the invoice page to post AR / revenue / GST.'}{' '}
          Use a line description containing &quot;Discount&quot; (or a negative
          unit) to reduce the total.
        </p>

        {customers.length === 0 && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
            No customers yet.{' '}
            <Link href="/customers" className="font-medium underline">
              Add a customer
            </Link>{' '}
            first.
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <label className="block text-sm text-slate-600 mb-1">
                Customer *
              </label>
              <select
                className="w-full border border-slate-300 rounded-xl px-3 py-2"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Issue date
              </label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-xl px-3 py-2"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">
                {formatAuDate(issueDate) || 'DD/MM/YYYY'}
              </p>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Due date
              </label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-xl px-3 py-2"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">
                {formatAuDate(dueDate) || 'DD/MM/YYYY'}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Line items</h2>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="text-sm text-slate-600 hover:underline"
                  onClick={() =>
                    setLines((prev) => [
                      ...prev,
                      {
                        ...blankLine(defaultAccount),
                        id: String(Date.now()),
                        description: 'Discount',
                      },
                    ])
                  }
                >
                  + Discount
                </button>
                <button
                  type="button"
                  className="text-sm text-orange-700 hover:underline"
                  onClick={() =>
                    setLines((prev) => [
                      ...prev,
                      { ...blankLine(defaultAccount), id: String(Date.now()) },
                    ])
                  }
                >
                  + Add line
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {lines.map((line) => {
                const lineTot = computeLineTotals(lineForMath(line));
                return (
                  <div
                    key={line.id}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-slate-100 rounded-xl p-3"
                  >
                    <div className="md:col-span-3">
                      <label className="block text-xs text-slate-500 mb-1">
                        Description
                      </label>
                      <input
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                        value={line.description}
                        onChange={(e) =>
                          updateLine(line.id, { description: e.target.value })
                        }
                      />
                    </div>
                    <div className="md:col-span-1">
                      <label className="block text-xs text-slate-500 mb-1">
                        Qty
                      </label>
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                        value={line.quantity}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            updateLine(line.id, { quantity: '' });
                            return;
                          }
                          const n = parseFloat(raw);
                          if (!Number.isFinite(n)) return;
                          updateLine(line.id, { quantity: n });
                        }}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-slate-500 mb-1">
                        Unit (ex GST)
                      </label>
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                        value={line.unitPrice}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            updateLine(line.id, { unitPrice: '' });
                            return;
                          }
                          const n = parseFloat(raw);
                          if (!Number.isFinite(n)) return;
                          updateLine(line.id, { unitPrice: n });
                        }}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-slate-500 mb-1">
                        GST
                      </label>
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        className="w-full border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 text-sm text-slate-700"
                        value={money(Math.abs(lineTot.gst))}
                        title={
                          lineTot.isDiscount
                            ? 'Line GST (reduces invoice GST)'
                            : 'GST for this line (qty × unit × 10%)'
                        }
                        aria-label="Line GST"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-xs text-slate-500 mb-1">
                        Account
                      </label>
                      <select
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                        value={line.accountCode}
                        onChange={(e) =>
                          updateLine(line.id, { accountCode: e.target.value })
                        }
                      >
                        {revenueAccounts.map((a) => (
                          <option key={a.code} value={a.code}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-1 flex items-center gap-2 pb-1">
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={line.hasGST}
                          onChange={(e) =>
                            updateLine(line.id, { hasGST: e.target.checked })
                          }
                        />
                        Tax
                      </label>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          className="text-red-500 text-xs"
                          onClick={() =>
                            setLines((prev) =>
                              prev.filter((l) => l.id !== line.id)
                            )
                          }
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Bank match keyword
            </label>
            <input
              className="w-full border border-slate-300 rounded-xl px-3 py-2"
              value={matchKeyword}
              onChange={(e) => setMatchKeyword(e.target.value)}
              placeholder="e.g. job name or reference"
            />
            <p className="text-xs text-slate-500 mt-1">
              Used with bank deposits for auto-reconcile. When a deposit amount
              matches amount due and the bank description contains this keyword,
              the payment is applied automatically.
            </p>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Notes</label>
            <textarea
              className="w-full border border-slate-300 rounded-xl px-3 py-2"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <div className="text-sm text-slate-600 space-y-1">
              <div>Subtotal (ex GST): {money(totals.subtotal)}</div>
              {totals.discountTotal > 0.009 && (
                <div>Discount (ex GST): −{money(totals.discountTotal)}</div>
              )}
              <div>GST: {money(totals.gstTotal)}</div>
              <div className="text-lg font-semibold text-slate-900">
                Total: {money(totals.total)}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="bg-orange-600 hover:bg-orange-700 text-white font-medium px-6 py-2.5 rounded-xl disabled:opacity-50"
              >
                {saving
                  ? 'Saving…'
                  : mode === 'edit'
                    ? 'Save changes'
                    : 'Save draft'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AccountingGate>
  );
}
