'use client';

import { useState, useEffect } from 'react';

type COAAccount = {
  code: string;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  isBank?: boolean;
  noGST?: boolean;
};

const defaultCOA: COAAccount[] = [
  { code: "1000", name: "Cash at Bank", type: "Asset", isBank: true, noGST: true },
  { code: "1001", name: "Cash Float / Till", type: "Asset", isBank: true },
  { code: "1100", name: "Accounts Receivable", type: "Asset" },
  { code: "1200", name: "Inventory - Stock & Bottles", type: "Asset" },
  { code: "2000", name: "Accounts Payable", type: "Liability" },
  { code: "2100", name: "GST Payable", type: "Liability", noGST: true },
  { code: "2200", name: "PAYG Withholding", type: "Liability" },
  { code: "2300", name: "Credit Card Liability", type: "Liability", isBank: true },
  { code: "3000", name: "Owner's Equity / Capital", type: "Equity" },
  { code: "3100", name: "Retained Earnings", type: "Equity" },
  { code: "4000", name: "Bar Sales", type: "Revenue" },
  { code: "4004", name: "Bottle Shop Sales", type: "Revenue" },
  { code: "4005", name: "Wholesale & Functions", type: "Revenue" },
  { code: "4010", name: "Accommodation Revenue", type: "Revenue" },
  { code: "5000", name: "Cost of Goods Sold", type: "Expense" },
  { code: "5005", name: "Groceries & Kitchen Supplies", type: "Expense", noGST: true },
  { code: "5010", name: "Wages & Salaries", type: "Expense" },
  { code: "5020", name: "Utilities & Rent", type: "Expense" },
  { code: "6000", name: "Depreciation", type: "Expense" },
  { code: "9999", name: "Uncategorized", type: "Expense" },
];

export default function COAPage() {
  const [accounts, setAccounts] = useState<COAAccount[]>([]);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editData, setEditData] = useState<COAAccount | null>(null);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('coaAccounts');
    setAccounts(saved ? JSON.parse(saved) : defaultCOA);
  }, []);

  const saveToStorage = (newAccounts: COAAccount[]) => {
    localStorage.setItem('coaAccounts', JSON.stringify(newAccounts));
    setAccounts(newAccounts);
  };

  const startEdit = (acc: COAAccount) => {
    setEditingCode(acc.code);
    setEditData({ ...acc });
  };

  const saveEdit = () => {
    if (!editData || !editingCode) return;

    const updated = accounts.map(acc => 
      acc.code === editingCode ? editData : acc
    );

    saveToStorage(updated);
    setEditingCode(null);
    setEditData(null);
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setEditData(null);
  };

  const updateEditField = (field: keyof COAAccount, value: any) => {
    if (!editData) return;
    setEditData({ ...editData, [field]: value });
  };

  const toggleCheckbox = (code: string, field: 'isBank' | 'noGST') => {
    const updated = accounts.map(acc => 
      acc.code === code ? { ...acc, [field]: !acc[field] } : acc
    );
    saveToStorage(updated);
  };

  const deleteAccount = (code: string) => {
    if (!confirm('Delete this account?')) return;
    const updated = accounts.filter(a => a.code !== code);
    saveToStorage(updated);
  };

  const grouped = accounts.reduce((acc, curr) => {
    if (!acc[curr.type]) acc[curr.type] = [];
    acc[curr.type].push(curr);
    return acc;
  }, {} as Record<string, COAAccount[]>);

  const typeOrder = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

  return (
    <div className="p-8 max-w-screen-2xl mx-auto">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-4xl font-bold">Chart of Accounts</h1>
          <p className="text-gray-600">Click ✏️ to edit • Changes saved automatically</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl">
          + Add Account
        </button>
      </div>

      {typeOrder.map(type => {
        const items = grouped[type] || [];
        if (items.length === 0) return null;

        return (
          <div key={type} className="mb-12">
            <h2 className="text-xl font-semibold uppercase tracking-widest text-gray-500 mb-4">{type}</h2>
            
            <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-5 w-28">Code</th>
                    <th className="text-left p-5">Name</th>
                    <th className="text-center p-5 w-40">Type</th>
                    <th className="text-center p-5 w-28">Bank?</th>
                    <th className="text-center p-5 w-28">No GST?</th>
                    <th className="w-32"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((acc) => (
                    <tr key={acc.code} className="hover:bg-gray-50">
                      <td className="p-5 font-mono font-medium">{acc.code}</td>
                      <td className="p-5 font-medium">
                        {editingCode === acc.code ? (
                          <input 
                            type="text" 
                            value={editData?.name || ''} 
                            onChange={(e) => updateEditField('name', e.target.value)}
                            className="w-full border rounded-lg p-3"
                          />
                        ) : acc.name}
                      </td>
                      <td className="p-5 text-center">
                        {editingCode === acc.code ? (
                          <select 
                            value={editData?.type || ''} 
                            onChange={(e) => updateEditField('type', e.target.value)}
                            className="border rounded-lg p-3 w-full"
                          >
                            <option value="Asset">Asset</option>
                            <option value="Liability">Liability</option>
                            <option value="Equity">Equity</option>
                            <option value="Revenue">Revenue</option>
                            <option value="Expense">Expense</option>
                          </select>
                        ) : (
                          <span className="px-4 py-1 text-xs rounded-full bg-blue-100 text-blue-700">{acc.type}</span>
                        )}
                      </td>
                      <td className="p-5 text-center">
                        <input 
                          type="checkbox" 
                          checked={acc.isBank || false} 
                          onChange={() => toggleCheckbox(acc.code, 'isBank')}
                          className="w-5 h-5"
                        />
                      </td>
                      <td className="p-5 text-center">
                        <input 
                          type="checkbox" 
                          checked={acc.noGST || false} 
                          onChange={() => toggleCheckbox(acc.code, 'noGST')}
                          className="w-5 h-5"
                        />
                      </td>
                      <td className="p-5 text-center space-x-4">
                        {editingCode === acc.code ? (
                          <>
                            <button onClick={saveEdit} className="text-green-600 font-medium">Save</button>
                            <button onClick={cancelEdit} className="text-gray-500">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(acc)} className="text-blue-600 hover:text-blue-700">✏️</button>
                            <button onClick={() => deleteAccount(acc.code)} className="text-red-600 hover:text-red-700">🗑️</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}