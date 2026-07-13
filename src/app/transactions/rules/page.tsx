'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface BankRule {
  id: number;
  name: string;
  matchField: string;
  matchType: string;
  matchValue: string;
  accountCode: string;
  accountName: string;
  type: 'Revenue' | 'Expense' | 'Asset' | 'Liability' | 'Equity';
  autoReconcile: boolean;
  noGST: boolean;
}

export default function RulesManagement() {
  const [rules, setRules] = useState<BankRule[]>([]);
  const [newRule, setNewRule] = useState({
    name: '',
    matchField: 'description',
    matchType: 'contains',
    matchValue: '',
    accountCode: '',
    accountName: '',
    type: 'Expense' as const,
    autoReconcile: true,
    noGST: false
  });

  useEffect(() => {
    fetch('/api/rules')
      .then(res => res.json())
      .then(data => setRules(data))
      .catch(() => {});
  }, []);

  const addRule = () => {
    if (!newRule.name || !newRule.matchValue) return alert("Rule Name and Match Value are required");

    const rule: BankRule = {
      id: Date.now(),
      ...newRule
    };

    const updated = [...rules, rule];
    setRules(updated);

    fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
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
      noGST: false
    });
  };

  const deleteRule = (id: number) => {
    if (confirm('Delete this rule?')) {
      const updated = rules.filter(r => r.id !== id);
      setRules(updated);
      fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    }
  };

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-4xl font-bold">Bank Rules Editor</h1>
          <p className="text-gray-600">Create and manage auto-reconciliation rules</p>
        </div>
        <Link href="/transactions/import" className="bg-blue-600 text-white px-6 py-3 rounded-2xl hover:bg-blue-700">
          ← Back to Import
        </Link>
      </div>

      {/* New Rule Form */}
      <div className="bg-white rounded-3xl shadow p-10 mb-12">
        <div className="grid grid-cols-2 gap-x-12 gap-y-8">
          <div>
            <label className="block text-sm font-medium mb-2">Rule Name</label>
            <input 
              type="text" 
              placeholder="ALM Packaged"
              value={newRule.name}
              onChange={(e) => setNewRule({...newRule, name: e.target.value})}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Account</label>
            <select 
              value={newRule.accountCode}
              onChange={(e) => setNewRule({...newRule, accountCode: e.target.value, accountName: e.target.options[e.target.selectedIndex]?.text || ''})}
              className="w-full border border-gray-300 rounded-xl px-4 py-3"
            >
              <option value="">Select Account</option>
              <option value="4005">4005 — Bar Sales</option>
              <option value="4004">4004 — Bottle Shop</option>
              <option value="5009">5009 — Packaged</option>
              <option value="5001">5001 — Wages</option>
              <option value="5005">5005 — Groceries GST Free</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Match Field</label>
            <select 
              value={newRule.matchField} 
              onChange={(e) => setNewRule({...newRule, matchField: e.target.value})}
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
              onChange={(e) => setNewRule({...newRule, matchType: e.target.value})}
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
              onChange={(e) => setNewRule({...newRule, matchValue: e.target.value})}
              className="w-full border border-gray-300 rounded-xl px-4 py-3"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium mb-2">Description Override (optional)</label>
            <input type="text" placeholder="Leave blank to keep original" className="w-full border border-gray-300 rounded-xl px-4 py-3" />
          </div>
        </div>

        <div className="flex items-center gap-8 mt-10">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={newRule.autoReconcile} onChange={(e) => setNewRule({...newRule, autoReconcile: e.target.checked})} className="w-5 h-5 accent-blue-600" />
            <span>Auto-reconcile matching transactions</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={newRule.noGST} onChange={(e) => setNewRule({...newRule, noGST: e.target.checked})} className="w-5 h-5 accent-blue-600" />
            <span>No GST (GST-free on these transactions)</span>
          </label>
        </div>

        <div className="flex gap-4 mt-12">
          <button onClick={addRule} className="bg-blue-600 text-white px-10 py-3.5 rounded-2xl font-semibold hover:bg-blue-700">
            Save Rule
          </button>
          <button className="px-8 py-3.5 rounded-2xl border hover:bg-gray-100">Cancel</button>
        </div>
      </div>

      {/* Current Rules */}
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
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rules.map(rule => (
              <tr key={rule.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium">{rule.name}</td>
                <td className="px-6 py-4 text-gray-600">{rule.matchValue}</td>
                <td className="px-6 py-4 font-mono">{rule.accountCode} — {rule.accountName}</td>
                <td className={`px-6 py-4 font-semibold ${rule.type === 'Revenue' ? 'text-green-600' : 'text-red-600'}`}>{rule.type}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => deleteRule(rule.id)} className="text-red-600 hover:text-red-800">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}