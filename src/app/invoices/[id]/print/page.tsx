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

/** Env override if set; otherwise Collingullie Hotel defaults (must show in prod without env). */
function envText(key: string, fallback: string) {
  const raw = process.env[key];
  if (raw == null || String(raw).trim() === '') return fallback;
  return String(raw).replace(/\\n/g, '\n').trim();
}

const BUSINESS_NAME = envText(
  'NEXT_PUBLIC_OZINTEL_BUSINESS_NAME',
  'Collingullie Hotel'
);
const BUSINESS_ADDRESS = envText(
  'NEXT_PUBLIC_OZINTEL_BUSINESS_ADDRESS',
  '10 Lockhart Road,\nCollingullie, NSW, 2650'
);
const BUSINESS_ABN = envText('NEXT_PUBLIC_OZINTEL_ABN', '79 095 176 373');
const BANK_NAME = envText('NEXT_PUBLIC_OZINTEL_BANK_NAME', 'ANZ');
const BANK_ACCOUNT_NAME = envText(
  'NEXT_PUBLIC_OZINTEL_BANK_ACCOUNT_NAME',
  'Collingullie Hotel'
);
const BANK_BSB = envText('NEXT_PUBLIC_OZINTEL_BANK_BSB', '012-823');
const BANK_ACCOUNT = envText(
  'NEXT_PUBLIC_OZINTEL_BANK_ACCOUNT',
  '4236-236-56'
);
const DEFAULT_SUBJECT = envText(
  'NEXT_PUBLIC_OZINTEL_INVOICE_SUBJECT',
  'Draught'
);

function lessLabel(description: string): string {
  const d = String(description || '').trim();
  if (/^less\s*:/i.test(d)) return d;
  if (/^discount\s*:?\s*/i.test(d)) {
    const rest = d.replace(/^discount\s*:?\s*/i, '').trim();
    return rest ? `Less: ${rest}` : 'Less:';
  }
  return `Less: ${d}`;
}

function subjectDisplay(raw: string): string {
  const s = String(raw || '').trim().replace(/:+\s*$/, '');
  return s ? `Subject: ${s}:` : '';
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

  const subject = subjectDisplay(
    String(invoice.subject || '').trim() || DEFAULT_SUBJECT
  );
  const orderDate = String(invoice.orderDate || '').trim();

  return (
    <AccountingGate
      section="Invoices"
      backHref={`/invoices/${id}`}
      backLabel="← Back to invoice"
    >
      <div className="p-6 max-w-[720px] mx-auto print:p-0 print:max-w-none">
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
          className="bg-white text-black print:border-0 p-10 print:p-8 text-[15px] leading-[1.45] font-bold"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          {/* Header — centered like the paper invoice */}
          <header className="text-center mb-12">
            <h1 className="text-[18px] font-bold tracking-wide uppercase mb-5">
              TAX INVOICE
            </h1>
            <div className="font-bold text-[15px] leading-snug">
              {BUSINESS_NAME}
            </div>
            <div className="whitespace-pre-line font-bold text-[15px] leading-snug mt-0.5">
              {BUSINESS_ADDRESS}
            </div>
            <div className="mt-5 font-bold text-[15px]">
              ABN: {BUSINESS_ABN}
            </div>
          </header>

          {/* Meta — left-aligned, bold label + value */}
          <section className="mb-8 space-y-0.5 font-bold">
            <div>
              To: {invoice.customerName}
            </div>
            <div>
              Date: {formatAuDate(invoice.issueDate)}
            </div>
            {orderDate ? (
              <div>
                Order Date: {formatAuDate(orderDate)}
              </div>
            ) : null}
            <div>
              Invoice No.: {invoice.number}
            </div>
          </section>

          {/* Subject + $ column cue */}
          <div className="flex justify-between items-baseline mb-2 font-bold">
            <div>{subject}</div>
            <div className="pr-0.5">$</div>
          </div>

          {/* Line items — qty | desc | unit (incl. GST) | total; minimal borders */}
          <div className="mb-1 font-bold">
            {rows.product.map((line) => {
              const t = computeLineTotals(line);
              const unitIncl = unitPriceInclGst(line);
              const qty = Number(line.quantity) || 0;
              const desc = String(line.description || '').trim();

              if (isFreightLine(line)) {
                return (
                  <div
                    key={line.id}
                    className="grid grid-cols-[1fr_5.75rem] gap-x-4 py-[2px]"
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

              /* Bare amount-only / blank description line (e.g. rounding) */
              if (!desc) {
                return (
                  <div
                    key={line.id}
                    className="grid grid-cols-[1fr_5.75rem] gap-x-4 py-[2px]"
                  >
                    <div />
                    <div className="text-right tabular-nums">
                      {fmtAmount(t.incl)}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={line.id}
                  className="grid grid-cols-[2.25rem_minmax(0,1fr)_5.75rem] gap-x-2 py-[2px] items-baseline"
                >
                  <div className="tabular-nums">{qty}</div>
                  <div className="min-w-0">
                    <span>{desc}</span>
                    <span className="ml-4 tabular-nums">
                      {fmtAmount(unitIncl)}
                    </span>
                    <span className="ml-1">(incl. GST)</span>
                  </div>
                  <div className="text-right tabular-nums">
                    {fmtAmount(t.incl)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals — full width; labels left with items, amounts right */}
          <div className="mt-8 grid grid-cols-[1fr_5.75rem] gap-x-4 font-bold">
            <div>Subtotal:</div>
            <div className="text-right tabular-nums">
              {fmtAmount(printTotals.subtotalIncl)}
            </div>
          </div>

          {rows.discount.map((line) => {
            const t = computeLineTotals(line);
            return (
              <div
                key={line.id}
                className="mt-3 grid grid-cols-[1fr_5.75rem] gap-x-4 font-bold"
              >
                <div>{lessLabel(line.description)}</div>
                <div className="text-right tabular-nums">
                  {fmtAmount(t.incl)}
                </div>
              </div>
            );
          })}

          <div className="mt-6 mb-12 grid grid-cols-[1fr_5.75rem] gap-x-4 font-bold">
            <div>Total (incl. GST):</div>
            <div className="text-right tabular-nums">
              {fmtAmount(printTotals.totalIncl)}
            </div>
          </div>

          <p className="text-center font-bold mb-12">
            Thank you for your custom
          </p>

          <section className="mb-16 space-y-0.5 font-bold">
            <div>
              {BANK_NAME}: {BANK_ACCOUNT_NAME}
            </div>
            <div>BSB: {BANK_BSB}</div>
            <div>Account: {BANK_ACCOUNT}</div>
          </section>

          <footer className="text-[11px] font-normal text-black space-y-0.5">
            {invoice.matchKeyword ? (
              <div>Payment Reference: {invoice.matchKeyword}</div>
            ) : null}
            <div>Generated by OzIntel Accounting</div>
          </footer>
        </article>
      </div>
    </AccountingGate>
  );
}
