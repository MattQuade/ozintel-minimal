'use client';

import { useState, useEffect, useRef } from 'react';
import AccountingGate from '@/components/AccountingGate';

type COAAccount = {
  code: string;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense' | string;
  isBank?: boolean;
  noGST?: boolean;
  isCapital?: boolean;
};

function truthy(raw: string): boolean {
  const v = String(raw || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y';
}

function parseCoaUpload(text: string): COAAccount[] {
  const raw = String(text || '').trim();
  if (!raw) return [];
  if (raw.startsWith('[') || raw.startsWith('{')) {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.accounts)
        ? parsed.accounts
        : [];
    return list
      .map((row: Record<string, unknown>) => ({
        code: String(row.code || '').trim(),
        name: String(row.name || '').trim(),
        type: String(row.type || 'Expense'),
        isBank: Boolean(row.isBank),
        noGST: Boolean(row.noGST),
        isCapital: Boolean(row.isCapital),
      }))
      .filter((row: COAAccount) => row.code && row.name);
  }
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase();
  const hasHeader = header.includes('code') && header.includes('name');
  const cols = hasHeader
    ? lines[0].split(',').map((c) => c.trim().toLowerCase())
    : ['code', 'name', 'type', 'nogst', 'isbank', 'iscapital'];
  const start = hasHeader ? 1 : 0;
  const out: COAAccount[] = [];
  for (const line of lines.slice(start)) {
    const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    cols.forEach((col, i) => {
      row[col] = parts[i] || '';
    });
    const code = (row.code || parts[0] || '').trim();
    const name = (row.name || parts[1] || '').trim();
    if (!code || !name) continue;
    out.push({
      code,
      name,
      type: row.type || parts[2] || 'Expense',
      noGST: truthy(row.nogst || row['no gst'] || ''),
      isBank: truthy(row.isbank || row.bank || ''),
      isCapital: truthy(row.iscapital || row.capital || ''),
    });
  }
  return out;
}

