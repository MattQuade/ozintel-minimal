'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AccountingGate from '@/components/AccountingGate';
import InvoiceDraftForm, {
  type InvoiceDraftInitial,
} from '@/components/InvoiceDraftForm';

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || '');
  const [initial, setInitial] = useState<InvoiceDraftInitial | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invoices/${id}`);
        if (!res.ok) throw new Error('Invoice not found');
        const inv = await res.json();
        if (cancelled) return;
        if (inv.status !== 'draft') {
          router.replace(`/invoices/${id}`);
          return;
        }
        setInitial({
          id: inv.id,
          number: inv.number,
          customerId: inv.customerId,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          notes: inv.notes || '',
          matchKeyword: inv.matchKeyword || '',
          lines: Array.isArray(inv.lines) ? inv.lines : [],
        });
      } catch {
        if (!cancelled) setError('Invoice not found');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (error) {
    return (
      <AccountingGate
        section="Invoices"
        backHref="/invoices"
        backLabel="← Back to Invoices"
      >
        <div className="p-8 text-red-600">{error}</div>
      </AccountingGate>
    );
  }

  if (!initial) {
    return (
      <AccountingGate
        section="Invoices"
        backHref={`/invoices/${id}`}
        backLabel="← Back"
      >
        <div className="p-8 text-slate-500">Loading…</div>
      </AccountingGate>
    );
  }

  return <InvoiceDraftForm mode="edit" initial={initial} />;
}
