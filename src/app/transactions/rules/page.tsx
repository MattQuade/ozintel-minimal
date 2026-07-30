'use client';

import { useState, useEffect } from 'react';
import AccountingGate from '@/components/AccountingGate';

interface BankRule {
  id: number;
  name: string;
  matchField?: string;
  matchType?: string;
  matchValue: string;
  accountCode: string;
  accountName: string;
  type: 'Revenue' | 'Expense' | 'Asset' | 'Liability' | 'Equity' | string;
  autoReconcile?: boolean;
  noGST?: boolean;
}

type CoaOption = { code: string; name: string; type: string; noGST?: boolean };

export default function RulesManagement() {
  const [rules, setRules] = useState<BankRule[]>([]);
  const [coa, setCoa] = useState<CoaOption[]>([]);
  const [newRule, setNewRule] = useState({
    name: '',
    matchField: 'description',
    matchType: 'contains',
    matchValue: '',
    accountCode: '',
    accountName: '',
    type: 'Expense' as const,
    autoReconcile: true,
    noGST: false,
  });

  useEffect(() => {
    Promise.all([fetch('/api/rules'), fetch('/api/coa')])
      .then(async ([rulesRes, coaRes]) => {
        const rulesData = await rulesRes.json();
        const coaData = await coaRes.json();
        setRules(Array.isArray(rulesData) ? rulesData : []);
        setCoa(Array.isArray(coaData) ? coaData : []);
      })
      .catch(() => {});
  }, []);

  const addRule = () => {
    if (!newRule.name || !newRule.matchValue) {
      return alert('Rule Name and Match Value are required');
    }

    const rule: BankRule = {
      id: Date.now(),
      ...newRule,
    };

    const updated = [...rules, rule];
    setRules(updated);

    fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });

    setNewRule({
      name: '',
      matchField: 'description',
      matchType: 'contains',
      matchValue: '',
      accountCode: '',
      accountName: '',
      type: 'Expense',
      autoReconcile: true,
      noGST: false,
    });
  };

  const deleteRule = (id: number) => {
    if (confirm('Delete this rule?')) {
      const updated = rules.filter((r) => r.id !== id);
      setRules(updated);
      fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    }
  };

  return (
    <AccountingGate
      section="Transactions"
      backHref="/transactions"
      backLabel="← Back to Transactions"
    >
      <div className="p-10 max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-4xl font-bold">Bank Rules Editor</h1>
            <p className="text-gray-600">Create and manage auto-reconciliation rules</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow p-10 mb-12">
          <div className="grid grid-cols-2 gap-x-12 gap-y-8">
            <div>
              <label className="block text-sm font-medium mb-2">Rule Name</label>
              <input
                type="text"
                placeholder="ALM Packaged"
                value={newRule.name}
                onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Account</label>
              <select
                value={newRule.accountCode}
                onChange={(e) => {
                  const code = e.target.value;
                  const account = coa.find((a) => a.code === code);
                  setNewRule({
                    ...newRule,
                    accountCode: code,
                    accountName: account?.name || '',
                    type: (account?.type as typeof newRule.type) || newRule.type,
                    noGST: account?.noGST ?? newRule.noGST,
                  });
                }}
                className="w-full border border-gray-300 rounded-xl px-4 py-3"
              >
                <option value="">Select Account</option>
                {coa.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Match Field</label>
              <select
                value={newRule.matchField}
                onChange={(e) => setNewRule({ ...newRule, matchField: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3"
              >
                <option value="description">Description</option>
                <option value="amount">Amount</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Match Type</label>
              <select
                value={newRule.matchType}
                onChange={(e) => setNewRule({ ...newRule, matchType: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3"
              >
                <option value="contains">Contains</option>
                <option value="startsWith">Starts with</option>
                <option value="equals">Equals</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2">Match Value</label>
              <input
                type="text"
                placeholder="BPAY AUST LIQUOR"
                value={newRule.matchValue}
                onChange={(e) => setNewRule({ ...newRule, matchValue: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-3"
              />
            </div>
          </div>

          <div className="flex items-center gap-8 mt-10">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={newRule.autoReconcile}
                onChange={(e) =>
                  setNewRule({ ...newRule, autoReconcile: e.target.checked })
                }
                className="w-5 h-5 accent-blue-600"
              />
              <span>Auto-reconcile matching transactions</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={newRule.noGST}
                onChange={(e) => setNewRule({ ...newRule, noGST: e.target.checked })}
                className="w-5 h-5 accent-blue-600"
              />
              <span>No GST (GST-free on these transactions)</span>
            </label>
          </div>

          <div className="flex gap-4 mt-12">
            <button
              onClick={addRule}
              className="bg-blue-600 text-white px-10 py-3.5 rounded-2xl font-semibold hover:bg-blue-700"
            >
              Save Rule
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">Current Rules ({rules.length})</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left">Rule Name</th>
                <th className="px-6 py-4 text-left">Match Value</th>
                <th className="px-6 py-4 text-left">Account</th>
                <th className="px-6 py-4 text-left">Type</th>
                <th className="px-6 py-4 text-left">GST</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{rule.name}</td>
                  <td className="px-6 py-4 text-gray-600">{rule.matchValue}</td>
                  <td className="px-6 py-4 font-mono">
                    {rule.accountCode} — {rule.accountName}
                  </td>
                  <td
                    className={`px-6 py-4 font-semibold ${
                      rule.type === 'Revenue' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {rule.type}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {rule.noGST ? 'No GST' : 'Taxable'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AccountingGate>
  );
}
