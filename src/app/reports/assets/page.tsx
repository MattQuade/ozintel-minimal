'use client';

import { useEffect, useState } from 'react';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate } from '@/lib/accounting/dates';
import { downloadCsv, moneyCsv } from '@/lib/accounting/exportCsv';

type RegisterLine = {
  asset: {
    id: string;
    number: string;
    name: string;
    assetType: string;
    status: string;
    bookMethod: string;
    bookRate: number;
  };
  cost: number;
  accumulatedDep: number;
  bookValue: number;
};

type ScheduleLine = {
  number: string;
  name: string;
  assetType: string;
  method: string;
  rate: number;
  cost: number;
  openingBookValue: number;
  charge: number;
  closingBookValue: number;
};

type Report = {
  asAt: string;
  period: { from: string; to: string };
  register: RegisterLine[];
  schedule: ScheduleLine[];
  totals: {
    cost: number;
    accumulatedDep: number;
    bookValue: number;
    charge: number;
  };
  note: string;
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  });
}

function currentFy() {
  const now = new Date();
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 6 ? y : y - 1;
  return { from: `${startYear}-07-01`, to: `${startYear + 1}-06-30` };
}

export default function AssetReportsPage() {
  const fy = currentFy();
  const [from, setFrom] = useState(fy.from);
  const [to, setTo] = useState(fy.to);
  const [asAt, setAsAt] = useState(fy.to);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError('');
    const q = `asAt=${encodeURIComponent(asAt)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    fetch(`/api/reports/assets?${q}`)
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

  const exportRegister = () => {
    if (!report) return;
    downloadCsv(
      `asset-register-${report.asAt}.csv`,
      [
        ['Number', 'Name', 'Type', 'Status', 'Cost', 'Accum dep', 'Book value'],
        ...report.register.map((r) => [
          r.asset.number,
          r.asset.name,
          r.asset.assetType,
          r.asset.status,
          moneyCsv(r.cost),
          moneyCsv(r.accumulatedDep),
          moneyCsv(r.bookValue),
        ]),
        ['', '', '', 'Total', moneyCsv(report.totals.cost), moneyCsv(report.totals.accumulatedDep), moneyCsv(report.totals.bookValue)],
      ]
    );
  };

  const exportSchedule = () => {
    if (!report) return;
    downloadCsv(
      `depreciation-schedule-${report.period.from}-${report.period.to}.csv`,
      [
        ['Number', 'Name', 'Type', 'Method', 'Rate %', 'Opening', 'Charge', 'Closing'],
        ...report.schedule.map((r) => [
          r.number,
          r.name,
          r.assetType,
          r.method,
          String(r.rate),
          moneyCsv(r.openingBookValue),
          moneyCsv(r.charge),
          moneyCsv(r.closingBookValue),
        ]),
        ['', '', '', '', 'Total', '', moneyCsv(report.totals.charge), ''],
      ]
    );
  };

  return (
    <AccountingGate section="Reports" backHref="/reports" backLabel="← Back to Reports">
      <div className="p-8 max-w-screen-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Asset reports</h1>
        <p className="text-gray-500 mb-6 max-w-2xl">
          Register at a date and EOFY depreciation schedule for this account.
          Book figures for reconciling with an accountant — not tax advice.
        </p>

        <div className="flex flex-wrap gap-4 items-end mb-6">
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">As at</span>
            <input
              type="date"
              className="border rounded-xl px-4 py-3"
              value={asAt}
              onChange={(e) => setAsAt(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Schedule from</span>
            <input
              type="date"
              className="border rounded-xl px-4 py-3"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Schedule to</span>
            <input
              type="date"
              className="border rounded-xl px-4 py-3"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={load}
            className="rounded-xl bg-orange-600 text-white font-medium px-4 py-3"
          >
            Update
          </button>
        </div>

        {error ? <p className="text-red-600 mb-4">{error}</p> : null}
        {loading || !report ? (
          <p className="text-gray-500">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <p className="text-gray-500">Cost</p>
                <p className="text-2xl font-semibold mt-2">{money(report.totals.cost)}</p>
              </div>
              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <p className="text-gray-500">Accum dep</p>
                <p className="text-2xl font-semibold mt-2">
                  {money(report.totals.accumulatedDep)}
                </p>
              </div>
              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <p className="text-gray-500">Book value {formatAuDate(report.asAt)}</p>
                <p className="text-2xl font-semibold mt-2">
                  {money(report.totals.bookValue)}
                </p>
              </div>
              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <p className="text-gray-500">Schedule charge</p>
                <p className="text-2xl font-semibold mt-2">{money(report.totals.charge)}</p>
              </div>
            </div>

            <div className="flex justify-between items-center mb-3">
              <h2 className="text-2xl font-semibold">Register</h2>
              <button type="button" className="text-sm underline" onClick={exportRegister}>
                Export CSV
              </button>
            </div>
            <div className="bg-white rounded-3xl shadow-sm overflow-x-auto mb-10">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-500 border-b">
                  <tr>
                    <th className="px-4 py-3">No.</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Accum</th>
                    <th className="px-4 py-3 text-right">Book</th>
                  </tr>
                </thead>
                <tbody>
                  {report.register.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        No assets in this account yet.
                      </td>
                    </tr>
                  ) : (
                    report.register.map((r) => (
                      <tr key={r.asset.id} className="border-t">
                        <td className="px-4 py-3">{r.asset.number}</td>
                        <td className="px-4 py-3">{r.asset.name}</td>
                        <td className="px-4 py-3">{r.asset.assetType}</td>
                        <td className="px-4 py-3">{r.asset.status}</td>
                        <td className="px-4 py-3 text-right">{money(r.cost)}</td>
                        <td className="px-4 py-3 text-right">{money(r.accumulatedDep)}</td>
                        <td className="px-4 py-3 text-right">{money(r.bookValue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center mb-3">
              <h2 className="text-2xl font-semibold">
                Depreciation schedule {formatAuDate(report.period.from)} –{' '}
                {formatAuDate(report.period.to)}
              </h2>
              <button type="button" className="text-sm underline" onClick={exportSchedule}>
                Export CSV
              </button>
            </div>
            <div className="bg-white rounded-3xl shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-500 border-b">
                  <tr>
                    <th className="px-4 py-3">No.</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3 text-right">Opening</th>
                    <th className="px-4 py-3 text-right">Charge</th>
                    <th className="px-4 py-3 text-right">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {report.schedule.map((r) => (
                    <tr key={r.number} className="border-t">
                      <td className="px-4 py-3">{r.number}</td>
                      <td className="px-4 py-3">{r.name}</td>
                      <td className="px-4 py-3">
                        {r.method} {r.rate}%
                      </td>
                      <td className="px-4 py-3 text-right">{money(r.openingBookValue)}</td>
                      <td className="px-4 py-3 text-right">{money(r.charge)}</td>
                      <td className="px-4 py-3 text-right">{money(r.closingBookValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-gray-500 text-sm mt-4">{report.note}</p>
          </>
        )}
      </div>
    </AccountingGate>
  );
}
