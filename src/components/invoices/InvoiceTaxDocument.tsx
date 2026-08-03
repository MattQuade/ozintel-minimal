'use client';

import { useMemo } from 'react';
import { formatAuDate } from '@/lib/accounting/dates';
import {
  computeLineTotals,
  isFreightLine,
  round2,
  unitPriceInclGst,
} from '@/lib/accounting/invoiceMath';

export type InvoiceTaxLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  hasGST: boolean;
};

export type InvoiceTaxData = {
  number: string;
  customerName: string;
  issueDate: string;
  orderDate?: string;
  subject?: string;
  lines: InvoiceTaxLine[];
  total: number;
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

type Props = {
  invoice: InvoiceTaxData;
  /** Extra classes on the article (e.g. border for on-screen draft preview) */
  className?: string;
};

export default function InvoiceTaxDocument({ invoice, className = '' }: Props) {
  const rows = useMemo(() => {
    const product: InvoiceTaxLine[] = [];
    const discount: InvoiceTaxLine[] = [];
    for (const line of invoice.lines) {
      const t = computeLineTotals(line);
      if (t.isDiscount) discount.push(line);
      else product.push(line);
    }
    return { product, discount };
  }, [invoice.lines]);

  const printTotals = useMemo(() => {
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
  }, [invoice.lines, invoice.total]);

  const subject = subjectDisplay(
    String(invoice.subject || '').trim() || DEFAULT_SUBJECT
  );
  const orderDate = String(invoice.orderDate || '').trim();

  return (
    <article
      className={`bg-white text-black print:border-0 p-10 print:p-8 text-[15px] leading-[1.45] font-bold ${className}`}
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <header className="text-center mb-12">
        <h1 className="text-[18px] font-bold tracking-wide uppercase mb-5">
          TAX INVOICE
        </h1>
        <div className="font-bold text-[15px] leading-snug">{BUSINESS_NAME}</div>
        <div className="whitespace-pre-line font-bold text-[15px] leading-snug mt-0.5">
          {BUSINESS_ADDRESS}
        </div>
        <div className="mt-5 font-bold text-[15px]">ABN: {BUSINESS_ABN}</div>
      </header>

      {/* Meta — labels left, values in one vertical column (Excel-style) */}
      <section className="mb-8 font-bold">
        <div className="mb-0.5">To: {invoice.customerName}</div>
        <div
          className="grid gap-x-4 gap-y-0.5 items-baseline"
          style={{ gridTemplateColumns: 'max-content 1fr' }}
        >
          <div>Date:</div>
          <div>{formatAuDate(invoice.issueDate)}</div>
          {orderDate ? (
            <>
              <div>Order Date:</div>
              <div>{formatAuDate(orderDate)}</div>
            </>
          ) : null}
          <div>Invoice No.:</div>
          <div>{invoice.number}</div>
        </div>
      </section>

      <div className="flex justify-between items-baseline mb-2 font-bold">
        <div>{subject}</div>
        <div className="pr-0.5">$</div>
      </div>

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
                  Freight: {Math.abs(qty)} x ${fmtAmount(unitIncl)} (incl.GST)
                </div>
                <div className="text-right tabular-nums">{fmtAmount(t.incl)}</div>
              </div>
            );
          }

          if (!desc) {
            return (
              <div
                key={line.id}
                className="grid grid-cols-[1fr_5.75rem] gap-x-4 py-[2px]"
              >
                <div />
                <div className="text-right tabular-nums">{fmtAmount(t.incl)}</div>
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
                <span className="ml-4 tabular-nums">{fmtAmount(unitIncl)}</span>
                <span className="ml-1">(incl. GST)</span>
              </div>
              <div className="text-right tabular-nums">{fmtAmount(t.incl)}</div>
            </div>
          );
        })}
      </div>

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
            <div className="text-right tabular-nums">{fmtAmount(t.incl)}</div>
          </div>
        );
      })}

      <div className="mt-6 mb-12 grid grid-cols-[1fr_5.75rem] gap-x-4 font-bold">
        <div>Total (incl. GST):</div>
        <div className="text-right tabular-nums">
          {fmtAmount(printTotals.totalIncl)}
        </div>
      </div>

      <p className="text-center font-bold mb-12">Thank you for your custom</p>

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
  );
}
