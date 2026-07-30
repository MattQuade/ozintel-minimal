'use client';

import { useEffect, useState } from 'react';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate } from '@/lib/accounting/dates';
import { downloadCsv, moneyCsv } from '@/lib/accounting/exportCsv';

type ReportLine = { code: string; name: string; amount: number };

type BalanceSheetReport = {
  asAt: string;
  periodLabel: string;
  assets: { lines: ReportLine[]; total: number };
  liabilities: { lines: ReportLine[]; total: number };
  equity: { lines: ReportLine[]; total: number };
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
  difference: number;
  entryCount: number;
};

function money(n: number) {
  return n.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  });
}

export default function BalanceSheet() {
  const [asAt, setAsAt] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<BalanceSheetReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError('');
    fetch(`/api/reports/balance-sheet?asAt=${encodeURIComponent(asAt)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setReport(data);
      })
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCsv = () => {
    if (!report) return;
    const rows: string[][] = [
      ['Section', 'Code', 'Name', 'Amount'],
      ...report.assets.lines.map((l) => [
        'Asset',
        l.code,
        l.name,
        moneyCsv(l.amount),
      ]),
      ['Asset', '', 'Total Assets', moneyCsv(report.assets.total)],
      ...report.liabilities.lines.map((l) => [
        'Liability',
        l.code,
        l.name,
        moneyCsv(l.amount),
      ]),
      ...report.equity.lines.map((l) => [
        'Equity',
        l.code,
        l.name,
        moneyCsv(l.amount),
      ]),
      [
        '',
        '',
        'Total Liabilities & Equity',
        moneyCsv(report.totalLiabilitiesAndEquity),
      ],
    ];
    downloadCsv(`balance-sheet-${report.asAt}.csv`, rows);
  };

  return (
    <AccountingGate section="Reports" backHref="/reports" backLabel="← Back to Reports">
      <div className="p-10 max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Balance Sheet</h1>

        <div className="bg-white rounded-3xl shadow p-6 mb-6 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-500 mb-1">As at</label>
            <input
              type="date"
              value={asAt}
              onChange={(e) => setAsAt(e.target.value)}
              className="border rounded-xl px-3 py-2"
            />
            <p className="text-xs text-gray-400 mt-1">Shows as DD/MM/YYYY on AU browsers</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="bg-blue-600 text-white px-5 py-2 rounded-xl hover:bg-blue-700"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!report}
            className="bg-slate-700 text-white px-5 py-2 rounded-xl hover:bg-slate-800 disabled:bg-gray-300"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="border px-5 py-2 rounded-xl hover:bg-gray-50"
          >
            Print / PDF
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading balance sheet…</div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 rounded-2xl p-6">{error}</div>
        ) : report ? (
          <div className="bg-white rounded-3xl shadow p-10">
            <p className="text-gray-500 mb-2">{report.periodLabel}</p>
            <p className="text-sm text-gray-400 mb-10">
              {report.entryCount} ledger entries on or before {formatAuDate(report.asAt)}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
              <div>
                <h3 className="font-semibold text-xl mb-6 text-blue-700">Assets</h3>
                <div className="space-y-4">
                  {report.assets.lines.length === 0 ? (
                    <p className="text-gray-400 text-sm">No asset balances yet</p>
                  ) : (
                    report.assets.lines.map((line) => (
                      <div key={`a-${line.code}-${line.name}`} className="flex justify-between">
                        <span>
                          {line.code ? (
                            <span className="text-gray-400 font-mono text-sm mr-2">{line.code}</span>
                          ) : null}
                          {line.name}
                        </span>
                        <span className="font-medium">{money(line.amount)}</span>
                      </div>
                    ))
                  )}
                  <div className="flex justify-between border-t pt-4 font-bold">
                    <span>Total Assets</span>
                    <span>{money(report.assets.total)}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-xl mb-6 text-orange-700">
                  Liabilities & Equity
                </h3>
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Liabilities</p>
                  {report.liabilities.lines.length === 0 ? (
                    <p className="text-gray-400 text-sm">None</p>
                  ) : (
                    report.liabilities.lines.map((line) => (
                      <div key={`l-${line.code}-${line.name}`} className="flex justify-between">
                        <span>
                          {line.code ? (
                            <span className="text-gray-400 font-mono text-sm mr-2">{line.code}</span>
                          ) : null}
                          {line.name}
                        </span>
                        <span className="font-medium">{money(line.amount)}</span>
                      </div>
                    ))
                  )}

                  <p className="text-xs uppercase tracking-wide text-gray-400 pt-4">Equity</p>
                  {report.equity.lines.length === 0 ? (
                    <p className="text-gray-400 text-sm">None</p>
                  ) : (
                    report.equity.lines.map((line) => (
                      <div key={`eq-${line.code}-${line.name}`} className="flex justify-between">
                        <span>
                          {line.code ? (
                            <span className="text-gray-400 font-mono text-sm mr-2">{line.code}</span>
                          ) : null}
                          {line.name}
                        </span>
                        <span className="font-medium">{money(line.amount)}</span>
                      </div>
                    ))
                  )}

                  <div className="flex justify-between border-t pt-4 font-bold">
                    <span>Total Liabilities & Equity</span>
                    <span>{money(report.totalLiabilitiesAndEquity)}</span>
                  </div>
                </div>
              </div>
            </div>

            {!report.balanced && (
              <p className="mt-8 text-sm text-amber-700 bg-amber-50 rounded-xl p-4">
                Sheet difference {money(report.difference)} — usually means missing opening
                balances. Import more history or add equity/asset journals to close the gap.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </AccountingGate>
  );
}
