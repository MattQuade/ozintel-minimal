'use client';

import { useState, useEffect } from 'react';
import AccountingGate from '@/components/AccountingGate';

interface BankRule {
  id: number;
  name: string;
  matchField?: string;
  matchType?: string;
  matchValue: string;
  matchValues?: string[];
  descriptionOverride?: string;
  bankAccountId?: string;
  direction?: 'receive' | 'spend' | 'transfer' | 'any' | string;
  accountCode: string;
  accountName: string;
  type: 'Revenue' | 'Expense' | 'Asset' | 'Liability' | 'Equity' | string;
  autoReconcile?: boolean;
  noGST?: boolean;
}

type CoaOption = { code: string; name: string; type: string; noGST?: boolean };
type BankOption = { id: string; name: string; accountNumber?: string };

const NAB_BIZ_4091 = '2020';

const emptyRule = {
  name: '',
  matchField: 'description',
  matchType: 'contains',
  matchValue: '',
  descriptionOverride: '',
  bankAccountId: NAB_BIZ_4091,
  direction: 'spend' as 'spend' | 'receive' | 'transfer' | 'any',
  accountCode: '',
  accountName: '',
  type: 'Expense' as const,
  autoReconcile: true,
  noGST: false,
};

export default function RulesManagement() {
  const [rules, setRules] = useState<BankRule[]>([]);
  const [coa, setCoa] = useState<CoaOption[]>([]);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState(emptyRule);

  useEffect(() => {
    Promise.all([fetch('/api/rules'), fetch('/api/coa'), fetch('/api/bank-accounts')])
      .then(async ([rulesRes, coaRes, banksRes]) => {
        const rulesData = await rulesRes.json();
        const coaData = await coaRes.json();
        const banksData = await banksRes.json();
        setRules(Array.isArray(rulesData) ? rulesData : []);
        setCoa(Array.isArray(coaData) ? coaData : []);
        setBanks(Array.isArray(banksData) ? banksData : []);
      })
      .catch(() => {});
  }, []);

  const persistRules = async (updated: BankRule[]) => {
    setSaving(true);
    setRules(updated);
    try {
      await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } finally {
      setSaving(false);
    }
  };

  const openNewForm = () => {
    setEditingId(null);
    setNewRule(emptyRule);
    setShowForm(true);
  };

  const startEdit = (rule: BankRule) => {
    setEditingId(rule.id);
    setNewRule({
      name: rule.name || '',
      matchField: rule.matchField || 'description',
      matchType: rule.matchType || 'contains',
      matchValue: rule.matchValue || '',
      descriptionOverride: rule.descriptionOverride || '',
      bankAccountId: rule.bankAccountId || '',
      direction: (rule.direction as typeof emptyRule.direction) || 'any',
      accountCode: rule.accountCode || '',
      accountName: rule.accountName || '',
      type: (rule.type as typeof emptyRule.type) || 'Expense',
      autoReconcile: rule.autoReconcile !== false,
      noGST: Boolean(rule.noGST),
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveRule = async () => {
    if (!newRule.name.trim() || !newRule.matchValue.trim()) {
      return alert('Rule Name and Match Value are required');
    }
    if (!newRule.accountCode) {
      return alert('Select a Chart of Accounts account');
    }

    const payload: Omit<BankRule, 'id'> = {
      name: newRule.name.trim(),
      matchField: newRule.matchField,
      matchType: newRule.matchType,
      matchValue: newRule.matchValue.trim(),
      descriptionOverride: newRule.descriptionOverride.trim() || undefined,
      bankAccountId: newRule.bankAccountId || undefined,
      direction: newRule.direction,
      accountCode: newRule.accountCode,
      accountName: newRule.accountName,
      type: newRule.type,
      autoReconcile: newRule.autoReconcile,
      noGST: newRule.noGST,
    };

    if (editingId != null) {
      const existing = rules.find((r) => r.id === editingId);
      const updated = rules.map((r) =>
        r.id === editingId
          ? {
              ...r,
              ...payload,
              // Preserve multi-value OR matches from seed/import rules
              matchValues: existing?.matchValues,
            }
          : r
      );
      await persistRules(updated);
    } else {
      await persistRules([...rules, { id: Date.now(), ...payload }]);
    }

    setNewRule({ ...emptyRule, bankAccountId: newRule.bankAccountId || NAB_BIZ_4091 });
    setEditingId(null);
    setShowForm(false);
  };

  const cancelForm = () => {
    setNewRule(emptyRule);
    setEditingId(null);
    setShowForm(false);
  };

  const deleteRule = async (id: number) => {
    if (!confirm('Delete this rule?')) return;
    await persistRules(rules.filter((r) => r.id !== id));
    if (editingId === id) cancelForm();
  };

  const restoreDefaults = async () => {
    if (
      !confirm(
        'Replace all bank rules with the Xero-mapped defaults? Custom rules will be lost.'
      )
    ) {
      return;
    }
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'syncSeed' }),
    });
    const data = await res.json();
    if (data?.success && Array.isArray(data.rules)) {
      setRules(data.rules);
      alert(`Restored ${data.count} default bank rules.`);
    } else {
      alert('Failed to restore default rules.');
    }
  };

  const exportCsv = () => {
    const header = [
      'id',
      'name',
      'bankAccountId',
      'direction',
      'matchField',
      'matchType',
      'matchValue',
      'accountCode',
      'accountName',
      'type',
      'autoReconcile',
      'noGST',
      'descriptionOverride',
    ];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      header.join(','),
      ...rules.map((r) =>
        [
          r.id,
          r.name,
          r.bankAccountId || '',
          r.direction || '',
          r.matchField || '',
          r.matchType || '',
          r.matchValue,
          r.accountCode,
          r.accountName,
          r.type,
          r.autoReconcile ? 'true' : 'false',
          r.noGST ? 'true' : 'false',
          r.descriptionOverride || '',
        ]
          .map(escape)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ozintel-bank-rules-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const matchSummary = (rule: BankRule) => {
    const extras = rule.matchValues?.length
      ? ` or ${rule.matchValues.length} other`
      : '';
    const field = rule.matchField || 'description';
    const type =
      rule.matchType === 'startsWith'
        ? 'starts with'
        : rule.matchType === 'equals'
          ? 'equals'
          : 'contains';
    return `${field} ${type} ‘${rule.matchValue}’${extras}`;
  };

  const bankLabel = (id?: string) => {
    if (!id) return 'All accounts';
    const b = banks.find((x) => x.id === id);
    if (!b) return id;
    return b.accountNumber ? `${b.name} (${b.accountNumber})` : b.name;
  };

  const inputClass =
    'w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 bg-white';

  return (
    <AccountingGate
      section="Transactions"
      backHref="/transactions"
      backLabel="← Back to Transactions"
    >
      <div className="p-10 max-w-5xl mx-auto">
        <div className="flex justify-between items-start mb-10 gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold">Bank Rules</h1>
            <p className="text-gray-600 mt-1">
              Auto-fill accounts for repeat transactions
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={exportCsv}
              className="border border-gray-300 bg-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={restoreDefaults}
              className="border border-gray-300 bg-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              Restore defaults
            </button>
            <button
              type="button"
              onClick={openNewForm}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
            >
              + New Rule
            </button>
          </div>
        </div>

        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 mb-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rule Name
                </label>
                <input
                  type="text"
                  placeholder="ALM Packaged"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account
                </label>
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
                  className={inputClass}
                >
                  <option value="">Select account from COA…</option>
                  {coa.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bank account
                </label>
                <select
                  value={newRule.bankAccountId}
                  onChange={(e) =>
                    setNewRule({ ...newRule, bankAccountId: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="">All accounts</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.accountNumber ? ` (${b.accountNumber})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Direction
                </label>
                <select
                  value={newRule.direction}
                  onChange={(e) =>
                    setNewRule({
                      ...newRule,
                      direction: e.target.value as typeof newRule.direction,
                    })
                  }
                  className={inputClass}
                >
                  <option value="spend">Spend money</option>
                  <option value="receive">Receive money</option>
                  <option value="transfer">Transfer money</option>
                  <option value="any">Either</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Match Field
                </label>
                <select
                  value={newRule.matchField}
                  onChange={(e) =>
                    setNewRule({ ...newRule, matchField: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="description">Description</option>
                  <option value="amount">Amount</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Match Type
                </label>
                <select
                  value={newRule.matchType}
                  onChange={(e) =>
                    setNewRule({ ...newRule, matchType: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="contains">Contains</option>
                  <option value="startsWith">Starts with</option>
                  <option value="equals">Equals</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Match Value
                </label>
                <input
                  type="text"
                  placeholder={
                    newRule.matchField === 'amount' ? 'e.g. 49.95' : 'BPAY AUST LIQUOR'
                  }
                  value={newRule.matchValue}
                  onChange={(e) =>
                    setNewRule({ ...newRule, matchValue: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mt-6 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description Override{' '}
                  <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Leave blank to keep original"
                  value={newRule.descriptionOverride}
                  onChange={(e) =>
                    setNewRule({
                      ...newRule,
                      descriptionOverride: e.target.value,
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-3 pb-1">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newRule.autoReconcile}
                    onChange={(e) =>
                      setNewRule({
                        ...newRule,
                        autoReconcile: e.target.checked,
                      })
                    }
                    className="w-5 h-5 accent-blue-600"
                  />
                  <span className="text-sm">
                    Auto-reconcile matching transactions
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newRule.noGST}
                    onChange={(e) =>
                      setNewRule({ ...newRule, noGST: e.target.checked })
                    }
                    className="w-5 h-5 accent-blue-600"
                  />
                  <span className="text-sm">
                    No GST — GST-free on these transactions
                  </span>
                </label>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                type="button"
                onClick={saveRule}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-8 py-3 rounded-xl font-semibold"
              >
                {saving
                  ? 'Saving…'
                  : editingId != null
                    ? 'Update Rule'
                    : 'Save Rule'}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="text-gray-600 hover:text-gray-900 px-4 py-3 font-medium"
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b bg-gray-50">
            <h2 className="text-xl font-semibold">
              Current Rules ({rules.length})
              {saving ? ' · saving…' : ''}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white border-b">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-gray-600">
                    Rule Name
                  </th>
                  <th className="px-5 py-3 text-left font-medium text-gray-600">
                    Bank
                  </th>
                  <th className="px-5 py-3 text-left font-medium text-gray-600">
                    Dir
                  </th>
                  <th className="px-5 py-3 text-left font-medium text-gray-600">
                    Match
                  </th>
                  <th className="px-5 py-3 text-left font-medium text-gray-600">
                    Account
                  </th>
                  <th className="px-5 py-3 text-left font-medium text-gray-600">
                    GST
                  </th>
                  <th className="w-32"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium">{rule.name}</td>
                    <td className="px-5 py-3 text-gray-600">
                      {bankLabel(rule.bankAccountId)}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {rule.direction === 'receive'
                        ? 'In'
                        : rule.direction === 'transfer'
                          ? 'Xfer'
                          : rule.direction === 'spend'
                            ? 'Out'
                            : 'Any'}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{matchSummary(rule)}</td>
                    <td className="px-5 py-3 font-mono text-xs">
                      {rule.accountCode} — {rule.accountName}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {rule.noGST ? 'No GST' : 'Taxable'}
                    </td>
                    <td className="px-5 py-3 text-right space-x-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(rule)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
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
      </div>
    </AccountingGate>
  );
}
