'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate } from '@/lib/accounting/dates';

type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  hasGST: boolean;
};

type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  billingAddress: string;
  abn: string;
};

type Invoice = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  lines: InvoiceLine[];
  status: string;
  subtotal: number;
  gstTotal: number;
  total: number;
  notes: string;
  matchKeyword?: string;
};

function money(n: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(n || 0);
}

const BUSINESS_NAME =
  process.env.NEXT_PUBLIC_OZINTEL_BUSINESS_NAME || 'OzIntel Accounting';

export default function InvoicePrintPage() {
  const params = useParams();
  const id = String(params.id || '');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/invoices/${id}`);
      if (!res.ok) return;
      const inv = await res.json();
      setInvoice(inv);
      const cres = await fetch('/api/customers');
      const list = await cres.json();
      if (Array.isArray(list)) {
        setCustomer(list.find((c: Customer) => c.id === inv.customerId) || null);
      }
    })();
  }, [id]);

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
      <div className="p-6 max-w-3xl mx-auto">
        <div className="print:hidden flex gap-3 mb-6">
          <button
            type="button"
            onClick={() => window.print()}
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

        <article className="bg-white border border-slate-200 rounded-none print:border-0 p-8 print:p-0">
          <header className="flex justify-between gap-6 mb-10">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{BUSINESS_NAME}</h1>
              <p className="text-sm text-slate-500 mt-1">Tax Invoice</p>
            </div>
            <div className="text-right text-sm">
              <div className="text-xl font-semibold">{invoice.number}</div>
              <div className="text-slate-600 mt-1">
                Issue: {formatAuDate(invoice.issueDate)}
              </div>
              <div className="text-slate-600">
                Due: {formatAuDate(invoice.dueDate)}
              </div>
              <div className="capitalize mt-1 text-slate-500">{invoice.status}</div>
            </div>
          </header>

          <section className="mb-8 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-slate-400 mb-1">Bill to</h2>
            <div className="font-semibold text-slate-900">
              {customer?.name || invoice.customerName}
            </div>
            {customer?.billingAddress && (
              <div className="whitespace-pre-line text-slate-600 mt-1">
                {customer.billingAddress}
              </div>
            )}
            {customer?.email && (
              <div className="text-slate-600">{customer.email}</div>
            )}
            {customer?.abn && (
              <div className="text-slate-600">ABN {customer.abn}</div>
            )}
          </section>

          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="border-b-2 border-slate-800">
                <th className="text-left py-2 font-semibold">Description</th>
                <th className="text-right py-2 font-semibold">Qty</th>
                <th className="text-right py-2 font-semibold">Unit</th>
                <th className="text-right py-2 font-semibold">GST</th>
                <th className="text-right py-2 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => {
                const excl = line.quantity * line.unitPrice;
                const gst = line.hasGST ? excl * 0.1 : 0;
                return (
                  <tr key={line.id} className="border-b border-slate-200">
                    <td className="py-2">{line.description}</td>
                    <td className="py-2 text-right">{line.quantity}</td>
                    <td className="py-2 text-right">{money(line.unitPrice)}</td>
                    <td className="py-2 text-right">{money(gst)}</td>
                    <td className="py-2 text-right">{money(excl)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end mb-8">
            <div className="w-56 text-sm space-y-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{money(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>GST</span>
                <span>{money(invoice.gstTotal)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t border-slate-800 pt-2 mt-1">
                <span>Total AUD</span>
                <span>{money(invoice.total)}</span>
              </div>
            </div>
          </div>

          {invoice.matchKeyword && (
            <p className="text-xs text-slate-500 mb-4">
              Payment reference: {invoice.matchKeyword}
            </p>
          )}

          {invoice.notes && (
            <p className="text-sm text-slate-600 border-t border-slate-200 pt-4">
              {invoice.notes}
            </p>
          )}

          <footer className="mt-12 text-xs text-slate-400 print:mt-16">
            Generated by OzIntel · Unit prices exclude GST unless noted
          </footer>
        </article>
      </div>
    </AccountingGate>
  );
}
