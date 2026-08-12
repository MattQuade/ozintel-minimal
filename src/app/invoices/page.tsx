'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AccountingGate from '@/components/AccountingGate';
import VoiceNavBar from '@/components/VoiceNavBar';
import { formatAuDate } from '@/lib/accounting/dates';

type Invoice = {
  id: string;
  number: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  status: string;
  total: number;
  amountDue: number;
  amountPaid: number;
};

const statusClass: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  authorised: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  void: 'bg-red-100 text-red-700',
};

const FILTERS = ['all', 'draft', 'authorised', 'paid', 'void'] as const;

function money(n: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(n || 0);
}

function canHardDelete(status: string) {
  return status === 'draft' || status === 'void';
}

function InvoicesContent() {
  const searchParams = useSearchParams();
  const filterParam = String(searchParams.get('filter') || 'all').toLowerCase();
  const initialFilter = FILTERS.includes(filterParam as (typeof FILTERS)[number])
    ? filterParam
    : 'all';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filter, setFilter] = useState(initialFilter);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const load = async () => {
    try {
      const res = await fetch('/api/invoices');
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : []);
    } catch {
      setInvoices([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (inv: Invoice) => {
    if (!canHardDelete(inv.status)) {
      setError(
        `${inv.number} is ${inv.status} — void it first, then delete`
      );
      return;
    }
    if (!confirm(`Delete ${inv.number}?`)) return;
    setBusyId(inv.id);
    setError('');
    try {
      const res = await fetch('/api/invoices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inv.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Delete failed');
      }
      setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const visible = invoices.filter(
    (inv) => filter === 'all' || inv.status === filter
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Invoices</h1>
          <p className="text-slate-500 mt-1">
            AR invoicing — authorise posts to ledger
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/customers"
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium px-4 py-2 rounded-xl text-sm"
          >
            Customers
          </Link>
          <Link
            href="/invoices/new"
            className="bg-orange-600 hover:bg-orange-700 text-white font-medium px-4 py-2 rounded-xl text-sm"
          >
            + New invoice
          </Link>
        </div>
      </div>

      <VoiceNavBar
        variant="hub"
        examples={[
          'Open Railway Hotel 246',
          'Open Mangoplah Hotel 245',
          'Select customer',
          'Create new invoice',
          'Edit invoice',
        ]}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize ${
              filter === s
                ? 'bg-slate-800 text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2">
          {error}
        </p>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left p-3 font-medium">Number</th>
              <th className="text-left p-3 font-medium">Customer</th>
              <th className="text-left p-3 font-medium">Issue</th>
              <th className="text-left p-3 font-medium">Due</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-right p-3 font-medium">Total</th>
              <th className="text-right p-3 font-medium">Due</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400">
                  No invoices — create one to get started
                </td>
              </tr>
            )}
            {visible.map((inv) => (
              <tr
                key={inv.id}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="p-3">
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="font-medium text-orange-700 hover:underline"
                  >
                    {inv.number}
                  </Link>
                </td>
                <td className="p-3">{inv.customerName}</td>
                <td className="p-3 text-slate-600">
                  {formatAuDate(inv.issueDate)}
                </td>
                <td className="p-3 text-slate-600">
                  {formatAuDate(inv.dueDate)}
                </td>
                <td className="p-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium capitalize ${
                      statusClass[inv.status] || 'bg-slate-100'
                    }`}
                  >
                    {inv.status}
                  </span>
                </td>
                <td className="p-3 text-right font-medium">
                  {money(inv.total)}
                </td>
                <td className="p-3 text-right text-slate-600">
                  {money(inv.amountDue)}
                </td>
                <td className="p-3 text-right">
                  {canHardDelete(inv.status) ? (
                    <button
                      type="button"
                      disabled={busyId === inv.id}
                      onClick={() => remove(inv)}
                      className="text-red-600 hover:underline disabled:opacity-40"
                    >
                      Delete
                    </button>
                  ) : (
                    <span
                      className="text-slate-400 text-xs"
                      title="Authorised/paid invoices post to the ledger — void first, then delete"
                    >
                      Void first
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <AccountingGate
      section="Invoices"
      backHref="/accounting"
      backLabel="← Back to Accounting"
    >
      <Suspense fallback={<div className="p-8 text-slate-500">Loading…</div>}>
        <InvoicesContent />
      </Suspense>
    </AccountingGate>
  );
}
