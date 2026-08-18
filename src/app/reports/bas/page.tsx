'use client';

import { useEffect, useState } from 'react';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate, formatAuDateRange } from '@/lib/accounting/dates';
import { downloadCsv, moneyCsv } from '@/lib/accounting/exportCsv';

type Quarter = { id: string; label: string; from: string; to: string };

type BasSourceLine = {
  id: string;
  date: string;
  description: string;
  accountCode: string;
  accountName: string;
  taxCode: string;
  amount: number;
  gstAmount: number;
  source: string;
};

type BasBox = {
  id: string;
  label: string;
  amount: number;
  lineCount: number;
  lines: BasSourceLine[];
};

type BasReport = {
  gstMethod?: string;
  period: { from: string; to: string; label: string };
  boxes?: BasBox[];
  gstCollected: number;
  gstPaid: number;
  netGst: number;
  g1TotalSales: number;
  g2ExportSales?: number;
  g3GstFreeSales?: number;
  g4InputTaxedSales?: number;
  g5?: number;
  g6?: number;
  g7Adjustments?: number;
  g8?: number;
  g9GstOnSales?: number;
  g10CapitalPurchases: number;
  g11NonCapitalPurchases: number;
  wagesTotal: number;
  paygWithheld?: number;
  paygWithheldEstimate?: number;
  taxableSalesCount: number;
  taxablePurchaseCount: number;
  entryCount: number;
  payRunCount?: number;
  note: string;
  quarters?: Quarter[];
  selectedQuarterId?: string;
  periodStatus?: 'open' | 'locked' | 'lodged';
  lockedAt?: string;
  lodgedAt?: string;
  liveSuperseded?: boolean;
};

function money(n: number) {
  return n.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  });
}

function boxOf(report: BasReport, id: string): BasBox | undefined {
  return (report.boxes || []).find((b) => b.id === id);
}

function amountOf(report: BasReport, id: string, fallback: number) {
  const b = boxOf(report, id);
  return typeof b?.amount === 'number' ? b.amount : fallback;
}

