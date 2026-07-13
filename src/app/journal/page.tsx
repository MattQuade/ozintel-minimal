'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const periods = [
  { label: 'Full Year FY25/26', value: 'full' },
  { label: 'Q1 Jul-Sep 2025', value: 'q1' },
  { label: 'Q2 Oct-Dec 2025', value: 'q2' },
  { label: 'Q3 Jan-Mar 2026', value: 'q3' },
  { label: 'Q4 Apr-Jun 2026', value: 'q4' },
];

const coaOptions = [
  "1000 - Cash at Bank",
  "1001 - Cash Float / Till",
  "1100 - Accounts Receivable",
  "1200 - Inventory - Stock & Bottles",
  "1300 - Prepaid Expenses",
  "2000 - Accounts Payable",
  "2100 - GST Payable",
  "2200 - PAYG Withholding Payable",
  "2300 - Credit Card Liability",
  "3000 - Owner's Equity / Capital",
  "3100 - Retained Earnings",
  "4000 - Bar Sales",
  "4004 - Bottle Shop Sales",
  "4005 - Wholesale & Functions",
  "4010 - Accommodation Revenue",
  "4100 - Other Revenue",
  "5000 - Cost of Goods Sold",
  "5005 - Groceries & Kitchen Supplies",
  "5010 - Wages & Salaries",
  "5020 - Utilities & Rent",
  "5030 - Marketing & Advertising",
  "5040 - Repairs & Maintenance",
  "5050 - Fuel & Vehicle Costs",
  "6000 - Depreciation",
  "9999 - Uncategorized"
];

type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'Revenue' | 'Expense';
  account?: string;
};

export default function JournalPage() {
  const [activePeriod, setActivePeriod] = useState('full');
  const [searchTerm, setSearchTerm] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const loadTransactions = async () => {
    const res = await fetch('/api/ledger/entries');
    const data = await res.json();
    setTransactions(data);
    setLoading(false);
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const filtered = transactions
    .filter(tx => {
      const matchesSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase());
      if (activePeriod === 'full') return matchesSearch;

      const d = new Date(tx.date);
      const m = d.getMonth() + 1;
      if (activePeriod === 'q1') return m >= 7 && m <= 9 && matchesSearch;
      if (activePeriod === 'q2') return m >= 10 && m <= 12 && matchesSearch;
      if (activePeriod === 'q3') return m >= 1 && m <= 3 && matchesSearch;
      if (activePeriod === 'q4') return m >= 4 && m <= 6 && matchesSearch;
      return matchesSearch;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    await fetch('/api/ledger/delete', { 
      method: 'POST', 
      body: JSON.stringify({ id }), 
      headers: {'Content-Type': 'application/json'} 
    });
    loadTransactions();
  };

  const handleEditSave = async () => {
    if (!editingTx) return;
    await fetch('/api/ledger/update', { 
      method: 'POST', 
      body: JSON.stringify(editingTx), 
      headers: {'Content-Type': 'application/json'} 
    });
    setEditingTx(null);
    loadTransactions();
  };

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold">Journal Entries</h1>
          <p className="text-gray-600">Double-entry bookkeeping • {transactions.length} total</p>
        </div>
        <Link href="/journal/new" className="bg-blue-600 text-white px-6 py-3 rounded-2xl hover:bg-blue-700 flex items-center gap-2">
          + New Entry
        </Link>
      </div>

      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search by description..."
        className="w-full max-w-2xl mb-8 bg-white border border-gray-300 rounded-2xl px-5 py-3 focus:outline-none focus:border-blue-500"
      />

      <div className="flex gap-2 mb-8 overflow-x-auto pb-3">
        {periods.map(p => (
          <button
            key={p.value}
            onClick={() => setActivePeriod(p.value)}
            className={`px-6 py-3 rounded-2xl text-sm font-medium whitespace-nowrap transition-all ${
              activePeriod === p.value ? 'bg-blue-600 text-white' : 'bg-white border hover:border-gray-400'
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
                <th className="text-right p-5 font-medium">Amount</th>
                <th className="text-center p-5 font-medium">Type</th>
                <th className="w-40 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => (
                <tr key={tx.id} className="border-t hover:bg-gray-50">
                  <td className="p-5">{tx.date}</td>
                  <td className="p-5">{tx.description}</td>
                  <td className="p-5 text-right font-medium">${Math.abs(tx.amount).toFixed(2)}</td>
                  <td className="p-5 text-center">
                    <span className={`px-4 py-1 rounded-full text-xs font-medium ${tx.type === 'Revenue' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="p-5 text-center space-x-4">
                    <button onClick={() => setEditingTx(tx)} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onClick={() => handleDelete(tx.id)} className="text-red-600 hover:text-red-800 font-medium">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal with Full COA */}
      {editingTx && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 w-full max-w-lg">
            <h2 className="text-2xl font-bold mb-6">Edit Transaction</h2>

            <input 
              type="date" 
              value={editingTx.date} 
              onChange={e => setEditingTx({...editingTx, date: e.target.value})} 
              className="w-full border rounded-xl p-3 mb-4" 
            />

            <select 
              value={editingTx.account || ''} 
              onChange={e => setEditingTx({...editingTx, account: e.target.value})}
              className="w-full border rounded-xl p-3 mb-4 text-base"
            >
              <option value="">Select account</option>
              {coaOptions.map(acc => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>

            <input 
              type="text" 
              value={editingTx.description} 
              onChange={e => setEditingTx({...editingTx, description: e.target.value})} 
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
                  onChange={e => setEditingTx({...editingTx, amount: parseFloat(e.target.value)||0})} 
                  className="w-full border rounded-xl p-3" 
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Type</label>
                <select 
                  value={editingTx.type} 
                  onChange={e => setEditingTx({...editingTx, type: e.target.value as 'Revenue'|'Expense'})} 
                  className="w-full border rounded-xl p-3"
                >
                  <option value="Revenue">Revenue</option>
                  <option value="Expense">Expense</option>
                </select>
              </div>
            </div>

            <div className="flex gap-4">
              <button onClick={handleEditSave} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-medium">Save Changes</button>
              <button onClick={() => setEditingTx(null)} className="flex-1 border py-4 rounded-2xl">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}