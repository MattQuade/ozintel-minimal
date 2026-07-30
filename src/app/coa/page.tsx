'use client';

import { useState, useEffect } from 'react';

type COAAccount = {
  code: string;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  isBank?: boolean;
  noGST?: boolean;
};

export default function COAPage() {
  const [accounts, setAccounts] = useState<COAAccount[]>([]);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editData, setEditData] = useState<COAAccount | null>(null);
  const [status, setStatus] = useState('Loading accounts...');
  const [saving, setSaving] = useState(false);

  const loadAccounts = async () => {
    try {
      const res = await fetch('/api/coa');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
      setStatus('Loaded from server');
    } catch (err) {
      console.error(err);
      setStatus('Failed to load Chart of Accounts');
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const saveToServer = async (newAccounts: COAAccount[]) => {
    setSaving(true);
    setAccounts(newAccounts);
    try {
      const res = await fetch('/api/coa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccounts),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Save failed');
      }
      setStatus('Saved to server');
    } catch (err) {
      console.error(err);
      setStatus('Failed to save — try again');
      await loadAccounts();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (acc: COAAccount) => {
    setEditingCode(acc.code);
    setEditData({ ...acc });
  };

  const saveEdit = async () => {
    if (!editData || !editingCode) return;

    const updated = accounts.map((acc) =>
      acc.code === editingCode ? editData : acc
    );

    await saveToServer(updated);
    setEditingCode(null);
    setEditData(null);
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setEditData(null);
  };

  const updateEditField = (field: keyof COAAccount, value: string | boolean) => {
    if (!editData) return;
    setEditData({ ...editData, [field]: value });
  };

  const toggleCheckbox = async (code: string, field: 'isBank' | 'noGST') => {
    const updated = accounts.map((acc) =>
      acc.code === code ? { ...acc, [field]: !acc[field] } : acc
    );
    await saveToServer(updated);
  };

  const deleteAccount = async (code: string) => {
    if (!confirm('Delete this account?')) return;
    const updated = accounts.filter((a) => a.code !== code);
    await saveToServer(updated);
  };

  const addAccount = async () => {
    const code = window.prompt('New account code (e.g. 5030)?');
    if (!code?.trim()) return;
    if (accounts.some((a) => a.code === code.trim())) {
      alert('That account code already exists.');
      return;
    }
    const name = window.prompt('Account name?') || 'New Account';
    const next: COAAccount = {
      code: code.trim(),
      name: name.trim(),
      type: 'Expense',
    };
    await saveToServer([...accounts, next]);
    startEdit(next);
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
          <p className="text-gray-600">
            Click ✏️ to edit • Saved on server{saving ? ' (saving...)' : ''} • {status}
          </p>
        </div>
        <button
          onClick={addAccount}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl"
        >
          + Add Account
        </button>
      </div>

      {typeOrder.map((type) => {
        const items = grouped[type] || [];
        if (items.length === 0) return null;

        return (
          <div key={type} className="mb-12">
            <h2 className="text-xl font-semibold uppercase tracking-widest text-gray-500 mb-4">
              {type}
            </h2>

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
                        ) : (
                          acc.name
                        )}
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
                          <span className="px-4 py-1 text-xs rounded-full bg-blue-100 text-blue-700">
                            {acc.type}
                          </span>
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
                            <button onClick={saveEdit} className="text-green-600 font-medium">
                              Save
                            </button>
                            <button onClick={cancelEdit} className="text-gray-500">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(acc)}
                              className="text-blue-600 hover:text-blue-700"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => deleteAccount(acc.code)}
                              className="text-red-600 hover:text-red-700"
                            >
                              🗑️
                            </button>
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
