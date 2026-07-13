'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { rulesEngine } from '../../../core/rules/rulesEngine';

const bankAccounts = [
  { id: '1', name: 'NAB Credit Card', number: 'NAB-CC-XXXX' },
  { id: '2', name: 'NAB Business Account', number: 'NAB-BIZ-XXXX' },
  { id: '3', name: 'ANZ Business Account', number: 'ANZ-BIZ-XXXX' },
];

export default function BankImport() {
  const [selectedAccount, setSelectedAccount] = useState(bankAccounts[0].id);
  const [preview, setPreview] = useState<any[]>([]);
  const [classified, setClassified] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [quarter, setQuarter] = useState('Q4 FY25/26');

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
      error: (err) => setStatus('❌ Parse error: ' + err.message)
    });
  };

  const handleClassify = () => {
    if (preview.length === 0) return;
    setIsProcessing(true);
    setStatus('Classifying using Bank Rules...');

    setTimeout(() => {
      const results = rulesEngine.classifyBatch(preview);
      setClassified(results);
      const matched = results.filter(r => r.type !== 'Uncategorized').length;
      setStatus(`✅ ${matched} matched out of ${results.length} • ${quarter}`);
      setIsProcessing(false);
    }, 700);
  };

  const updateType = (index: number, newType: string) => {
    const updated = [...classified];
    updated[index] = { ...updated[index], type: newType, rule: 'Manual' };
    setClassified(updated);
  };

  const saveToLedger = async () => {
    if (classified.length === 0) return;

    const selectedBank = bankAccounts.find(acc => acc.id === selectedAccount);

    const toSave = classified
      .filter(item => item.type !== 'Uncategorized')
      .map(item => ({
        date: item.original[0],
        amount: parseFloat(item.original[1] || 0),
        description: item.original[2] || '',
        type: item.type,
        category: typeof item.rule === 'object' ? item.rule?.name || 'Manual' : item.rule || 'Manual',
        bankAccountId: selectedAccount,
        bankAccountName: selectedBank?.name || 'Unknown',
        timestamp: new Date().toISOString(),
        quarter
      }));

    try {
      const res = await fetch('/api/ledger/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: toSave })
      });

      if (res.ok) {
        const data = await res.json();
        setSavedCount(data.saved || toSave.length);
        setStatus(`💾 Saved ${data.saved || toSave.length} transactions to ${selectedBank?.name}`);
      } else {
        setStatus('❌ Failed to save');
      }
    } catch (err) {
      setStatus('❌ Connection error');
    }
  };

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <h1 className="text-4xl font-bold mb-2">📥 Bank Import & Reconciliation</h1>
      <p className="text-gray-600 mb-8">Upload quarterly statements → Select Account → Auto-classify → Save</p>

      <div className="bg-white rounded-3xl shadow-xl p-10">
        {/* Bank Account Selector */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Import to which Bank Account?</label>
          <select 
            value={selectedAccount} 
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full max-w-md border border-gray-300 rounded-2xl px-5 py-3 text-lg"
          >
            {bankAccounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({acc.number})
              </option>
            ))}
          </select>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-3xl p-16 text-center">
          <input type="file" accept=".csv" onChange={handleFileSelect} className="hidden" id="csvfile" />
          <label htmlFor="csvfile" className="cursor-pointer block">
            <div className="text-7xl mb-6">📤</div>
            <p className="text-2xl font-semibold">Upload ANZ / NAB CSV</p>
            <p className="text-gray-500">{fileName}</p>
          </label>
        </div>

        {status && <p className="text-center mt-8 text-lg font-medium">{status}</p>}

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
                💾 Save to Ledger ({classified.filter(i => i.type !== 'Uncategorized').length})
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
                    <th className="px-4 py-3 text-left">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {classified.map((item, i) => {
                    const row = item.original;
                    const ruleName = typeof item.rule === 'object' && item.rule?.name 
                      ? item.rule.name 
                      : (item.rule || 'Manual');

                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{row[0]}</td>
                        <td className="px-4 py-3 font-medium">{row[1]}</td>
                        <td className="px-4 py-3 max-w-md truncate">{row[2] || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{ruleName}</td>
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
  );
}