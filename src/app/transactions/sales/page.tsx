'use client';

import AccountingGate from '@/components/AccountingGate';

export default function Sales() {
  return (
    <AccountingGate section="Transactions">
      <div className="p-10">
        <h1 className="text-4xl font-bold mb-6">💰 Sales Transactions</h1>
        <p className="text-xl text-gray-600">
          Till sales, invoices, and customer payments will go here.
        </p>
      </div>
    </AccountingGate>
  );
}