export default function BasReportPage() {
  const [quarter, setQuarter] = useState('');
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [report, setReport] = useState<BasReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [openBox, setOpenBox] = useState<string | null>(null);

  const load = (q?: string) => {
    setLoading(true);
    setError('');
    const qs = q ? `?quarter=${encodeURIComponent(q)}` : '';
    fetch(`/api/reports/bas${qs}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setReport(data);
        if (Array.isArray(data.quarters)) setQuarters(data.quarters);
        if (data.selectedQuarterId) setQuarter(data.selectedQuarterId);
      })
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const runAction = async (action: 'lock' | 'unlock' | 'lodge') => {
    if (!quarter) return;
    const confirmText =
      action === 'lock'
        ? 'Lock this quarter? Ledger dates in the quarter cannot be changed until you unlock.'
        : action === 'lodge'
          ? 'Mark this quarter as lodged? Figures are frozen for the accountant / ATO copy.'
          : 'Unlock this quarter and return to live figures?';
    if (!window.confirm(confirmText)) return;
    setWorking(action);
    setError('');
    try {
      const res = await fetch('/api/reports/bas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, quarterId: quarter }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      await load(quarter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setWorking('');
    }
  };

  const exportCsv = () => {
    if (!report) return;
    const w2 = report.paygWithheld ?? report.paygWithheldEstimate ?? 0;
    const rows: string[][] = [
      ['Field', 'Amount'],
      ['GST method', report.gstMethod || 'accrual'],
      ['Period', report.period.label],
      ['From', report.period.from],
      ['To', report.period.to],
      ['Status', report.periodStatus || 'open'],
    ];
    (report.boxes || []).forEach((b) => {
      rows.push([b.label, moneyCsv(b.amount)]);
    });
    if (!report.boxes?.length) {
      rows.push(
        ['1A GST on sales', moneyCsv(report.gstCollected)],
        ['1B GST on purchases', moneyCsv(report.gstPaid)],
        ['G1 Total sales incl GST', moneyCsv(report.g1TotalSales)],
        ['G10 Capital purchases', moneyCsv(report.g10CapitalPurchases)],
        ['G11 Non-capital purchases', moneyCsv(report.g11NonCapitalPurchases)],
        ['W1 Wages', moneyCsv(report.wagesTotal)],
        ['W2 PAYG withheld', moneyCsv(w2)]
      );
    }
    rows.push(['Net GST 1A − 1B', moneyCsv(report.netGst)]);
    downloadCsv(`bas-${report.period.from}-${report.period.to}.csv`, rows);
  };

  const status = report?.periodStatus || 'open';
  const w2 = report ? report.paygWithheld ?? report.paygWithheldEstimate ?? 0 : 0;

  const gstRows: Array<{ id: string; fallback: number }> = [
    { id: 'G1', fallback: report?.g1TotalSales || 0 },
    { id: 'G2', fallback: report?.g2ExportSales || 0 },
    { id: 'G3', fallback: report?.g3GstFreeSales || 0 },
    { id: 'G4', fallback: report?.g4InputTaxedSales || 0 },
    { id: 'G5', fallback: report?.g5 || 0 },
    { id: 'G6', fallback: report?.g6 || 0 },
    { id: 'G7', fallback: report?.g7Adjustments || 0 },
    { id: 'G8', fallback: report?.g8 || 0 },
    { id: 'G9', fallback: report?.g9GstOnSales || 0 },
    { id: '1A', fallback: report?.gstCollected || 0 },
    { id: 'G10', fallback: report?.g10CapitalPurchases || 0 },
    { id: 'G11', fallback: report?.g11NonCapitalPurchases || 0 },
    { id: '1B', fallback: report?.gstPaid || 0 },
  ];

  const payRows: Array<{ id: string; fallback: number }> = [
    { id: 'W1', fallback: report?.wagesTotal || 0 },
    { id: 'W2', fallback: w2 },
  ];

  const openLines = openBox && report ? boxOf(report, openBox)?.lines || [] : [];

  return (
    <AccountingGate section="Reports" backHref="/reports" backLabel="← Back to Reports">
      <div className="p-10 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Business Activity Statement</h1>
        <p className="text-gray-600 mb-6">
          Accrual GST for the Australian ATO. Copy these boxes into ATO Online.
          Figures are only as good as the invoices, bills/bank lines and posted
          pay runs in the quarter. This is not an electronic lodgement.
        </p>

        <div className="bg-white rounded-3xl shadow p-6 mb-6 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Quarter</label>
            <select
              value={quarter}
              onChange={(e) => {
                setQuarter(e.target.value);
                setOpenBox(null);
                load(e.target.value);
              }}
              className="border rounded-xl px-3 py-2 min-w-[280px]"
            >
              {quarters.length === 0 && <option value="">Loading…</option>}
              {quarters.map((q) => (
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
          <div className="text-center py-16 text-gray-500">Loading BAS…</div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 rounded-2xl p-6">{error}</div>
        ) : report ? (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl shadow p-8 space-y-4">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <p className="text-gray-500">{report.period.label}</p>
                  <p className="text-xl font-semibold">
                    {formatAuDateRange(report.period.from, report.period.to)}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    GST method: {report.gstMethod || 'accrual'} ·{' '}
                    {report.entryCount} ledger lines · {report.payRunCount ?? 0}{' '}
                    posted pay runs
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                      status === 'lodged'
                        ? 'bg-emerald-100 text-emerald-800'
                        : status === 'locked'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {status === 'lodged'
                      ? 'Lodged (frozen)'
                      : status === 'locked'
                        ? 'Locked'
                        : 'Open'}
                  </p>
                  {report.liveSuperseded && (
                    <p className="text-xs text-amber-700 mt-2">
                      Showing the locked snapshot, not live edits.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 print:hidden">
                {status === 'open' && (
                  <button
                    type="button"
                    disabled={Boolean(working)}
                    onClick={() => runAction('lock')}
                    className="bg-amber-600 text-white px-4 py-2 rounded-xl hover:bg-amber-700 disabled:bg-gray-300"
                  >
                    {working === 'lock' ? 'Locking…' : 'Lock quarter'}
                  </button>
                )}
                {status === 'locked' && (
                  <>
                    <button
                      type="button"
                      disabled={Boolean(working)}
                      onClick={() => runAction('unlock')}
                      className="border px-4 py-2 rounded-xl hover:bg-gray-50"
                    >
                      {working === 'unlock' ? 'Unlocking…' : 'Unlock'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(working)}
                      onClick={() => runAction('lodge')}
                      className="bg-emerald-700 text-white px-4 py-2 rounded-xl hover:bg-emerald-800"
                    >
                      {working === 'lodge' ? 'Saving…' : 'Mark lodged'}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-green-50 p-5">
                <p className="text-sm text-green-800">1A GST on sales</p>
                <p className="text-2xl font-bold text-green-700">
                  {money(report.gstCollected)}
                </p>
              </div>
              <div className="rounded-2xl bg-red-50 p-5">
                <p className="text-sm text-red-800">1B GST on purchases</p>
                <p className="text-2xl font-bold text-red-700">
                  {money(report.gstPaid)}
                </p>
              </div>
              <div className="rounded-2xl border p-5">
                <p className="text-sm text-gray-500">Net GST (1A − 1B)</p>
                <p
                  className={`text-2xl font-bold ${
                    report.netGst >= 0 ? 'text-orange-700' : 'text-blue-700'
                  }`}
                >
                  {money(report.netGst)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {report.netGst >= 0 ? 'Payable to ATO' : 'Refundable from ATO'}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow p-8">
              <h2 className="text-lg font-semibold mb-1">GST (G labels)</h2>
              <p className="text-sm text-gray-500 mb-4">
                Click a row to see the source lines. G2/G3 are $0 for pub sales.
              </p>
              <div className="space-y-1 text-sm">
                {gstRows.map((row) => {
                  const b = boxOf(report, row.id);
                  const amt = amountOf(report, row.id, row.fallback);
                  const label = b?.label || row.id;
                  const selected = openBox === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() =>
                        setOpenBox(selected ? null : row.id)
                      }
                      className={`w-full flex justify-between items-center border-b py-2 text-left ${
                        selected ? 'bg-slate-50' : ''
                      }`}
                    >
                      <span>
                        {label}
                        {b && b.lineCount > 0 && (
                          <span className="text-gray-400 ml-2">
                            {b.lineCount} lines
                          </span>
                        )}
                      </span>
                      <span className="font-medium">{money(amt)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow p-8">
              <h2 className="text-lg font-semibold mb-1">PAYG withholding</h2>
              <p className="text-sm text-gray-500 mb-4">
                W1 is gross from posted pay runs in the quarter (payment date).
                Super is not included. W2 is PAYG withheld from those runs — no
                percentage estimate.
              </p>
              <div className="space-y-1 text-sm">
                {payRows.map((row) => {
                  const b = boxOf(report, row.id);
                  const amt = amountOf(report, row.id, row.fallback);
                  const selected = openBox === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setOpenBox(selected ? null : row.id)}
                      className={`w-full flex justify-between items-center border-b py-2 text-left ${
                        selected ? 'bg-slate-50' : ''
                      }`}
                    >
                      <span>
                        {b?.label || row.id}
                        {b && b.lineCount > 0 && (
                          <span className="text-gray-400 ml-2">
                            {b.lineCount} pay runs
                          </span>
                        )}
                      </span>
                      <span className="font-medium">{money(amt)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {openBox && (
              <div className="bg-white rounded-3xl shadow p-8 print:hidden">
                <h2 className="text-lg font-semibold mb-4">
                  Drill-down · {boxOf(report, openBox)?.label || openBox}
                </h2>
                {openLines.length === 0 ? (
                  <p className="text-sm text-gray-500">No source lines in this box.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-2 pr-3">Date</th>
                          <th className="py-2 pr-3">Description</th>
                          <th className="py-2 pr-3">Account</th>
                          <th className="py-2 pr-3">Code</th>
                          <th className="py-2 pr-3 text-right">Amount</th>
                          <th className="py-2 text-right">GST</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openLines.map((line) => (
                          <tr key={line.id} className="border-b last:border-0">
                            <td className="py-2 pr-3 whitespace-nowrap">
                              {formatAuDate(line.date)}
                            </td>
                            <td className="py-2 pr-3">{line.description}</td>
                            <td className="py-2 pr-3">
                              {line.accountCode} {line.accountName}
                            </td>
                            <td className="py-2 pr-3">{line.taxCode}</td>
                            <td className="py-2 pr-3 text-right">
                              {money(line.amount)}
                            </td>
                            <td className="py-2 text-right">
                              {money(line.gstAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-gray-400">{report.note}</p>
          </div>
        ) : null}
      </div>
    </AccountingGate>
  );
}
