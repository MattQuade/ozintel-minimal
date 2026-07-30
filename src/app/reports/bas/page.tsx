'use client';

import { useEffect, useState } from 'react';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDateRange } from '@/lib/accounting/dates';

type Quarter = { id: string; label: string; from: string; to: string };

type BasReport = {
  period: { from: string; to: string; label: string };
  gstCollected: number;
  gstPaid: number;
  netGst: number;
  g1TotalSales: number;
  g10CapitalPurchases: number;
  g11NonCapitalPurchases: number;
  taxableSalesCount: number;
  taxablePurchaseCount: number;
  entryCount: number;
  note: string;
  quarters?: Quarter[];
};

function money(n: number) {
  return n.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  });
}

export default function BasReportPage() {
  const [quarter, setQuarter] = useState('q1');
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [report, setReport] = useState<BasReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = (q = quarter) => {
    setLoading(true);
    setError('');
    fetch(`/api/reports/bas?quarter=${encodeURIComponent(q)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setReport(data);
        if (Array.isArray(data.quarters)) setQuarters(data.quarters);
      })
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AccountingGate section="Reports" backHref="/reports" backLabel="← Back to Reports">
      <div className="p-10 max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">BAS / GST Summary</h1>
        <p className="text-gray-600 mb-8">
          Indicative GST from ledger (inclusive amounts ÷ 11). Not a lodged ATO form.
        </p>

        <div className="bg-white rounded-3xl shadow p-6 mb-6 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Quarter</label>
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              className="border rounded-xl px-3 py-2 min-w-[220px]"
            >
              {(quarters.length
                ? quarters
                : [
                    { id: 'q1', label: 'Q1' },
                    { id: 'q2', label: 'Q2' },
                    { id: 'q3', label: 'Q3' },
                    { id: 'q4', label: 'Q4' },
                  ]
              ).map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => load(quarter)}
            className="bg-blue-600 text-white px-5 py-2 rounded-xl hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading BAS…</div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 rounded-2xl p-6">{error}</div>
        ) : report ? (
          <div className="bg-white rounded-3xl shadow p-10 space-y-6">
            <div>
              <p className="text-gray-500">{report.period.label}</p>
              <p className="text-xl font-semibold">
                {formatAuDateRange(report.period.from, report.period.to)}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {report.entryCount} ledger entries in period
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-green-50 p-5">
                <p className="text-sm text-green-800">GST collected (1A)</p>
                <p className="text-2xl font-bold text-green-700">
                  {money(report.gstCollected)}
                </p>
                <p className="text-xs text-green-700 mt-1">
                  {report.taxableSalesCount} taxable sales
                </p>
              </div>
              <div className="rounded-2xl bg-red-50 p-5">
                <p className="text-sm text-red-800">GST paid (1B)</p>
                <p className="text-2xl font-bold text-red-700">{money(report.gstPaid)}</p>
                <p className="text-xs text-red-700 mt-1">
                  {report.taxablePurchaseCount} taxable purchases
                </p>
              </div>
            </div>

            <div className="rounded-2xl border p-5">
              <p className="text-sm text-gray-500">Net GST</p>
              <p
                className={`text-3xl font-bold ${
                  report.netGst >= 0 ? 'text-orange-700' : 'text-blue-700'
                }`}
              >
                {money(report.netGst)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {report.netGst >= 0 ? 'Payable to ATO' : 'Refundable from ATO'}
              </p>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span>G1 Total sales (ex GST)</span>
                <span className="font-medium">{money(report.g1TotalSales)}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span>G11 Non-capital purchases (ex GST)</span>
                <span className="font-medium">
                  {money(report.g11NonCapitalPurchases)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>G10 Capital purchases</span>
                <span className="font-medium text-gray-400">
                  {money(report.g10CapitalPurchases)} (not tracked yet)
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-400">{report.note}</p>
          </div>
        ) : null}
      </div>
    </AccountingGate>
  );
}
