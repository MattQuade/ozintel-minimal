'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AccountingGate from '@/components/AccountingGate';
import ReceiptAttach from '@/components/ReceiptAttach';
import {
  GST_TAX_CODES,
  TAX_CODE_LABELS,
  resolveTaxCode,
  type GstTaxCode,
} from '@/lib/accounting/gstTax';

type CoaOption = {
  code: string;
  name: string;
  type: string;
  noGST?: boolean;
  isCapital?: boolean;
  isBank?: boolean;
};

type LineItem = {
  id: string;
  accountCode: string;
  description: string;
  debit: number;
  credit: number;
  hasGST: boolean;
  taxCode: GstTaxCode;
};

export default function NewJournalEntry() {
  const router = useRouter();
  const [coa, setCoa] = useState<CoaOption[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<LineItem[]>([
    { id: '1', accountCode: '', description: '', debit: 0, credit: 0, hasGST: true, taxCode: 'GST' },
  ]);
  const [receiptIds, setReceiptIds] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/coa')
      .then((r) => r.json())
      .then((data) => setCoa(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const addLine = () => {
    setLines([
      ...lines,
      {
        id: Date.now().toString(),
        accountCode: '',
        description: '',
        debit: 0,
        credit: 0,
        hasGST: true,
        taxCode: 'GST',
      },
    ]);
  };

  const updateLine = (id: string, field: keyof LineItem, value: string | number | boolean) => {
    setLines(
      lines.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, [field]: value };
        if (field === 'accountCode') {
          const acc = coa.find((a) => a.code === value);
          if (acc) {
            next.hasGST = !acc.noGST;
            next.taxCode = resolveTaxCode(
              {
                type: acc.type,
                accountCode: acc.code,
                accountName: acc.name,
                noGST: acc.noGST,
                hasGST: !acc.noGST,
                source: 'journal',
              },
              new Map(coa.map((a) => [a.code, a]))
            );
          }
        }
        if (field === 'hasGST') {
          next.taxCode = value ? 'GST' : next.taxCode === 'N-T' ? 'N-T' : 'FRE';
        }
        return next;
      })
    );
  };

  const deleteLine = (id: string) => {
    if (lines.length > 1) setLines(lines.filter((line) => line.id !== id));
  };

  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);

  const handleSave = async () => {
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      alert('Debit and Credit totals must balance!');
      return;
    }

    const entries = lines
      .filter((line) => line.debit > 0 || line.credit > 0)
      .map((line, index) => {
        const acc = coa.find((a) => a.code === line.accountCode);
        const isDebit = line.debit > 0;
        return {
          id: 'manual-' + Date.now() + '-' + line.id,
          date,
          description: line.description || reference,
          amount: isDebit ? line.debit : -line.credit,
          type: acc?.type || (isDebit ? 'Expense' : 'Revenue'),
          account: acc ? `${acc.code} - ${acc.name}` : line.accountCode,
          accountCode: line.accountCode,
          accountName: acc?.name || '',
          hasGST: line.hasGST,
          noGST: !line.hasGST,
          taxCode: line.taxCode,
          reconciled: false,
          source: 'journal',
          timestamp: new Date().toISOString(),
          // Attach receipt evidence to the first expense-like (debit) line primarily;
          // also stamp all lines so the journal set stays linked.
          ...(receiptIds.length > 0 && index === 0 ? { receiptIds } : {}),
        };
      });

    try {
      const res = await fetch('/api/ledger/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'fail');
      }
      alert('Journal entry saved successfully');
      router.push('/journal');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save entry');
    }
  };

  return (
    <AccountingGate section="Journal" backHref="/journal" backLabel="← Back to Journal">
      <div className="p-8 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">New Journal Entry</h1>

        <div className="bg-white rounded-3xl p-8 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
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
                placeholder="Invoice / memo"
                className="w-full border rounded-xl p-3"
              />
            </div>
          </div>

          <table className="w-full mb-6">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium">Account</th>
                <th className="text-left p-3 font-medium">Description</th>
                <th className="text-right p-3 font-medium">Debit</th>
                <th className="text-right p-3 font-medium">Credit</th>
                <th className="text-center p-3 font-medium w-24">GST</th>
                <th className="text-left p-3 font-medium w-36">Tax code</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b">
                  <td className="p-3">
                    <select
                      value={line.accountCode}
                      onChange={(e) => updateLine(line.id, 'accountCode', e.target.value)}
                      className="w-full border rounded-lg p-2"
                    >
                      <option value="">Select account</option>
                      {coa.map((acc) => (
                        <option key={acc.code} value={acc.code}>
                          {acc.code} — {acc.name} ({acc.type})
                        </option>
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
                      value={line.debit || ''}
                      onChange={(e) =>
                        updateLine(line.id, 'debit', parseFloat(e.target.value) || 0)
                      }
                      className="w-full border rounded-lg p-2 text-right"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      step="0.01"
                      value={line.credit || ''}
                      onChange={(e) =>
                        updateLine(line.id, 'credit', parseFloat(e.target.value) || 0)
                      }
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
                    <select
                      value={line.taxCode}
                      onChange={(e) => updateLine(line.id, 'taxCode', e.target.value)}
                      className="w-full border rounded-lg p-2 text-sm"
                    >
                      {GST_TAX_CODES.map((code) => (
                        <option key={code} value={code}>
                          {code} · {TAX_CODE_LABELS[code]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => deleteLine(line.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
            <button
              onClick={addLine}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              + Add line
            </button>
            <div className="text-right font-medium">
              Total Debit: ${totalDebit.toFixed(2)} &nbsp;&nbsp; Total Credit: $
              {totalCredit.toFixed(2)}
            </div>
          </div>

          <div className="mb-8">
            <ReceiptAttach
              receiptIds={receiptIds}
              onChange={setReceiptIds}
              label="Receipt evidence (ATO)"
            />
          </div>

          <div className="flex gap-4 flex-col sm:flex-row">
            <button
              onClick={handleSave}
              className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-medium hover:bg-blue-700"
            >
              Save Entry
            </button>
            <button
              onClick={() => router.push('/journal')}
              className="flex-1 border py-4 rounded-2xl font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </AccountingGate>
  );
}
