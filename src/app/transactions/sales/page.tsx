'use client';

import AccountingGate from '@/components/AccountingGate';
import LedgerQuickEntry from '@/components/LedgerQuickEntry';

export default function Sales() {
  return (
    <AccountingGate
      section="Transactions"
      backHref="/transactions"
      backLabel="← Back to Transactions"
    >
      <LedgerQuickEntry
        title="💰 Sales & Revenue"
        subtitle="Till sales, settlements and other income — posts to the ledger as Revenue."
        entryType="Revenue"
        accentClass="bg-green-600 hover:bg-green-700"
      />
    </AccountingGate>
  );
}
