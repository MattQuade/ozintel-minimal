'use client';

import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { classifyBatch, type BankRule } from '../../../core/rules/rulesEngine';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate } from '@/lib/accounting/dates';

type BankAccountOption = {
  id: string;
  name: string;
  accountNumber?: string;
};

type CoaOption = { code: string; name: string; type: string; noGST?: boolean };

export default function BankImport() {
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [coa, setCoa] = useState<CoaOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [preview, setPreview] = useState<any[]>([]);
  const [classified, setClassified] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [quarter, setQuarter] = useState('Q4 FY25/26');

  useEffect(() => {
    Promise.all([fetch('/api/bank-accounts'), fetch('/api/coa')])
      .then(async ([banksRes, coaRes]) => {
        const banks = await banksRes.json();
        const accounts = await coaRes.json();
        const bankList = Array.isArray(banks) ? banks : [];
        setBankAccounts(bankList);
        if (bankList[0]?.id) setSelectedAccount(bankList[0].id);
        setCoa(Array.isArray(accounts) ? accounts : []);
      })
      .catch(() => setStatus('Failed to load bank accounts / COA'));
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStatus('Parsing CSV...');
    setPreview([]);
    setClassified([]);
    setSavedCount(0);

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (result) => {
        const data = result.data as any[];
        setPreview(data);
        setStatus(`✅ Parsed ${data.length} transactions`);
      },
      error: (err) => setStatus('❌ Parse error: ' + err.message),
    });
  };

  const handleClassify = async () => {
    if (preview.length === 0) return;
    setIsProcessing(true);
    setStatus('Classifying using Bank Rules...');

    try {
      const res = await fetch('/api/rules');
      const rules = (await res.json()) as BankRule[];
      const results = classifyBatch(preview, Array.isArray(rules) ? rules : []);
      setClassified(results);
      const matched = results.filter((r) => r.type !== 'Uncategorized').length;
      setStatus(`✅ ${matched} matched out of ${results.length} • ${quarter}`);
    } catch (err) {
      console.error(err);
      setStatus('❌ Failed to load bank rules');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateType = (index: number, newType: string) => {
    const updated = [...classified];
    updated[index] = { ...updated[index], type: newType, rule: 'Manual' };
    setClassified(updated);
  };

  const updateAccount = (index: number, code: string) => {
    const account = coa.find((a) => a.code === code);
    const updated = [...classified];
    updated[index] = {
      ...updated[index],
      accountCode: code,
      accountName: account?.name || updated[index].accountName,
      noGST: account?.noGST ?? updated[index].noGST,
      type: account?.type || updated[index].type,
      rule: 'Manual',
    };
    setClassified(updated);
  };

  const saveToLedger = async () => {
    if (classified.length === 0) return;

    const selectedBank = bankAccounts.find((acc) => acc.id === selectedAccount);

    const toSave = classified
      .filter((item) => item.type !== 'Uncategorized')
      .map((item) => ({
        date: item.original[0],
        amount: parseFloat(item.original[1] || 0),
        description: item.original[2] || '',
        type: item.type,
        accountCode: item.accountCode || '',
        accountName: item.accountName || '',
        noGST: Boolean(item.noGST),
        hasGST: !item.noGST,
        category:
          typeof item.rule === 'object' ? item.rule?.name || 'Manual' : item.rule || 'Manual',
        bankAccountId: selectedAccount,
        bankAccountName: selectedBank?.name || 'Unknown',
        timestamp: new Date().toISOString(),
        quarter,
      }));

    try {
      const res = await fetch('/api/ledger/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: toSave }),
      });

      if (res.ok) {
        const data = await res.json();
        setSavedCount(data.saved || toSave.length);
        setStatus(
          `💾 Saved ${data.saved || toSave.length} transactions to ${selectedBank?.name}`
        );
      } else {
        setStatus('❌ Failed to save');
      }
    } catch (err) {
      setStatus('❌ Connection error');
    }
  };

  return (
    <AccountingGate
      section="Transactions"
      backHref="/transactions"
      backLabel="← Back to Transactions"
    >
      <div className="p-10 max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">📥 Bank Import & Reconciliation</h1>
        <p className="text-gray-600 mb-8">
          Upload quarterly statements → Select Account → Auto-classify → Review codes → Save
        </p>

        <div className="bg-white rounded-3xl shadow-xl p-10">
          <div className="mb-8">
            <label className="block text-sm font-medium mb-2">
              Import to which Bank Account?
            </label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full max-w-md border border-gray-300 rounded-2xl px-5 py-3 text-lg"
            >
              {bankAccounts.length === 0 && <option value="">Loading…</option>}
              {bankAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                  {acc.accountNumber ? ` (${acc.accountNumber})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-3xl p-16 text-center">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="csvfile"
            />
            <label htmlFor="csvfile" className="cursor-pointer block">
              <div className="text-7xl mb-6">📤</div>
              <p className="text-2xl font-semibold">Upload ANZ / NAB CSV</p>
              <p className="text-gray-500">{fileName}</p>
            </label>
          </div>

          {status && <p className="text-center mt-8 text-lg font-medium">{status}</p>}
          {savedCount > 0 && (
            <p className="text-center text-sm text-gray-500">Last save: {savedCount} rows</p>
          )}

          {preview.length > 0 && classified.length === 0 && (
            <button
              onClick={handleClassify}
              disabled={isProcessing}
              className="mt-8 w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-5 rounded-2xl text-xl font-semibold"
            >
              {isProcessing ? 'Classifying...' : `Classify ${preview.length} Transactions`}
            </button>
          )}

          {classified.length > 0 && (
            <>
              <div className="mt-8 flex gap-4">
                <button
                  onClick={saveToLedger}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-5 rounded-2xl text-xl font-semibold"
                >
                  💾 Save to Ledger (
                  {classified.filter((i) => i.type !== 'Uncategorized').length})
                </button>
              </div>

              <div className="mt-10 overflow-x-auto max-h-[650px] border rounded-2xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-left">Rule</th>
                      <th className="px-4 py-3 text-left">Account</th>
                      <th className="px-4 py-3 text-left">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {classified.map((item, i) => {
                      const row = item.original;
                      const ruleName =
                        typeof item.rule === 'object' && item.rule?.name
                          ? item.rule.name
                          : item.rule || 'Manual';

                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formatAuDate(row[0])}
                          </td>
                          <td className="px-4 py-3 font-medium">{row[1]}</td>
                          <td className="px-4 py-3 max-w-xs truncate">{row[2] || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{ruleName}</td>
                          <td className="px-4 py-3 min-w-[200px]">
                            <select
                              value={item.accountCode || ''}
                              onChange={(e) => updateAccount(i, e.target.value)}
                              className="border rounded px-2 py-1 text-sm w-full"
                            >
                              <option value={item.accountCode || ''}>
                                {item.accountCode
                                  ? `${item.accountCode} — ${item.accountName}`
                                  : 'Select account'}
                              </option>
                              {coa.map((a) => (
                                <option key={a.code} value={a.code}>
                                  {a.code} — {a.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={item.type}
                              onChange={(e) => updateType(i, e.target.value)}
                              className="border rounded px-3 py-1 text-sm"
                            >
                              <option value="Revenue">Revenue</option>
                              <option value="Expense">Expense</option>
                              <option value="Asset">Asset</option>
                              <option value="Liability">Liability</option>
                              <option value="Equity">Equity</option>
                              <option value="Uncategorized">Uncategorized</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </AccountingGate>
  );
}
