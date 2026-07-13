'use client';

import Link from 'next/link';

export default function Transactions() {
  return (
    <div className="p-10">
      <h1 className="text-4xl font-bold mb-2">📋 Transactions</h1>
      <p className="text-gray-600 mb-10">All financial movements • Double-entry system</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link href="/transactions/sales" 
          className="bg-white p-8 rounded-3xl shadow hover:shadow-xl transition-all group">
          <div className="text-4xl mb-4">💰</div>
          <h3 className="text-2xl font-semibold group-hover:text-blue-600">Sales</h3>
          <p className="text-gray-500 mt-2">Invoices, receipts, till sales</p>
        </Link>

        <Link href="/transactions/purchases" 
          className="bg-white p-8 rounded-3xl shadow hover:shadow-xl transition-all group">
          <div className="text-4xl mb-4">🛒</div>
          <h3 className="text-2xl font-semibold group-hover:text-blue-600">Purchases</h3>
          <p className="text-gray-500 mt-2">Supplier invoices &amp; payments</p>
        </Link>

        <Link href="/transactions/expenses" 
          className="bg-white p-8 rounded-3xl shadow hover:shadow-xl transition-all group">
          <div className="text-4xl mb-4">📤</div>
          <h3 className="text-2xl font-semibold group-hover:text-blue-600">Expenses</h3>
          <p className="text-gray-500 mt-2">Petty cash, wages, overheads</p>
        </Link>

        <Link href="/transactions/journal" 
          className="bg-white p-8 rounded-3xl shadow hover:shadow-xl transition-all group">
          <div className="text-4xl mb-4">📖</div>
          <h3 className="text-2xl font-semibold group-hover:text-blue-600">General Journal</h3>
          <p className="text-gray-500 mt-2">Adjustments &amp; manual entries</p>
        </Link>
      </div>
    </div>
  );
}