'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';
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

function money(n: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(n || 0);
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filter, setFilter] = useState('all');

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

  const visible = invoices.filter(
    (inv) => filter === 'all' || inv.status === filter
  );

  return (
    <AccountingGate section="Invoices" backHref="/accounting" backLabel="← Back to Accounting">
      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
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

        <div className="flex flex-wrap gap-2 mb-4">
          {['all', 'draft', 'authorised', 'paid', 'void'].map((s) => (
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
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No invoices — create one to get started
                  </td>
                </tr>
              )}
              {visible.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="font-medium text-orange-700 hover:underline"
                    >
                      {inv.number}
                    </Link>
                  </td>
                  <td className="p-3">{inv.customerName}</td>
                  <td className="p-3 text-slate-600">{formatAuDate(inv.issueDate)}</td>
                  <td className="p-3 text-slate-600">{formatAuDate(inv.dueDate)}</td>
                  <td className="p-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium capitalize ${
                        statusClass[inv.status] || 'bg-slate-100'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="p-3 text-right font-medium">{money(inv.total)}</td>
                  <td className="p-3 text-right text-slate-600">
                    {money(inv.amountDue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AccountingGate>
  );
}
