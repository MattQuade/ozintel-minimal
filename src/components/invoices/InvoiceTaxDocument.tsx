'use client';

import { useMemo } from 'react';
import { formatAuDate } from '@/lib/accounting/dates';
import {
  displayInvoiceNumber,
  titleCaseSubject,
} from '@/lib/invoices/invoiceBrand';
import {
  computeLineTotals,
  isFreightLine,
  linesForInvoiceMath,
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
  notes?: string;
  pricesIncludeGst?: boolean;
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

function subjectValue(raw: string): string {
  const s = titleCaseSubject(String(raw || '').replace(/:+\s*$/, ''));
  return s ? `${s}:` : '';
}

/** Label column sized to longest label; values sit tight to the left. */
const META_COLS = 'max-content 1fr';
/** Qty | description | unit amount | (incl. GST) | line total — totals share this last column */
const LINE_COLS = '2.5rem minmax(0,1fr) 5.75rem max-content 5.75rem';

type Props = {
  invoice: InvoiceTaxData;
  /** Extra classes on the article (e.g. border for on-screen draft preview) */
  className?: string;
};

export default function InvoiceTaxDocument({ invoice, className = '' }: Props) {
  const mathLines = useMemo(
    () => linesForInvoiceMath(invoice.lines, invoice.pricesIncludeGst),
    [invoice.lines, invoice.pricesIncludeGst]
  );
  const rows = useMemo(() => {
    const product: InvoiceTaxLine[] = [];
    const discount: InvoiceTaxLine[] = [];
    for (const line of mathLines) {
      const t = computeLineTotals(line);
      if (t.isDiscount) discount.push(line);
      else product.push(line);
    }
    return { product, discount };
  }, [mathLines]);

  const printTotals = useMemo(() => {
    let subtotalIncl = 0;
    let discountIncl = 0;
    for (const line of mathLines) {
      const t = computeLineTotals(line);
      if (t.isDiscount) discountIncl = round2(discountIncl + Math.abs(t.incl));
      else subtotalIncl = round2(subtotalIncl + t.incl);
    }
    return {
      subtotalIncl,
      discountIncl,
      totalIncl: round2(invoice.total),
    };
  }, [mathLines, invoice.total]);

  const subject = subjectValue(
    String(invoice.subject || '').trim() || DEFAULT_SUBJECT
  );
  const orderDate = String(invoice.orderDate || '').trim();

  return (
    <article
      className={`bg-white text-black print:border-0 p-10 print:p-0 text-[15px] leading-[1.4] font-bold ${className}`}
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <header className="text-center mb-8 print:mb-6">
        <h1 className="text-[18px] font-bold tracking-wide uppercase mb-4">
          TAX INVOICE
        </h1>
        <div className="font-bold text-[15px] leading-snug">{BUSINESS_NAME}</div>
        <div className="whitespace-pre-line font-bold text-[15px] leading-snug mt-0.5">
          {BUSINESS_ADDRESS}
        </div>
        <div className="mt-4 font-bold text-[15px]">ABN: {BUSINESS_ABN}</div>
      </header>

      {/* Meta — To / Date / Order Date / Invoice No. / Subject share one value column */}
      <section className="mb-5 font-bold">
        <div className="flex items-end justify-between gap-4">
          <div
            className="grid gap-x-3 gap-y-0.5 items-baseline"
            style={{ gridTemplateColumns: META_COLS }}
          >
            <div>To:</div>
            <div>{invoice.customerName}</div>
            <div>Date:</div>
            <div>{formatAuDate(invoice.issueDate)}</div>
            {orderDate ? (
              <>
                <div>Order Date:</div>
                <div>{formatAuDate(orderDate)}</div>
              </>
            ) : null}
            <div>Invoice No.:</div>
            <div>{displayInvoiceNumber(invoice.number)}</div>
            {subject ? (
              <>
                <div>Subject:</div>
                <div>{subject}</div>
              </>
            ) : null}
          </div>
          <div className="w-[5.75rem] text-right shrink-0">$</div>
        </div>
      </section>

      {/* Line items + totals share one grid so far-right amounts stay aligned */}
      <div
        className="mb-8 font-bold grid gap-x-5 gap-y-0.5 items-baseline"
        style={{ gridTemplateColumns: LINE_COLS }}
      >
        {rows.product.map((line) => {
          const t = computeLineTotals(line);
          const unitIncl = unitPriceInclGst(line);
          const qty = Number(line.quantity) || 0;
          const desc = String(line.description || '').trim();

          if (isFreightLine(line)) {
            return (
              <div key={line.id} className="contents">
                <div className="col-span-4 py-0.5">
                  Freight: {Math.abs(qty)} x ${fmtAmount(unitIncl)} (incl. GST)
                </div>
                <div className="text-right tabular-nums py-0.5">
                  {fmtAmount(t.incl)}
                </div>
              </div>
            );
          }

          if (!desc) {
            return (
              <div key={line.id} className="contents">
                <div className="col-span-4 py-0.5" />
                <div className="text-right tabular-nums py-0.5">
                  {fmtAmount(t.incl)}
                </div>
              </div>
            );
          }

          return (
            <div key={line.id} className="contents">
              <div className="tabular-nums py-0.5">{qty}</div>
              <div className="min-w-0 pr-2 py-0.5">{desc}</div>
              <div className="text-right tabular-nums whitespace-nowrap py-0.5">
                {fmtAmount(unitIncl)}
              </div>
              <div className="font-normal whitespace-nowrap py-0.5">
                (incl. GST)
              </div>
              <div className="text-right tabular-nums py-0.5">
                {fmtAmount(t.incl)}
              </div>
            </div>
          );
        })}

        <div className="col-span-4 mt-6">Subtotal:</div>
        <div className="text-right tabular-nums mt-6">
          {fmtAmount(printTotals.subtotalIncl)}
        </div>

        {rows.discount.map((line) => {
          const t = computeLineTotals(line);
          return (
            <div key={line.id} className="contents">
              <div className="col-span-4 mt-2">{lessLabel(line.description)}</div>
              <div className="text-right tabular-nums mt-2">
                {fmtAmount(t.incl)}
              </div>
            </div>
          );
        })}

        <div className="col-span-4 mt-4">Total (incl. GST):</div>
        <div className="text-right tabular-nums mt-4">
          {fmtAmount(printTotals.totalIncl)}
        </div>
      </div>

      <p className="text-center font-bold mb-8">Thank you for your custom</p>

      <section
        className="mb-6 grid gap-x-3 gap-y-0.5 items-baseline font-bold"
        style={{ gridTemplateColumns: META_COLS }}
      >
        <div>{BANK_NAME}:</div>
        <div>{BANK_ACCOUNT_NAME}</div>
        <div>BSB:</div>
        <div>{BANK_BSB}</div>
        <div>Account:</div>
        <div>{BANK_ACCOUNT}</div>
      </section>

      <footer className="text-[15px] font-normal leading-[1.4] text-black space-y-0.5 print:mt-2">
        {String(invoice.notes || '').trim() ? (
          <div className="whitespace-pre-line">
            Notes: {String(invoice.notes).trim()}
          </div>
        ) : null}
        {invoice.matchKeyword ? (
          <div>Payment Reference: {invoice.matchKeyword}</div>
        ) : null}
        <div>Invoice generated by OzIntel Accounting · ozintel.com.au</div>
      </footer>
    </article>
  );
}
