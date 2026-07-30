'use client';

import AccountingGate from '@/components/AccountingGate';
import LedgerQuickEntry from '@/components/LedgerQuickEntry';

export default function Expenses() {
  return (
    <AccountingGate
      section="Transactions"
      backHref="/transactions"
      backLabel="← Back to Transactions"
    >
      <LedgerQuickEntry
        title="📤 Expenses & Purchases"
        subtitle="Suppliers, wages, utilities and overheads — posts to the ledger as Expense."
        entryType="Expense"
        accentClass="bg-rose-600 hover:bg-rose-700"
      />
    </AccountingGate>
  );
}
