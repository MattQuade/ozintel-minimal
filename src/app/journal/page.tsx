'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate, parseFlexibleDate, toIsoDateInput } from '@/lib/accounting/dates';

const periods = [
  { label: 'Full Year FY25/26', value: 'full' },
  { label: 'Q1 Jul-Sep 2025', value: 'q1' },
  { label: 'Q2 Oct-Dec 2025', value: 'q2' },
  { label: 'Q3 Jan-Mar 2026', value: 'q3' },
  { label: 'Q4 Apr-Jun 2026', value: 'q4' },
];

type CoaOption = { code: string; name: string; type: string };

type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: string;
  account?: string;
  accountCode?: string;
  accountName?: string;
  reconciled?: boolean;
};

export default function JournalPage() {
  const [activePeriod, setActivePeriod] = useState('full');
  const [searchTerm, setSearchTerm] = useState('');
  const [reconFilter, setReconFilter] = useState<'all' | 'open' | 'done'>('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [coa, setCoa] = useState<CoaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  const loadTransactions = async () => {
    const [ledRes, coaRes] = await Promise.all([
      fetch('/api/ledger/entries'),
      fetch('/api/coa'),
    ]);
    const data = await ledRes.json();
    const accounts = await coaRes.json();
    setTransactions(Array.isArray(data) ? data : []);
    setCoa(Array.isArray(accounts) ? accounts : []);
    setLoading(false);
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const filtered = transactions
    .filter((tx) => {
      const matchesSearch = (tx.description || '')
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      if (reconFilter === 'open' && tx.reconciled) return false;
      if (reconFilter === 'done' && !tx.reconciled) return false;
      if (activePeriod === 'full') return matchesSearch;

      const d = parseFlexibleDate(tx.date);
      if (!d) return matchesSearch;
      const m = d.getMonth() + 1;
      if (activePeriod === 'q1') return m >= 7 && m <= 9 && matchesSearch;
      if (activePeriod === 'q2') return m >= 10 && m <= 12 && matchesSearch;
      if (activePeriod === 'q3') return m >= 1 && m <= 3 && matchesSearch;
      if (activePeriod === 'q4') return m >= 4 && m <= 6 && matchesSearch;
      return matchesSearch;
    })
    .sort((a, b) => {
      const da = parseFlexibleDate(a.date)?.getTime() || 0;
      const db = parseFlexibleDate(b.date)?.getTime() || 0;
      return db - da;
    });

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    const res = await fetch('/api/ledger/delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to delete entry');
      return;
    }
    loadTransactions();
  };

  const toggleReconciled = async (tx: Transaction) => {
    const next = !tx.reconciled;
    const res = await fetch('/api/ledger/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tx.id, reconciled: next }),
    });
    if (!res.ok) {
      alert('Failed to update reconciliation');
      return;
    }
    setTransactions((prev) =>
      prev.map((t) => (t.id === tx.id ? { ...t, reconciled: next } : t))
    );
  };

  const handleEditSave = async () => {
    if (!editingTx) return;
    const acc = coa.find((a) => a.code === editingTx.accountCode);
    const payload = {
      ...editingTx,
      accountName: acc?.name || editingTx.accountName,
      account: acc
        ? `${acc.code} - ${acc.name}`
        : editingTx.account || editingTx.accountCode,
    };
    const res = await fetch('/api/ledger/update', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to update entry');
      return;
    }
    setEditingTx(null);
    loadTransactions();
  };

  const handleClearAll = async () => {
    if (!filtered.length) {
      alert('There are no visible journal transactions to clear.');
      return;
    }
    if (
      !confirm(
        `Clear all ${filtered.length} visible journal transactions on this page? Hidden entries outside the current filters will be kept.`
      )
    ) {
      return;
    }
    setClearingAll(true);
    // #region agent log
    fetch('http://127.0.0.1:7620/ingest/58ed654d-f6dd-4cb2-bdd8-01209344e92b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d182b0'},body:JSON.stringify({sessionId:'d182b0',runId:'journal-clear-all',hypothesisId:'H1',location:'journal/page.tsx:handleClearAll',message:'clear all requested',data:{transactionCount:transactions.length,filteredCount:filtered.length,period:activePeriod,reconFilter,searchTermLength:searchTerm.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    try {
      const results = await Promise.all(
        filtered.map(async (tx) => {
          const res = await fetch('/api/ledger/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: tx.id }),
          });
          return { id: tx.id, ok: res.ok };
        })
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        throw new Error(`Failed to clear ${failed.length} journal transactions`);
      }
      // #region agent log
      fetch('http://127.0.0.1:7620/ingest/58ed654d-f6dd-4cb2-bdd8-01209344e92b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d182b0'},body:JSON.stringify({sessionId:'d182b0',runId:'journal-clear-all',hypothesisId:'H2',location:'journal/page.tsx:handleClearAll',message:'clear all succeeded',data:{deletedCount:filtered.length,remainingCount:transactions.length-filtered.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const visibleIds = new Set(filtered.map((tx) => tx.id));
      setTransactions((prev) => prev.filter((tx) => !visibleIds.has(tx.id)));
      setEditingTx(null);
      alert(`Cleared ${filtered.length} visible journal transactions.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to clear all transactions');
    } finally {
      setClearingAll(false);
    }
  };

  const openCount = transactions.filter((t) => !t.reconciled).length;

  return (
    <AccountingGate section="Journal">
      <div className="p-6 max-w-screen-2xl mx-auto">
        <div className="flex justify-between items-center mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold">Journal Entries</h1>
            <p className="text-gray-600">
              {transactions.length} total • {openCount} unreconciled
              {loading ? ' • loading…' : ''}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearingAll || loading || filtered.length === 0}
              className="border border-red-300 text-red-700 px-6 py-3 rounded-2xl hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {clearingAll ? 'Clearing…' : 'Clear All'}
            </button>
            <Link
              href="/journal/new"
              className="bg-blue-600 text-white px-6 py-3 rounded-2xl hover:bg-blue-700"
            >
              + New Entry
            </Link>
          </div>
        </div>

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by description..."
          className="w-full max-w-2xl mb-4 bg-white border border-gray-300 rounded-2xl px-5 py-3"
        />

        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            { id: 'all', label: 'All' },
            { id: 'open', label: 'Unreconciled' },
            { id: 'done', label: 'Reconciled' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setReconFilter(f.id as typeof reconFilter)}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${
                reconFilter === f.id
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border hover:border-gray-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-8 overflow-x-auto pb-3">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setActivePeriod(p.value)}
              className={`px-6 py-3 rounded-2xl text-sm font-medium whitespace-nowrap transition-all ${
                activePeriod === p.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border hover:border-gray-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
          <div className="p-6 border-b bg-gray-50">
            <h3 className="font-semibold text-lg">{filtered.length} Entries</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-5 font-medium">Date</th>
                  <th className="text-left p-5 font-medium">Description</th>
                  <th className="text-left p-5 font-medium">Account</th>
                  <th className="text-right p-5 font-medium">Amount</th>
                  <th className="text-center p-5 font-medium">Type</th>
                  <th className="text-center p-5 font-medium">Reconciled</th>
                  <th className="w-40 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => (
                  <tr key={tx.id} className="border-t hover:bg-gray-50">
                    <td className="p-5 whitespace-nowrap">{formatAuDate(tx.date)}</td>
                    <td className="p-5">{tx.description}</td>
                    <td className="p-5 text-sm font-mono">
                      {tx.accountCode || '—'}
                      {tx.accountName ? ` — ${tx.accountName}` : ''}
                    </td>
                    <td className="p-5 text-right font-medium">
                      ${Math.abs(tx.amount).toFixed(2)}
                    </td>
                    <td className="p-5 text-center">
                      <span
                        className={`px-4 py-1 rounded-full text-xs font-medium ${
                          tx.type === 'Revenue'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="p-5 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(tx.reconciled)}
                        onChange={() => toggleReconciled(tx)}
                        className="w-5 h-5"
                        title="Mark reconciled to bank statement"
                      />
                    </td>
                    <td className="p-5 text-center space-x-4">
                      <button
                        onClick={() => setEditingTx(tx)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(tx.id)}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {editingTx && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-8 w-full max-w-lg">
              <h2 className="text-2xl font-bold mb-6">Edit Transaction</h2>

              <input
                type="date"
                value={toIsoDateInput(editingTx.date)}
                onChange={(e) => setEditingTx({ ...editingTx, date: e.target.value })}
                className="w-full border rounded-xl p-3 mb-4"
              />

              <select
                value={editingTx.accountCode || ''}
                onChange={(e) => {
                  const code = e.target.value;
                  const acc = coa.find((a) => a.code === code);
                  setEditingTx({
                    ...editingTx,
                    accountCode: code,
                    accountName: acc?.name || '',
                    type: acc?.type || editingTx.type,
                  });
                }}
                className="w-full border rounded-xl p-3 mb-4 text-base"
              >
                <option value="">Select account</option>
                {coa.map((acc) => (
                  <option key={acc.code} value={acc.code}>
                    {acc.code} — {acc.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={editingTx.description}
                onChange={(e) =>
                  setEditingTx({ ...editingTx, description: e.target.value })
                }
                className="w-full border rounded-xl p-3 mb-4"
                placeholder="Description"
              />

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={Math.abs(editingTx.amount)}
                    onChange={(e) =>
                      setEditingTx({
                        ...editingTx,
                        amount: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full border rounded-xl p-3"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Type</label>
                  <select
                    value={editingTx.type}
                    onChange={(e) =>
                      setEditingTx({ ...editingTx, type: e.target.value })
                    }
                    className="w-full border rounded-xl p-3"
                  >
                    <option value="Revenue">Revenue</option>
                    <option value="Expense">Expense</option>
                    <option value="Asset">Asset</option>
                    <option value="Liability">Liability</option>
                    <option value="Equity">Equity</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 mb-6">
                <input
                  type="checkbox"
                  checked={Boolean(editingTx.reconciled)}
                  onChange={(e) =>
                    setEditingTx({ ...editingTx, reconciled: e.target.checked })
                  }
                  className="w-5 h-5"
                />
                Reconciled to bank statement
              </label>

              <div className="flex gap-4">
                <button
                  onClick={handleEditSave}
                  className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-medium"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setEditingTx(null)}
                  className="flex-1 border py-4 rounded-2xl"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AccountingGate>
  );
}
