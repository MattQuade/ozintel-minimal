'use client';

import { useEffect, useState } from 'react';
import { formatAuDate } from '@/lib/accounting/dates';
import ReceiptAttach, { ReceiptBadge } from '@/components/ReceiptAttach';

type CoaOption = {
  code: string;
  name: string;
  type: string;
  noGST?: boolean;
  isCapital?: boolean;
};

type LedgerRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: string;
  accountCode?: string;
  accountName?: string;
  reconciled?: boolean;
  receiptIds?: string[];
};

type Props = {
  title: string;
  subtitle: string;
  entryType: 'Revenue' | 'Expense';
  accentClass: string;
};

export default function LedgerQuickEntry({
  title,
  subtitle,
  entryType,
  accentClass,
}: Props) {
  const [coa, setCoa] = useState<CoaOption[]>([]);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [hasGST, setHasGST] = useState(true);
  const [receiptIds, setReceiptIds] = useState<string[]>([]);

  const typeAccounts = coa.filter((a) => a.type === entryType);

  const load = async () => {
    setLoading(true);
    try {
      const [coaRes, ledRes] = await Promise.all([
        fetch('/api/coa'),
        fetch('/api/ledger/entries'),
      ]);
      const accounts = await coaRes.json();
      const entries = await ledRes.json();
      setCoa(Array.isArray(accounts) ? accounts : []);
      const list = (Array.isArray(entries) ? entries : [])
        .filter((e: LedgerRow) => e.type === entryType)
        .sort(
          (a: LedgerRow, b: LedgerRow) =>
            String(b.date).localeCompare(String(a.date)) ||
            String(b.id).localeCompare(String(a.id))
        )
        .slice(0, 40);
      setRows(list);
    } catch {
      setStatus('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [entryType]);

  useEffect(() => {
    const acc = typeAccounts.find((a) => a.code === accountCode);
    if (acc) setHasGST(!acc.noGST);
  }, [accountCode, coa, entryType]);

  const save = async () => {
    const value = Math.abs(parseFloat(amount) || 0);
    if (!description.trim() || value < 0.005 || !accountCode) {
      setStatus('Date, description, amount and account are required');
      return;
    }
    const account = typeAccounts.find((a) => a.code === accountCode);
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/ledger/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [
            {
              date,
              description: description.trim(),
              amount: entryType === 'Expense' ? -value : value,
              type: entryType,
              accountCode,
              accountName: account?.name || '',
              account: `${accountCode} - ${account?.name || ''}`,
              hasGST,
              noGST: !hasGST,
              source: entryType === 'Revenue' ? 'sales' : 'purchases',
              reconciled: false,
              timestamp: new Date().toISOString(),
              ...(receiptIds.length > 0 ? { receiptIds } : {}),
            },
          ],
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setDescription('');
      setAmount('');
      setReceiptIds([]);
      setStatus(
        receiptIds.length
          ? 'Saved to ledger with receipt'
          : 'Saved to ledger'
      );
      await load();
    } catch {
      setStatus('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto">
      <h1 className="text-3xl sm:text-4xl font-bold mb-2">{title}</h1>
      <p className="text-gray-600 mb-8">{subtitle}</p>

      <div className="bg-white rounded-3xl shadow p-6 sm:p-8 mb-10">
        <h2 className="text-xl font-semibold mb-6">New {entryType} entry</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Account</label>
            <select
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              className="w-full border rounded-xl px-3 py-2"
            >
              <option value="">Select {entryType.toLowerCase()} account</option>
              {typeAccounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-500 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded-xl px-3 py-2"
              placeholder="What is this for?"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Amount (AUD, GST-inclusive)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border rounded-xl px-3 py-2"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasGST}
                onChange={(e) => setHasGST(e.target.checked)}
                className="w-5 h-5"
              />
              <span>Includes GST</span>
            </label>
          </div>
          <div className="md:col-span-2">
            <ReceiptAttach
              receiptIds={receiptIds}
              onChange={setReceiptIds}
              label={entryType === 'Expense' ? 'Receipt evidence (ATO)' : 'Receipt / attachment'}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={`mt-6 ${accentClass} text-white px-8 py-3 rounded-2xl disabled:bg-gray-400 w-full sm:w-auto`}
        >
          {saving ? 'Saving…' : `Save ${entryType}`}
        </button>
        {status && <p className="mt-3 text-sm text-gray-600">{status}</p>}
      </div>

      <div className="bg-white rounded-3xl shadow overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">Recent {entryType} entries</h2>
        </div>
        {loading ? (
          <p className="p-8 text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-gray-400">No {entryType.toLowerCase()} entries yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-4">Date</th>
                  <th className="text-left p-4">Description</th>
                  <th className="text-left p-4">Account</th>
                  <th className="text-left p-4">Receipt</th>
                  <th className="text-right p-4">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-4 whitespace-nowrap">{formatAuDate(r.date)}</td>
                    <td className="p-4">{r.description}</td>
                    <td className="p-4 font-mono text-xs">
                      {r.accountCode} {r.accountName ? `— ${r.accountName}` : ''}
                    </td>
                    <td className="p-4">
                      <ReceiptBadge
                        receiptIds={r.receiptIds}
                        onChange={(ids) =>
                          setRows((prev) =>
                            prev.map((row) =>
                              row.id === r.id ? { ...row, receiptIds: ids } : row
                            )
                          )
                        }
                      />
                    </td>
                    <td className="p-4 text-right font-medium">
                      ${Math.abs(r.amount).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
