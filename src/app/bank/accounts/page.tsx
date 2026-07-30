'use client';

import { useState, useEffect } from 'react';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate, toIsoDateInput } from '@/lib/accounting/dates';

type BankAccount = {
  id: string;
  name: string;
  accountNumber: string;
  bsb: string;
  openingBalance: number;
  openingAsAt: string;
  type: string;
  currentBalance?: number;
};

export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [banksRes, txsRes] = await Promise.all([
        fetch('/api/bank-accounts'),
        fetch('/api/ledger/entries'),
      ]);
      const banks: BankAccount[] = await banksRes.json();
      const txs: Array<{ bankAccountId?: string; amount?: number }> = await txsRes.json();
      const withBalances = (Array.isArray(banks) ? banks : []).map((acc) => {
        const change = (Array.isArray(txs) ? txs : [])
          .filter((t) => t.bankAccountId === acc.id)
          .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        return {
          ...acc,
          currentBalance: (Number(acc.openingBalance) || 0) + change,
        };
      });
      setAccounts(withBalances);
    } catch {
      setStatus('Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateField = (id: string, field: keyof BankAccount, value: string | number) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  };

  const saveAccounts = async () => {
    setSaving(true);
    setStatus('');
    try {
      const payload = accounts.map(({ currentBalance, ...rest }) => rest);
      const res = await fetch('/api/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      setStatus('Saved opening balances — used on the Balance Sheet');
      setEditingId(null);
      await load();
    } catch {
      setStatus('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addAccount = () => {
    const id = `bank-${Date.now()}`;
    setAccounts((prev) => [
      ...prev,
      {
        id,
        name: 'New bank account',
        accountNumber: '',
        bsb: '',
        openingBalance: 0,
        openingAsAt: '2025-07-01',
        type: 'Cheque',
        currentBalance: 0,
      },
    ]);
    setEditingId(id);
  };

  return (
    <AccountingGate section="Bank">
      <div className="p-6 max-w-screen-2xl mx-auto">
        <div className="flex justify-between items-center mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold">Bank Accounts</h1>
            <p className="text-gray-600">
              Set opening balances (DD/MM/YYYY as-at). Current = opening + imported movements.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={addAccount}
              className="bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-2xl"
            >
              + Add Bank Account
            </button>
            <button
              type="button"
              onClick={saveAccounts}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-2xl"
            >
              {saving ? 'Saving…' : 'Save openings'}
            </button>
          </div>
        </div>

        {status && <p className="mb-4 text-sm text-gray-600">{status}</p>}

        {loading ? (
          <div className="py-16 text-center text-gray-500">Loading…</div>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-5 font-medium">Account Name</th>
                  <th className="text-left p-5 font-medium">Account Number</th>
                  <th className="text-left p-5 font-medium">BSB</th>
                  <th className="text-right p-5 font-medium">Opening Balance</th>
                  <th className="text-left p-5 font-medium">Opening as at</th>
                  <th className="text-right p-5 font-medium">Current Balance</th>
                  <th className="text-center p-5 font-medium">Type</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => {
                  const editing = editingId === acc.id;
                  return (
                    <tr key={acc.id} className="border-t hover:bg-gray-50">
                      <td className="p-5 font-medium">
                        {editing ? (
                          <input
                            className="border rounded-lg px-2 py-1 w-full"
                            value={acc.name}
                            onChange={(e) => updateField(acc.id, 'name', e.target.value)}
                          />
                        ) : (
                          acc.name
                        )}
                      </td>
                      <td className="p-5">
                        {editing ? (
                          <input
                            className="border rounded-lg px-2 py-1 w-full"
                            value={acc.accountNumber}
                            onChange={(e) =>
                              updateField(acc.id, 'accountNumber', e.target.value)
                            }
                          />
                        ) : (
                          acc.accountNumber
                        )}
                      </td>
                      <td className="p-5">
                        {editing ? (
                          <input
                            className="border rounded-lg px-2 py-1 w-full"
                            value={acc.bsb}
                            onChange={(e) => updateField(acc.id, 'bsb', e.target.value)}
                          />
                        ) : (
                          acc.bsb || '—'
                        )}
                      </td>
                      <td className="p-5 text-right">
                        {editing ? (
                          <input
                            type="number"
                            step="0.01"
                            className="border rounded-lg px-2 py-1 w-32 text-right"
                            value={acc.openingBalance}
                            onChange={(e) =>
                              updateField(
                                acc.id,
                                'openingBalance',
                                parseFloat(e.target.value) || 0
                              )
                            }
                          />
                        ) : (
                          `$${acc.openingBalance.toLocaleString('en-AU')}`
                        )}
                      </td>
                      <td className="p-5">
                        {editing ? (
                          <input
                            type="date"
                            className="border rounded-lg px-2 py-1"
                            value={toIsoDateInput(acc.openingAsAt)}
                            onChange={(e) =>
                              updateField(acc.id, 'openingAsAt', e.target.value)
                            }
                          />
                        ) : (
                          formatAuDate(acc.openingAsAt)
                        )}
                      </td>
                      <td className="p-5 text-right font-semibold text-lg">
                        ${(acc.currentBalance ?? acc.openingBalance).toLocaleString('en-AU')}
                      </td>
                      <td className="p-5 text-center">
                        {editing ? (
                          <select
                            className="border rounded-lg px-2 py-1"
                            value={acc.type}
                            onChange={(e) => updateField(acc.id, 'type', e.target.value)}
                          >
                            <option value="Cheque">Cheque</option>
                            <option value="Savings">Savings</option>
                            <option value="Credit Card">Credit Card</option>
                          </select>
                        ) : (
                          acc.type
                        )}
                      </td>
                      <td className="p-5 text-center">
                        <button
                          type="button"
                          className="text-blue-600 font-medium"
                          onClick={() => setEditingId(editing ? null : acc.id)}
                        >
                          {editing ? 'Done' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AccountingGate>
  );
}
