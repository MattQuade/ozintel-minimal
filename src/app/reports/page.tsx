'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';

type Summary = {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalTransactions: number;
};

export default function ReportsPage() {
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
    <AccountingGate section="Reports">
    <div className="p-8 max-w-screen-2xl mx-auto">
      <h1 className="text-4xl font-bold mb-10">Reports</h1>

      {loading ? (
        <div className="text-center py-20">Loading reports...</div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="bg-white rounded-3xl p-8 shadow-sm">
            <p className="text-gray-500">Total Revenue</p>
            <p className="text-4xl font-semibold text-green-600 mt-4">
              ${summary.totalRevenue.toLocaleString('en-AU')}
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-sm">
            <p className="text-gray-500">Total Expenses</p>
            <p className="text-4xl font-semibold text-red-600 mt-4">
              ${summary.totalExpenses.toLocaleString('en-AU')}
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-sm">
            <p className="text-gray-500">Net Profit</p>
            <p className={`text-4xl font-semibold mt-4 ${summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${summary.netProfit.toLocaleString('en-AU')}
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-sm">
            <p className="text-gray-500">Total Transactions</p>
            <p className="text-4xl font-semibold text-gray-900 mt-4">
              {summary.totalTransactions}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            href="/reports/profit-loss"
            className="bg-white rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow block"
          >
            <h2 className="text-2xl font-semibold mb-2">Profit &amp; Loss</h2>
            <p className="text-gray-500">
              Revenue, COGS and expenses from your ledger for the selected period.
            </p>
          </Link>
          <Link
            href="/reports/balance-sheet"
            className="bg-white rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow block"
          >
            <h2 className="text-2xl font-semibold mb-2">Balance Sheet</h2>
            <p className="text-gray-500">
              Assets, liabilities and equity as at a chosen date, including openings and earnings.
            </p>
          </Link>
          <Link
            href="/reports/bas"
            className="bg-white rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow block"
          >
            <h2 className="text-2xl font-semibold mb-2">BAS / GST</h2>
            <p className="text-gray-500">
              Accrual Activity Statement: 1A, 1B, G1–G11, W1/W2 from posted pay
              runs. Lock the quarter before you copy figures into ATO Online.
            </p>
          </Link>
        </div>
        </>
      )}
    </div>
    </AccountingGate>
  );
}