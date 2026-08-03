'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';
import InvoiceTaxDocument, {
  type InvoiceTaxData,
} from '@/components/invoices/InvoiceTaxDocument';

export default function InvoicePrintPage() {
  const params = useParams();
  const id = String(params.id || '');
  const [invoice, setInvoice] = useState<InvoiceTaxData | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/invoices/${id}`);
      if (!res.ok) return;
      setInvoice(await res.json());
    })();
  }, [id]);

  // Blank document title so Chrome/Edge PDF footer is not "OzIntel Alert System"
  useEffect(() => {
    const previous = document.title;
    document.title = '\u00A0';
    return () => {
      document.title = previous;
    };
  }, []);

  const handlePrint = () => {
    document.title = '\u00A0';
    window.print();
  };

  if (!invoice) {
    return (
      <AccountingGate section="Invoices" backHref={`/invoices/${id}`} backLabel="← Back">
        <div className="p-8 text-slate-500">Loading…</div>
      </AccountingGate>
    );
  }

  return (
    <AccountingGate
      section="Invoices"
      backHref={`/invoices/${id}`}
      backLabel="← Back to invoice"
    >
      <div className="p-6 max-w-[720px] mx-auto print:p-0 print:max-w-none">
        <div className="print:hidden flex flex-col gap-3 mb-6">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="bg-orange-600 hover:bg-orange-700 text-white font-medium px-5 py-2 rounded-xl"
            >
              Print / Save as PDF
            </button>
            <Link
              href={`/invoices/${id}`}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-5 py-2 rounded-xl font-medium"
            >
              Close
            </Link>
          </div>
          <p className="text-sm text-slate-600 max-w-xl">
            In the print dialog, turn <strong>off Headers and footers</strong>{' '}
            (More settings), then choose Save as PDF. That removes the URL, date,
            time, and page title from the PDF.
          </p>
        </div>

        <InvoiceTaxDocument invoice={invoice} />
      </div>
    </AccountingGate>
  );
}
