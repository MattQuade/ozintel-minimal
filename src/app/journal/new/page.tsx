'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const coaOptions = [
  "1000 - Cash at Bank",
  "1100 - Accounts Receivable",
  "1200 - Inventory",
  "2000 - Accounts Payable",
  "2100 - GST Payable",
  "2200 - PAYG Withholding",
  "3000 - Owner's Equity",
  "4000 - Bar Sales",
  "4004 - Bottle Shop Sales",
  "4005 - Wholesale Sales",
  "5000 - Cost of Goods Sold",
  "5005 - Groceries & Supplies",
  "5010 - Wages & Salaries",
  "5020 - Utilities & Rent",
];

type LineItem = {
  id: string;
  account: string;
  description: string;
  debit: number;
  credit: number;
  hasGST: boolean;
};

export default function NewJournalEntry() {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<LineItem[]>([
    { id: '1', account: '', description: '', debit: 0, credit: 0, hasGST: false },
  ]);

  const addLine = () => {
    setLines([...lines, { id: Date.now().toString(), account: '', description: '', debit: 0, credit: 0, hasGST: false }]);
  };

  const updateLine = (id: string, field: keyof LineItem, value: any) => {
    setLines(lines.map(line => 
      line.id === id ? { ...line, [field]: value } : line
    ));
  };

  const deleteLine = (id: string) => {
    if (lines.length > 1) {
      setLines(lines.filter(line => line.id !== id));
    }
  };

  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);

  const handleSave = async () => {
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      alert("⚠️ Debit and Credit totals must balance!");
      return;
    }

    const entries = lines
      .filter(line => line.debit > 0 || line.credit > 0)
      .map(line => ({
        id: 'manual-' + Date.now() + '-' + line.id,
        date,
        description: line.description || reference,
        amount: line.debit > 0 ? line.debit : -line.credit,
        type: line.debit > 0 ? 'Expense' : 'Revenue',
        account: line.account,
        hasGST: line.hasGST,
        timestamp: new Date().toISOString(),
      }));

    try {
      await fetch('/api/ledger/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries })
      });

      alert('✅ Journal entry saved successfully');
      router.push('/journal');
    } catch (err) {
      alert('❌ Failed to save entry');
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">New Journal Entry</h1>

      <div className="bg-white rounded-3xl p-8 shadow-sm">
        {/* Header */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div>
            <label className="block text-sm mb-2">Date</label>
            <input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded-xl p-3"
            />
          </div>
          <div>
            <label className="block text-sm mb-2">Reference</label>
            <input 
              type="text" 
              value={reference} 
              onChange={(e) => setReference(e.target.value)}
              placeholder="Card ending 9001"
              className="w-full border rounded-xl p-3"
            />
          </div>
          <div className="flex items-end">
            <button className="bg-gray-100 hover:bg-gray-200 px-8 py-3 rounded-xl flex items-center gap-2 w-full justify-center">
              📸 Photo Receipt
            </button>
          </div>
        </div>

        {/* Double-Entry Table */}
        <table className="w-full mb-6">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-medium">Account</th>
              <th className="text-left p-3 font-medium">Description</th>
              <th className="text-right p-3 font-medium">Debit</th>
              <th className="text-right p-3 font-medium">Credit</th>
              <th className="text-center p-3 font-medium w-24">GST</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b">
                <td className="p-3">
                  <select 
                    value={line.account} 
                    onChange={(e) => updateLine(line.id, 'account', e.target.value)}
                    className="w-full border rounded-lg p-2"
                  >
                    <option value="">Select account</option>
                    {coaOptions.map(acc => (
                      <option key={acc} value={acc}>{acc}</option>
                    ))}
                  </select>
                </td>
                <td className="p-3">
                  <input 
                    type="text" 
                    value={line.description} 
                    onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                    placeholder="Description"
                    className="w-full border rounded-lg p-2"
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="number" 
                    step="0.01"
                    value={line.debit} 
                    onChange={(e) => updateLine(line.id, 'debit', parseFloat(e.target.value) || 0)}
                    className="w-full border rounded-lg p-2 text-right"
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="number" 
                    step="0.01"
                    value={line.credit} 
                    onChange={(e) => updateLine(line.id, 'credit', parseFloat(e.target.value) || 0)}
                    className="w-full border rounded-lg p-2 text-right"
                  />
                </td>
                <td className="p-3 text-center">
                  <input 
                    type="checkbox" 
                    checked={line.hasGST} 
                    onChange={(e) => updateLine(line.id, 'hasGST', e.target.checked)}
                  />
                </td>
                <td className="p-3">
                  <button onClick={() => deleteLine(line.id)} className="text-red-500 hover:text-red-700">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-center mb-8">
          <button onClick={addLine} className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
            + Add line
          </button>
          <div className="text-right font-medium">
            Total Debit: ${totalDebit.toFixed(2)} &nbsp;&nbsp;&nbsp; 
            Total Credit: ${totalCredit.toFixed(2)}
          </div>
        </div>

        <div className="flex gap-4">
          <button 
            onClick={handleSave}
            className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-medium hover:bg-blue-700"
          >
            Save Entry
          </button>
          <button 
            onClick={() => router.back()}
            className="flex-1 border py-4 rounded-2xl font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

