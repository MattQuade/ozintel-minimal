'use client';

import { useState, useEffect } from 'react';

type BankAccount = {
  id: string;
  name: string;
  accountNumber: string;
  bsb: string;
  openingBalance: number;
  currentBalance: number;
  type: string;
};

export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([
    {
      id: '1',
      name: 'NAB Credit Card',
      accountNumber: 'NAB-CC-XXXX',
      bsb: '',
      openingBalance: 0,
      currentBalance: 0,
      type: 'Credit Card'
    },
    {
      id: '2',
      name: 'NAB Business Account',
      accountNumber: 'NAB-BIZ-XXXX',
      bsb: '084-XXX',
      openingBalance: 0,
      currentBalance: 0,
      type: 'Cheque'
    },
    {
      id: '3',
      name: 'ANZ Business Account',
      accountNumber: 'ANZ-BIZ-XXXX',
      bsb: '013-XXX',
      openingBalance: 0,
      currentBalance: 0,
      type: 'Cheque'
    }
  ]);

  useEffect(() => {
    fetch('/api/ledger/entries')
      .then(res => res.json())
      .then((txs: any[]) => {
        const updated = accounts.map(acc => {
          const accountTxs = txs.filter(t => t.bankAccountId === acc.id);
          const balanceChange = accountTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
          return {
            ...acc,
            currentBalance: acc.openingBalance + balanceChange
          };
        });
        setAccounts(updated);
      });
  }, []);

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold">Bank Accounts</h1>
          <p className="text-gray-600">Live balances from imported transactions</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl">
          + Add Bank Account
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-5 font-medium">Account Name</th>
              <th className="text-left p-5 font-medium">Account Number</th>
              <th className="text-left p-5 font-medium">BSB</th>
              <th className="text-right p-5 font-medium">Opening Balance</th>
              <th className="text-right p-5 font-medium">Current Balance</th>
              <th className="text-center p-5 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(acc => (
              <tr key={acc.id} className="border-t hover:bg-gray-50">
                <td className="p-5 font-medium">{acc.name}</td>
                <td className="p-5">{acc.accountNumber}</td>
                <td className="p-5">{acc.bsb}</td>
                <td className="p-5 text-right">${acc.openingBalance.toLocaleString('en-AU')}</td>
                <td className="p-5 text-right font-semibold text-lg">${acc.currentBalance.toLocaleString('en-AU')}</td>
                <td className="p-5 text-center">{acc.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}