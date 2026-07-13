'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Summary = {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalTransactions: number;
};

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary>({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    totalTransactions: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ledger/summary')
      .then(res => res.json())
      .then(data => {
        setSummary(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-4">
          <div className="text-5xl">🍺</div>
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Grok Pub</h1>
            <p className="text-lg text-gray-600">Wagga Wagga Hotel • Accounting System</p>
          </div>
        </div>

        <button 
          onClick={() => {
            if (confirm('Reset entire ledger and start fresh?')) {
              fetch('/api/ledger/reset', { method: 'POST' })
                .then(() => window.location.reload());
            }
          }}
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-medium text-sm"
        >
          🗑️ Reset Ledger
        </button>
      </div>

      {/* Summary Cards - Smaller & Tighter */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <p className="text-gray-500 text-sm">Total Revenue</p>
          <p className="text-3xl font-semibold text-green-600 mt-2">
            ${summary.totalRevenue.toLocaleString('en-AU')}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <p className="text-gray-500 text-sm">Total Expenses</p>
          <p className="text-3xl font-semibold text-red-600 mt-2">
            ${summary.totalExpenses.toLocaleString('en-AU')}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <p className="text-gray-500 text-sm">Net Profit</p>
          <p className={`text-3xl font-semibold mt-2 ${summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${summary.netProfit.toLocaleString('en-AU')}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <p className="text-gray-500 text-sm">Transactions</p>
          <p className="text-3xl font-semibold text-gray-900 mt-2">
            {summary.totalTransactions}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-2xl font-semibold mb-5">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/transactions/import" 
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl p-6 flex items-center gap-4 transition-all">
            <div className="text-4xl">📥</div>
            <div>
              <div className="font-semibold">Import Bank Statement</div>
              <div className="text-blue-100 text-sm">ANZ CSV • Auto classify</div>
            </div>
          </Link>

          <Link href="/journal" 
            className="bg-gray-900 hover:bg-black text-white rounded-2xl p-6 flex items-center gap-4 transition-all">
            <div className="text-4xl">📖</div>
            <div>
              <div className="font-semibold">New Journal Entry</div>
              <div className="text-gray-400 text-sm">Manual double-entry</div>
            </div>
          </Link>

          <Link href="/reports" 
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl p-6 flex items-center gap-4 transition-all">
            <div className="text-4xl">📊</div>
            <div>
              <div className="font-semibold">View Reports</div>
              <div className="text-emerald-100 text-sm">P&amp;L • BAS • Balance Sheet</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}