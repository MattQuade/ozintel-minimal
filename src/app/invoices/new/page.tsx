'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';
import InvoiceEditorForm from '@/components/invoices/InvoiceEditorForm';

type Customer = { id: string; name: string };

function NewInvoiceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const blank = searchParams.get('blank') === '1';
  const preselectId = String(searchParams.get('customerId') || '').trim();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(preselectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [autoTried, setAutoTried] = useState(false);

  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const createFromLast = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/invoices/from-last', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.error || 'Could not create draft from last invoice'
        );
      }
      router.push(`/invoices/${data.invoice.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setBusy(false);
    }
  };

  useEffect(() => {
    if (blank || !preselectId || autoTried) return;
    setAutoTried(true);
    void createFromLast(preselectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blank, preselectId, autoTried]);

  if (blank) {
    return <InvoiceEditorForm />;
  }

  return (
    <div className="p-8 max-w-lg mx-auto">
      <h1 className="text-3xl font-bold mb-2">New invoice</h1>
      <p className="text-slate-500 mb-8">
        Pick a customer — the draft opens as a copy of their last invoice so you
        can tweak quantities, dates, and totals.
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

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <label className="block text-sm text-slate-600 mb-1">Customer</label>
          <select
            className="w-full border border-slate-300 rounded-xl px-3 py-2"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={busy}
          >
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="text-sm text-red-600 space-y-2">
            <p>{error}</p>
            <Link
              href="/invoices/new?blank=1"
              className="font-medium text-orange-700 hover:underline"
            >
              Start a blank invoice instead
            </Link>
          </div>
        )}

        <button
          type="button"
          disabled={busy || !customerId}
          onClick={() => createFromLast(customerId)}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium px-6 py-2.5 rounded-xl disabled:opacity-50"
        >
          {busy ? 'Creating draft…' : 'Create draft from last invoice'}
        </button>

        <p className="text-center text-sm text-slate-500">
          First time for this customer?{' '}
          <Link
            href="/invoices/new?blank=1"
            className="text-orange-700 hover:underline font-medium"
          >
            Start blank
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function NewInvoicePage() {
  return (
    <AccountingGate
      section="Invoices"
      backHref="/invoices"
      backLabel="← Back to Invoices"
    >
      <Suspense fallback={<div className="p-8 text-slate-500">Loading…</div>}>
        <NewInvoiceContent />
      </Suspense>
    </AccountingGate>
  );
}
