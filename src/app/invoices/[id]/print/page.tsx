'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate } from '@/lib/accounting/dates';
import {
  computeLineTotals,
  isFreightLine,
  round2,
  unitPriceInclGst,
} from '@/lib/accounting/invoiceMath';

type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  hasGST: boolean;
};

type Invoice = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  orderDate?: string;
  subject?: string;
  lines: InvoiceLine[];
  status: string;
  subtotal: number;
  discountTotal?: number;
  gstTotal: number;
  total: number;
  notes: string;
  matchKeyword?: string;
};

function fmtAmount(n: number) {
  return new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n) || 0);
}

function envText(key: string, fallback = '') {
  const raw = process.env[key];
  if (raw == null || raw === '') return fallback;
  return String(raw).replace(/\\n/g, '\n').trim();
}

const BUSINESS_NAME = envText(
  'NEXT_PUBLIC_OZINTEL_BUSINESS_NAME',
  'OzIntel Accounting'
);
const BUSINESS_ADDRESS = envText('NEXT_PUBLIC_OZINTEL_BUSINESS_ADDRESS');
const BUSINESS_ABN = envText('NEXT_PUBLIC_OZINTEL_ABN');
const BANK_NAME = envText('NEXT_PUBLIC_OZINTEL_BANK_NAME');
const BANK_ACCOUNT_NAME = envText('NEXT_PUBLIC_OZINTEL_BANK_ACCOUNT_NAME');
const BANK_BSB = envText('NEXT_PUBLIC_OZINTEL_BANK_BSB');
const BANK_ACCOUNT = envText('NEXT_PUBLIC_OZINTEL_BANK_ACCOUNT');
const DEFAULT_SUBJECT = envText('NEXT_PUBLIC_OZINTEL_INVOICE_SUBJECT');

function lessLabel(description: string): string {
  const d = String(description || '').trim();
  if (/^less\s*:/i.test(d)) return d;
  if (/^discount\s*:?\s*/i.test(d)) {
    const rest = d.replace(/^discount\s*:?\s*/i, '').trim();
    return rest ? `Less: ${rest}` : 'Less:';
  }
  return `Less: ${d}`;
}