export default function COAPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [accounts, setAccounts] = useState<COAAccount[]>([]);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editData, setEditData] = useState<COAAccount | null>(null);
  const [status, setStatus] = useState('Loading accounts...');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newAccount, setNewAccount] = useState({
    code: '',
    name: '',
    type: 'Expense' as string,
    isBank: false,
    noGST: false,
    isCapital: false,
  });

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

  const uploadChart = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseCoaUpload(text);
      if (parsed.length === 0) {
        setStatus('No accounts found in that file');
        return;
      }
      if (
        !confirm(
          `Replace this account’s Chart of Accounts with ${parsed.length} uploaded accounts?`
        )
      ) {
        return;
      }
      await saveToServer(parsed);
      setStatus(`Uploaded ${parsed.length} accounts`);
    } catch {
      setStatus('Could not read that chart file');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const syncDefaults = async () => {
    if (
      !confirm(
        'Replace this account’s Chart of Accounts with the starter chart? This overwrites the current list.'
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/coa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'syncSeed' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error('Sync failed');
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setStatus(
        `Synced defaults — added ${data.added || 0}, updated ${data.updated || 0}`
      );
    } catch {
      setStatus('Failed to sync defaults');
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

  const toggleCheckbox = async (
    code: string,
    field: 'isBank' | 'noGST' | 'isCapital'
  ) => {
    const updated = accounts.map((acc) =>
      acc.code === code ? { ...acc, [field]: !acc[field] } : acc
    );
    await saveToServer(updated);
  };

  const deleteAccount = async (code: string) => {
    if (!confirm('Delete this account?')) return;
    await saveToServer(accounts.filter((a) => a.code !== code));
  };

  const addAccount = async () => {
    setShowNewForm(true);
  };

  const saveNewAccount = async () => {
    const code = newAccount.code.trim();
    const name = newAccount.name.trim();
    if (!code || !name) {
      alert('Code and Account Name are required');
      return;
    }
    if (accounts.some((a) => a.code === code)) {
      alert('That account code already exists.');
      return;
    }
    const next: COAAccount = {
      code,
      name,
      type: newAccount.type,
      isBank: newAccount.isBank || undefined,
      noGST: newAccount.noGST || undefined,
      isCapital: newAccount.isCapital || undefined,
    };
    await saveToServer([...accounts, next]);
    setNewAccount({
      code: '',
      name: '',
      type: 'Expense',
      isBank: false,
      noGST: false,
      isCapital: false,
    });
    setShowNewForm(false);
  };

  const cancelNewAccount = () => {
    setShowNewForm(false);
    setNewAccount({
      code: '',
      name: '',
      type: 'Expense',
      isBank: false,
      noGST: false,
      isCapital: false,
    });
  };

  const q = search.trim().toLowerCase();
  const visible = q
    ? accounts.filter(
        (a) =>
          a.code.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.type.toLowerCase().includes(q)
      )
    : accounts;

  const grouped = visible.reduce((acc, curr) => {
    if (!acc[curr.type]) acc[curr.type] = [];
    acc[curr.type].push(curr);
    return acc;
  }, {} as Record<string, COAAccount[]>);

  const typeOrder = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

  return (
    <AccountingGate section="Chart of Accounts">
      <div className="p-8 max-w-screen-2xl mx-auto">
        <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold">Chart of Accounts</h1>
            <p className="text-gray-600">
              Manage your account structure
              {saving ? ' · saving…' : ''} · {status}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <input
              ref={fileRef}
              type="file"
              accept=".json,.csv,.txt,application/json,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadChart(file);
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-3 rounded-2xl"
            >
              Upload chart
            </button>
            <button
              onClick={syncDefaults}
              className="bg-slate-700 hover:bg-slate-800 text-white px-5 py-3 rounded-2xl"
            >
              Restore defaults
            </button>
            <button
              onClick={addAccount}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl"
            >
              + Add Account
            </button>
          </div>
        </div>

        {showNewForm && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 mb-8">
            <h2 className="text-lg font-semibold mb-6">New Account</h2>
            <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_180px] gap-4 mb-6">
              <input
                type="text"
                placeholder="Code e.g. 1000"
                value={newAccount.code}
                onChange={(e) =>
                  setNewAccount({ ...newAccount, code: e.target.value })
                }
                className="w-full border border-gray-300 rounded-xl px-4 py-3"
              />
              <input
                type="text"
                placeholder="Account Name"
                value={newAccount.name}
                onChange={(e) =>
                  setNewAccount({ ...newAccount, name: e.target.value })
                }
                className="w-full border border-gray-300 rounded-xl px-4 py-3"
              />
              <select
                value={newAccount.type}
                onChange={(e) =>
                  setNewAccount({ ...newAccount, type: e.target.value })
                }
                className="w-full border border-gray-300 rounded-xl px-4 py-3"
              >
                <option value="Asset">Asset</option>
                <option value="Liability">Liability</option>
                <option value="Equity">Equity</option>
                <option value="Revenue">Revenue</option>
                <option value="Expense">Expense</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-6 mb-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAccount.isBank}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, isBank: e.target.checked })
                  }
                  className="w-5 h-5 accent-blue-600"
                />
                <span className="text-sm">
                  Bank/Cash account (used in reconciliation)
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAccount.noGST}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, noGST: e.target.checked })
                  }
                  className="w-5 h-5 accent-blue-600"
                />
                <span className="text-sm">No GST (GST-free by default)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAccount.isCapital}
                  onChange={(e) =>
                    setNewAccount({
                      ...newAccount,
                      isCapital: e.target.checked,
                    })
                  }
                  className="w-5 h-5 accent-blue-600"
                />
                <span className="text-sm">Capital purchase (BAS G10)</span>
              </label>
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={saveNewAccount}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-8 py-3 rounded-xl font-semibold"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelNewAccount}
                className="text-gray-600 hover:text-gray-900 px-4 py-3 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code, name or type…"
          className="w-full max-w-xl mb-8 border rounded-2xl px-5 py-3"
        />

        {typeOrder.map((type) => {
          const items = grouped[type] || [];
          if (items.length === 0) return null;

          return (
            <div key={type} className="mb-12">
              <h2 className="text-xl font-semibold uppercase tracking-widest text-gray-500 mb-4">
                {type} ({items.length})
              </h2>

              <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-5 w-28">Code</th>
                      <th className="text-left p-5">Name</th>
                      <th className="text-center p-5 w-36">Type</th>
                      <th className="text-center p-5 w-24">Bank?</th>
                      <th className="text-center p-5 w-24">No GST?</th>
                      <th className="text-center p-5 w-24">Capital?</th>
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
                              onChange={(e) =>
                                updateEditField('name', e.target.value)
                              }
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
                              onChange={(e) =>
                                updateEditField('type', e.target.value)
                              }
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
                        <td className="p-5 text-center">
                          <input
                            type="checkbox"
                            checked={acc.isCapital || false}
                            onChange={() => toggleCheckbox(acc.code, 'isCapital')}
                            className="w-5 h-5"
                          />
                        </td>
                        <td className="p-5 text-center space-x-4">
                          {editingCode === acc.code ? (
                            <>
                              <button
                                onClick={saveEdit}
                                className="text-green-600 font-medium"
                              >
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
                                Edit
                              </button>
                              <button
                                onClick={() => deleteAccount(acc.code)}
                                className="text-red-600 hover:text-red-700"
                              >
                                Delete
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
    </AccountingGate>
  );
}
