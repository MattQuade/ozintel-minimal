'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate } from '@/lib/accounting/dates';

type Group = {
  keyword: string;
  invoices: Array<{
    id: string;
    number: string;
    customerName: string;
    total: number;
    amountDue: number;
    status: string;
  }>;
  payments: Array<{
    id: string;
    date: string;
    amount: number;
    description: string;
    committed: boolean;
  }>;
  paidTotal: number;
  invoiceTotal: number;
};

function money(n: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(n || 0);
}

export default function PartialPaymentsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    const res = await fetch('/api/invoices/partial-payments', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    setGroups(Array.isArray(data.groups) ? data.groups : []);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const apply = async (invoiceId: string) => {
    setBusyId(invoiceId);
    setNotice('');
    try {
      const res = await fetch('/api/invoices/partial-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setNotice(data.error || 'Could not apply those payments');
        return;
      }
      const due = Number(data.invoice?.amountDue) || 0;
      setNotice(
        due <= 0.009
          ? `${data.invoice?.number || 'Invoice'} is paid.`
          : `${data.invoice?.number || 'Invoice'} still has ${money(due)} owing.`
      );
      await load();
    } finally {
      setBusyId('');
    }
  };

  return (
    <AccountingGate section="Invoices" backHref="/invoices" backLabel="← Invoices">
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold">Partial payments</h1>
        <p className="text-slate-500 mt-1 mb-6">
          Deposits that contain the bank keyword and are not the full invoice amount.
          Apply them when the total looks right. The invoice is marked paid only once
          the amount due is covered.
        </p>
        {notice ? <p className="mb-4 text-sm text-slate-700">{notice}</p> : null}
        {groups.length === 0 ? (
          <p className="text-slate-500">No partial payments are waiting.</p>
        ) : (
          groups.map((group) => (
            <section key={group.keyword} className="bg-white border rounded-2xl p-5 mb-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h2 className="text-xl font-semibold">{group.keyword}</h2>
                <p className="text-sm text-slate-600">
                  Deposits {money(group.paidTotal)} · invoices {money(group.invoiceTotal)}
                </p>
              </div>
              <ul className="mb-3 text-sm">
                {group.payments.map((payment) => (
                  <li key={payment.id} className="flex justify-between gap-3 py-1 border-b border-slate-100">
                    <span>
                      {formatAuDate(payment.date)} · {payment.description}
                      {payment.committed ? '' : ' · still in the import batch'}
                    </span>
                    <span className="font-medium">{money(payment.amount)}</span>
                  </li>
                ))}
              </ul>
              <ul className="space-y-2">
                {group.invoices.map((invoice) => (
                  <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link href={`/invoices/${invoice.id}`} className="text-blue-700 hover:underline">
                      {invoice.number} · {invoice.customerName} · due {money(invoice.amountDue)}
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === invoice.id}
                      onClick={() => void apply(invoice.id)}
                      className="bg-slate-900 text-white rounded-lg px-3 py-1 disabled:opacity-50"
                    >
                      {busyId === invoice.id ? 'Applying…' : 'Apply deposits'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </AccountingGate>
  );
}