export default function InvoicePrintPage() {
  const params = useParams();
  const id = String(params.id || '');
  const [invoice, setInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/invoices/${id}`);
      if (!res.ok) return;
      setInvoice(await res.json());
    })();
  }, [id]);

  const rows = useMemo(() => {
    if (!invoice) return { product: [] as InvoiceLine[], discount: [] as InvoiceLine[] };
    const product: InvoiceLine[] = [];
    const discount: InvoiceLine[] = [];
    for (const line of invoice.lines) {
      const t = computeLineTotals(line);
      if (t.isDiscount) discount.push(line);
      else product.push(line);
    }
    return { product, discount };
  }, [invoice]);

  const printTotals = useMemo(() => {
    if (!invoice) return { subtotalIncl: 0, discountIncl: 0, totalIncl: 0 };
    let subtotalIncl = 0;
    let discountIncl = 0;
    for (const line of invoice.lines) {
      const t = computeLineTotals(line);
      if (t.isDiscount) discountIncl = round2(discountIncl + Math.abs(t.incl));
      else subtotalIncl = round2(subtotalIncl + t.incl);
    }
    return {
      subtotalIncl,
      discountIncl,
      totalIncl: round2(invoice.total),
    };
  }, [invoice]);

  if (!invoice) {
    return (
      <AccountingGate section="Invoices" backHref={`/invoices/${id}`} backLabel="← Back">
        <div className="p-8 text-slate-500">Loading…</div>
      </AccountingGate>
    );
  }

  const subject =
    String(invoice.subject || '').trim() || DEFAULT_SUBJECT;
  const orderDate = String(invoice.orderDate || '').trim();
  const hasBank =
    BANK_NAME || BANK_ACCOUNT_NAME || BANK_BSB || BANK_ACCOUNT;

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

        <article
          className="bg-white border border-slate-200 print:border-0 p-10 print:p-0 text-[15px] text-black leading-relaxed"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          <header className="text-center mb-10">
            <h1 className="text-xl font-bold tracking-wide uppercase mb-4">
              Tax Invoice
            </h1>
            <div className="font-bold text-base">{BUSINESS_NAME}</div>
            {BUSINESS_ADDRESS && (
              <div className="whitespace-pre-line mt-0.5">
                {BUSINESS_ADDRESS}
              </div>
            )}
            {BUSINESS_ABN && (
              <div className="mt-0.5">
                <span className="font-bold">ABN:</span> {BUSINESS_ABN}
              </div>
            )}
          </header>

          <section className="mb-8 space-y-1">
            <div>
              <span className="font-bold">To:</span>{' '}
              {invoice.customerName}
            </div>
            <div>
              <span className="font-bold">Date:</span>{' '}
              {formatAuDate(invoice.issueDate)}
            </div>
            {orderDate && (
              <div>
                <span className="font-bold">Order Date:</span>{' '}
                {formatAuDate(orderDate)}
              </div>
            )}
            <div>
              <span className="font-bold">Invoice No.:</span>{' '}
              {invoice.number}
            </div>
          </section>

          <div className="flex justify-between items-baseline mb-3">
            {subject ? (
              <div className="font-bold">Subject: {subject}:</div>
            ) : (
              <div />
            )}
            <div className="font-bold pr-0.5">$</div>
          </div>

          <div className="mb-2">
            {rows.product.map((line) => {
              const t = computeLineTotals(line);
              const unitIncl = unitPriceInclGst(line);
              const qty = Number(line.quantity) || 0;

              if (isFreightLine(line)) {
                return (
                  <div
                    key={line.id}
                    className="grid grid-cols-[1fr_5.5rem] gap-x-4 py-0.5"
                  >
                    <div>
                      Freight: {Math.abs(qty)} x ${fmtAmount(unitIncl)}{' '}
                      (incl.GST)
                    </div>
                    <div className="text-right tabular-nums">
                      {fmtAmount(t.incl)}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={line.id}
                  className="grid grid-cols-[2.5rem_1fr_auto_5.5rem] gap-x-3 py-0.5 items-baseline"
                >
                  <div className="tabular-nums">{qty}</div>
                  <div className="min-w-0">
                    <span>{line.description}</span>
                    <span className="ml-3 tabular-nums">
                      {fmtAmount(unitIncl)}
                    </span>
                    <span className="ml-1 text-[13px]">(incl. GST)</span>
                  </div>
                  <div />
                  <div className="text-right tabular-nums">
                    {fmtAmount(t.incl)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 mb-2 flex justify-end">
            <div className="grid grid-cols-[auto_5.5rem] gap-x-6 min-w-[14rem]">
              <div className="font-bold text-right">Subtotal:</div>
              <div className="text-right tabular-nums font-bold">
                {fmtAmount(printTotals.subtotalIncl)}
              </div>
            </div>
          </div>

          {rows.discount.map((line) => {
            const t = computeLineTotals(line);
            return (
              <div
                key={line.id}
                className="grid grid-cols-[1fr_5.5rem] gap-x-4 py-0.5 mt-2"
              >
                <div>{lessLabel(line.description)}</div>
                <div className="text-right tabular-nums">
                  {fmtAmount(t.incl)}
                </div>
              </div>
            );
          })}

          <div className="mt-6 mb-10 grid grid-cols-[1fr_5.5rem] gap-x-4">
            <div className="font-bold">Total (incl. GST):</div>
            <div className="text-right tabular-nums font-bold">
              {fmtAmount(printTotals.totalIncl)}
            </div>
          </div>

          <p className="text-center font-bold mb-10">
            Thank you for your custom
          </p>

          {hasBank && (
            <section className="mb-14 space-y-0.5">
              {(BANK_NAME || BANK_ACCOUNT_NAME) && (
                <div>
                  {BANK_NAME && (
                    <span className="font-bold">{BANK_NAME}:</span>
                  )}
                  {BANK_ACCOUNT_NAME && (
                    <>
                      {BANK_NAME ? ' ' : ''}
                      {BANK_ACCOUNT_NAME}
                    </>
                  )}
                </div>
              )}
              {BANK_BSB && (
                <div>
                  <span className="font-bold">BSB:</span> {BANK_BSB}
                </div>
              )}
              {BANK_ACCOUNT && (
                <div>
                  <span className="font-bold">Account:</span> {BANK_ACCOUNT}
                </div>
              )}
            </section>
          )}

          <footer className="text-xs text-slate-600 space-y-0.5 print:mt-8">
            {invoice.matchKeyword && (
              <div>Payment Reference: {invoice.matchKeyword}</div>
            )}
            <div>Generated by OzIntel Accounting</div>
          </footer>
        </article>
      </div>
    </AccountingGate>
  );
}
