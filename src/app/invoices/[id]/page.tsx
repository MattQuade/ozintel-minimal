'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';
import VoiceNavBar from '@/components/VoiceNavBar';
import InvoiceTaxDocument from '@/components/invoices/InvoiceTaxDocument';
import { formatAuDate } from '@/lib/accounting/dates';
import { displayInvoiceNumber } from '@/lib/invoices/invoiceBrand';
import { computeLineTotals } from '@/lib/accounting/invoiceMath';

type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  accountCode: string;
  accountName: string;
  hasGST: boolean;
};

type InvoicePayment = {
  id: string;
  date: string;
  amount: number;
  bankAccountName: string;
  note: string;
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
  amountPaid: number;
  amountDue: number;
  notes: string;
  matchKeyword?: string;
  ledgerEntryIds: string[];
  journalRef: string;
  payments: InvoicePayment[];
  authorisedAt?: string;
  voidedAt?: string;
};

type BankAccount = { id: string; name: string };

function money(n: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(n || 0);
}

const statusClass: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  authorised: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  void: 'bg-red-100 text-red-700',
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || '');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [payBankId, setPayBankId] = useState('');
  const [payNote, setPayNote] = useState('');
  const [matchKeyword, setMatchKeyword] = useState('');
  const [keywordDirty, setKeywordDirty] = useState(false);
  const [orderDate, setOrderDate] = useState('');
  const [subject, setSubject] = useState('');
  const [printMetaDirty, setPrintMetaDirty] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [numberDirty, setNumberDirty] = useState(false);
  const [emailStatus, setEmailStatus] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices/${id}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      setInvoice(data);
      setMatchKeyword(String(data.matchKeyword || ''));
      setKeywordDirty(false);
      setOrderDate(String(data.orderDate || '').slice(0, 10));
      setSubject(String(data.subject || ''));
      setPrintMetaDirty(false);
      setInvoiceNumber(displayInvoiceNumber(String(data.number || '')));
      setNumberDirty(false);
      setPayAmount(
        data.amountDue > 0 ? String(data.amountDue) : ''
      );
    } catch {
      setError('Invoice not found');
    }
  }, [id]);

  useEffect(() => {
    load();
    fetch('/api/bank-accounts')
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setBanks(list);
        if (list[0]) setPayBankId(list[0].id);
      })
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    const onUpdated = () => {
      void load();
    };
    window.addEventListener('ozintel-invoice-updated', onUpdated);
    return () =>
      window.removeEventListener('ozintel-invoice-updated', onUpdated);
  }, [load]);

  const emailInvoice = async () => {
    if (!invoice) return;
    setBusy(true);
    setError('');
    setEmailStatus('');
    try {
      const previewRes = await fetch(`/api/invoices/${id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: false }),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok || !preview.success) {
        throw new Error(preview.error || 'Could not prepare email');
      }
      if (
        !confirm(
          `Email ${preview.invoiceNumber} to ${preview.to} from admin@ozintel.com.au?`
        )
      ) {
        setBusy(false);
        return;
      }
      const res = await fetch(`/api/invoices/${id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, to: preview.to }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Email failed');
      }
      setEmailStatus(data.label || `Sent to ${preview.to}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email failed');
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (
    path: string,
    body?: Record<string, unknown>,
    confirmMsg?: string
  ) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Action failed');
      setInvoice(data.invoice);
      if (data.invoice?.number) {
        setInvoiceNumber(displayInvoiceNumber(String(data.invoice.number)));
        setNumberDirty(false);
      }
      if (data.invoice?.amountDue != null) {
        setPayAmount(
          data.invoice.amountDue > 0 ? String(data.invoice.amountDue) : ''
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const saveKeyword = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchKeyword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      setInvoice(data.invoice);
      setMatchKeyword(String(data.invoice.matchKeyword || ''));
      setKeywordDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const savePrintMeta = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate: orderDate || '',
          subject: subject.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      setInvoice(data.invoice);
      setOrderDate(String(data.invoice.orderDate || '').slice(0, 10));
      setSubject(String(data.invoice.subject || ''));
      setPrintMetaDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const saveNumber = async () => {
    const next = invoiceNumber.trim();
    if (!next) {
      setError('Invoice number is required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      setInvoice(data.invoice);
      setInvoiceNumber(displayInvoiceNumber(String(data.invoice.number || '')));
      setNumberDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteDraft = async () => {
    if (!invoice) return;
    if (!confirm(`Delete ${invoice.number}?`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Delete failed');
      router.push('/invoices');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setBusy(false);
    }
  };

  if (!invoice && !error) {
    return (
      <AccountingGate section="Invoices" backHref="/invoices" backLabel="← Back to Invoices">
        <div className="p-8 text-slate-500">Loading…</div>
      </AccountingGate>
    );
  }

  if (!invoice) {
    return (
      <AccountingGate section="Invoices" backHref="/invoices" backLabel="← Back to Invoices">
        <div className="p-8 text-red-600">{error}</div>
      </AccountingGate>
    );
  }

  const canPay =
    (invoice.status === 'authorised' || invoice.status === 'paid') &&
    invoice.amountDue > 0.009;
  const canEdit =
    invoice.status === 'draft' ||
    invoice.status === 'authorised' ||
    invoice.status === 'paid';
  const canEditNumber = canEdit;

  return (
    <AccountingGate section="Invoices" backHref="/invoices" backLabel="← Back to Invoices">
      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-1">
              {canEditNumber ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="text-3xl font-bold border border-slate-300 rounded-xl px-3 py-1 max-w-[220px]"
                    value={invoiceNumber}
                    onChange={(e) => {
                      setInvoiceNumber(e.target.value);
                      setNumberDirty(true);
                    }}
                    aria-label="Invoice number"
                  />
                  <button
                    type="button"
                    disabled={busy || !numberDirty}
                    onClick={saveNumber}
                    className="bg-slate-800 hover:bg-slate-900 text-white text-sm px-3 py-2 rounded-xl disabled:opacity-40"
                  >
                    Save number
                  </button>
                </div>
              ) : (
                <h1 className="text-3xl font-bold">
                  {displayInvoiceNumber(invoice.number)}
                </h1>
              )}
              <span
                className={`px-2.5 py-0.5 rounded-md text-xs font-medium capitalize ${
                  statusClass[invoice.status] || 'bg-slate-100'
                }`}
              >
                {invoice.status}
              </span>
            </div>
            <p className="text-slate-600">{invoice.customerName}</p>
            {invoice.journalRef && (
              <p className="text-xs text-slate-400 mt-1">
                Journal: {invoice.journalRef}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/invoices/${invoice.id}/print`}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-2 rounded-xl text-sm font-medium"
            >
              Print / PDF
            </Link>
            {invoice.status !== 'void' && (
              <button
                type="button"
                disabled={busy}
                onClick={emailInvoice}
                className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                Email invoice
              </button>
            )}
            {canEdit && (
              <Link
                href={`/invoices/${invoice.id}/edit`}
                className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 px-4 py-2 rounded-xl text-sm font-medium"
              >
                Edit
              </Link>
            )}
            {invoice.status === 'draft' && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runAction(
                      `/api/invoices/${id}/authorise`,
                      undefined,
                      'Authorise this invoice? This posts AR, revenue, and GST to the ledger.'
                    )
                  }
                  className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  Authorise
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={deleteDraft}
                  className="bg-white border border-red-200 text-red-700 px-4 py-2 rounded-xl text-sm"
                >
                  Delete
                </button>
              </>
            )}
            {invoice.status === 'void' && (
              <button
                type="button"
                disabled={busy}
                onClick={deleteDraft}
                className="bg-white border border-red-200 text-red-700 px-4 py-2 rounded-xl text-sm"
              >
                Delete
              </button>
            )}
            {(invoice.status === 'authorised' || invoice.status === 'draft') && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(
                    `/api/invoices/${id}/void`,
                    undefined,
                    invoice.status === 'authorised'
                      ? 'Void this invoice? A reversing journal will be posted.'
                      : 'Void this draft?'
                  )
                }
                className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-xl text-sm disabled:opacity-50"
              >
                Void
              </button>
            )}
          </div>
        </div>

        <VoiceNavBar
          variant="hub"
          examples={[
            'Edit issue date',
            'Edit order date',
            'Add new line item',
            'Delete invoice number',
            'Edit notes',
            'Scroll down',
            'Email invoice',
          ]}
        />

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}
        {emailStatus && (
          <div className="mb-4 p-3 rounded-xl bg-green-50 text-green-800 text-sm">
            {emailStatus}
          </div>
        )}

        {invoice.status === 'draft' && (
          <div className="mb-6">
            <p className="text-sm text-slate-500 mb-3">
              Tax invoice preview (same layout as Print / PDF). Use{' '}
              <Link
                href={`/invoices/${invoice.id}/edit`}
                className="font-medium text-orange-700 hover:underline"
              >
                Edit
              </Link>{' '}
              to change lines, then authorise when it looks right.
            </p>
            <div className="max-w-[720px] border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <InvoiceTaxDocument invoice={invoice} />
            </div>
          </div>
        )}

        {invoice.status !== 'draft' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          {canEdit && (
            <p className="text-sm text-slate-500 mb-4">
              Need to change lines or dates?{' '}
              <Link
                href={`/invoices/${invoice.id}/edit`}
                className="font-medium text-orange-700 hover:underline"
              >
                Edit
              </Link>{' '}
              — saving replaces the AR / revenue / GST journal.
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-6">
            <div>
              <div className="text-slate-500">Issue date</div>
              <div className="font-medium">{formatAuDate(invoice.issueDate)}</div>
            </div>
            <div>
              <div className="text-slate-500">Due date</div>
              <div className="font-medium">{formatAuDate(invoice.dueDate)}</div>
            </div>
            <div>
              <div className="text-slate-500">Amount paid</div>
              <div className="font-medium">{money(invoice.amountPaid)}</div>
            </div>
            <div>
              <div className="text-slate-500">Amount due</div>
              <div className="font-medium">{money(invoice.amountDue)}</div>
            </div>
          </div>

          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-2 font-medium">Description</th>
                <th className="text-right py-2 font-medium">Qty</th>
                <th className="text-right py-2 font-medium">Unit</th>
                <th className="text-left py-2 font-medium pl-4">Account</th>
                <th className="text-center py-2 font-medium">GST</th>
                <th className="text-right py-2 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => {
                const t = computeLineTotals(line);
                return (
                  <tr key={line.id} className="border-b border-slate-100">
                    <td className="py-2">{line.description}</td>
                    <td className="py-2 text-right">{line.quantity}</td>
                    <td className="py-2 text-right">{money(line.unitPrice)}</td>
                    <td className="py-2 pl-4 text-slate-600">
                      {line.accountCode} {line.accountName}
                    </td>
                    <td className="py-2 text-center">
                      {line.hasGST ? '10%' : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {t.isDiscount ? `−${money(Math.abs(t.excl))}` : money(t.excl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="text-sm space-y-1 w-52">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span>{money(invoice.subtotal)}</span>
              </div>
              {(invoice.discountTotal || 0) > 0.009 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Discount</span>
                  <span>−{money(invoice.discountTotal || 0)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">GST</span>
                <span>{money(invoice.gstTotal)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base border-t border-slate-200 pt-1">
                <span>Total</span>
                <span>{money(invoice.total)}</span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <p className="mt-4 text-sm text-slate-600 border-t border-slate-100 pt-4">
              {invoice.notes}
            </p>
          )}
        </div>
        )}

        {invoice.status !== 'void' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          {invoice.status === 'draft' && invoice.notes ? (
            <p className="mb-4 text-sm text-slate-600 border-b border-slate-100 pb-4">
              {invoice.notes}
            </p>
          ) : null}
          <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Print details
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      Order date
                    </label>
                    <input
                      type="date"
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                      value={orderDate}
                      onChange={(e) => {
                        setOrderDate(e.target.value);
                        setPrintMetaDirty(true);
                      }}
                    />
                    {orderDate && (
                      <p className="text-xs text-slate-400 mt-1">
                        {formatAuDate(orderDate)}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      Subject
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                      value={subject}
                      onChange={(e) => {
                        setSubject(e.target.value);
                        setPrintMetaDirty(true);
                      }}
                      placeholder="e.g. Draught"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy || !printMetaDirty}
                  onClick={savePrintMeta}
                  className="mt-2 bg-slate-800 hover:bg-slate-900 text-white text-sm px-4 py-2 rounded-xl disabled:opacity-40"
                >
                  Save print details
                </button>
              </div>

              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Bank match keyword
                </label>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    className="flex-1 min-w-[200px] border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    value={matchKeyword}
                    onChange={(e) => {
                      setMatchKeyword(e.target.value);
                      setKeywordDirty(true);
                    }}
                    placeholder="e.g. job name or reference"
                    disabled={invoice.status === 'void'}
                  />
                  <button
                    type="button"
                    disabled={busy || !keywordDirty}
                    onClick={saveKeyword}
                    className="bg-slate-800 hover:bg-slate-900 text-white text-sm px-4 py-2 rounded-xl disabled:opacity-40"
                  >
                    Save keyword
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Used with bank deposits for auto-reconcile. When a deposit amount
                  matches amount due and the bank description contains this keyword,
                  the payment is applied automatically. Also prints as Payment
                  Reference.
                </p>
              </div>
            </div>
        </div>
        )}

        {canPay && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
            <h2 className="font-semibold text-lg mb-4">Record payment</h2>
            <p className="text-sm text-slate-500 mb-4">
              Posts Dr Bank / Cr Accounts Receivable (2101). Ledger lines are tagged with{' '}
              <code className="text-xs bg-slate-100 px-1 rounded">invoiceId</code> for
              bank-import allocation later.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Date</label>
                <input
                  type="date"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-1">
                  {formatAuDate(payDate)}
                </p>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Bank account</label>
                <select
                  className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  value={payBankId}
                  onChange={(e) => setPayBankId(e.target.value)}
                >
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Note</label>
                <input
                  className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              disabled={busy || !payBankId}
              onClick={() =>
                runAction(`/api/invoices/${id}/payment`, {
                  amount: parseFloat(payAmount),
                  date: payDate,
                  bankAccountId: payBankId,
                  note: payNote,
                })
              }
              className="mt-4 bg-green-700 hover:bg-green-800 text-white font-medium px-5 py-2 rounded-xl disabled:opacity-50"
            >
              Post payment
            </button>
          </div>
        )}

        {invoice.payments?.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-semibold mb-3">Payments</h2>
            <ul className="text-sm space-y-2">
              {invoice.payments.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2"
                >
                  <span>
                    {formatAuDate(p.date)} · {p.bankAccountName}
                    {p.note ? ` — ${p.note}` : ''}
                  </span>
                  <span className="font-medium">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AccountingGate>
  );
}
