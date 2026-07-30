'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';

type ReportLine = { code: string; name: string; amount: number };

type ProfitLossReport = {
  period: { from: string; to: string; label: string };
  revenue: { lines: ReportLine[]; total: number };
  cogs: { lines: ReportLine[]; total: number };
  grossProfit: number;
  expenses: { lines: ReportLine[]; total: number };
  netProfit: number;
  entryCount: number;
};

function money(n: number) {
  return n.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  });
}

function currentFyDefaults() {
  const now = new Date();
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 6 ? y : y - 1;
  return {
    from: `${startYear}-07-01`,
    to: `${startYear + 1}-06-30`,
  };
}

export default function ProfitLoss() {
  const defaults = currentFyDefaults();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError('');
    fetch(`/api/reports/profit-loss?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
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

  return (
    <AccountingGate section="Reports">
      <div className="p-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <h1 className="text-4xl font-bold">Profit & Loss Statement</h1>
          <Link href="/reports" className="text-sm text-blue-600 hover:underline">
            ← Reports hub
          </Link>
        </div>

        <div className="bg-white rounded-3xl shadow p-6 mb-6 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border rounded-xl px-3 py-2"
            />
          </div>
          <button
            type="button"
            onClick={load}
            className="bg-blue-600 text-white px-5 py-2 rounded-xl hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading P&amp;L…</div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 rounded-2xl p-6">{error}</div>
        ) : report ? (
          <div className="bg-white rounded-3xl shadow p-10">
            <div className="flex justify-between mb-10 gap-4 flex-wrap">
              <div>
                <p className="text-gray-500">{report.period.label}</p>
                <p className="text-2xl font-semibold">
                  {report.period.from} – {report.period.to}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {report.entryCount} revenue/expense entries
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`text-4xl font-bold ${
                    report.netProfit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {money(report.netProfit)}
                </p>
                <p className="text-sm text-gray-500">Net Profit</p>
              </div>
            </div>

            <div className="space-y-8">
              <section>
                <h3 className="font-semibold text-lg mb-4 text-green-700">Revenue</h3>
                <div className="pl-2 space-y-3">
                  {report.revenue.lines.length === 0 ? (
                    <p className="text-gray-400 text-sm">No revenue in this period</p>
                  ) : (
                    report.revenue.lines.map((line) => (
                      <div key={`r-${line.code}-${line.name}`} className="flex justify-between">
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
                  <div className="flex justify-between border-t pt-3 font-semibold">
                    <span>Total Revenue</span>
                    <span>{money(report.revenue.total)}</span>
                  </div>
                </div>
              </section>

              {report.cogs.lines.length > 0 && (
                <section>
                  <h3 className="font-semibold text-lg mb-4 text-orange-700">Cost of Goods Sold</h3>
                  <div className="pl-2 space-y-3">
                    {report.cogs.lines.map((line) => (
                      <div key={`c-${line.code}-${line.name}`} className="flex justify-between">
                        <span>
                          {line.code ? (
                            <span className="text-gray-400 font-mono text-sm mr-2">{line.code}</span>
                          ) : null}
                          {line.name}
                        </span>
                        <span className="font-medium">{money(line.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t pt-3 font-semibold">
                      <span>Total COGS</span>
                      <span>{money(report.cogs.total)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Gross Profit</span>
                      <span>{money(report.grossProfit)}</span>
                    </div>
                  </div>
                </section>
              )}

              <section>
                <h3 className="font-semibold text-lg mb-4 text-red-700">Expenses</h3>
                <div className="pl-2 space-y-3 text-sm">
                  {report.expenses.lines.length === 0 ? (
                    <p className="text-gray-400">No operating expenses in this period</p>
                  ) : (
                    report.expenses.lines.map((line) => (
                      <div key={`e-${line.code}-${line.name}`} className="flex justify-between">
                        <span>
                          {line.code ? (
                            <span className="text-gray-400 font-mono text-sm mr-2">{line.code}</span>
                          ) : null}
                          {line.name}
                        </span>
                        <span>{money(line.amount)}</span>
                      </div>
                    ))
                  )}
                  <div className="flex justify-between font-semibold border-t pt-3 text-base">
                    <span>Total Expenses</span>
                    <span>{money(report.expenses.total)}</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </AccountingGate>
  );
}
