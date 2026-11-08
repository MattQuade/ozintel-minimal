'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate, toIsoDateInput } from '@/lib/accounting/dates';
import {
  hospitalityEmploymentKind,
  hospitalityOvertimeAmount,
  hospitalityWeekendEarnings,
  hospitalityWeekendMultipliers,
} from '@/lib/payroll/hospitalityAward';

type PayRunStatus = 'draft' | 'posted' | 'stp_submitted';

type PayRunLine = {
  employeeId: string;
  employeeName: string;
  employmentStatus?: string;
  ordinaryEarnings: number;
  allowances: number;
  overtime: number;
  overtimeHours?: number;
  saturdayHours?: number;
  saturdayEarnings?: number;
  sundayHours?: number;
  sundayEarnings?: number;
  gross: number;
  ote: number;
  paygWithheld: number;
  superAmount: number;
  net: number;
  hours: number;
  ordinaryRate: number;
};

type PayRun = {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  frequency: string;
  status: PayRunStatus;
  lines: PayRunLine[];
  totals: {
    gross: number;
    paygWithheld: number;
    superAmount: number;
    net: number;
    employeeCount: number;
  };
  journalRef?: string;
  notes: string;
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
  });
}

function statusLabel(s: PayRunStatus) {
  if (s === 'draft') return 'Draft';
  if (s === 'posted') return 'Posted';
  return 'STP ready (not lodged)';
}

function statusClass(s: PayRunStatus) {
  if (s === 'draft') return 'bg-yellow-100 text-yellow-800';
  if (s === 'posted') return 'bg-green-100 text-green-800';
  return 'bg-slate-100 text-slate-700';
}

function totalHours(line: PayRunLine) {
  return (
    (Number(line.hours) || 0) +
    (Number(line.saturdayHours) || 0) +
    (Number(line.sundayHours) || 0) +
    (Number(line.overtimeHours) || 0)
  );
}

type EditDraft = {
  hours: string;
  ordinaryRate: string;
  ordinaryEarnings: string;
  saturdayHours: string;
  saturdayEarnings: string;
  sundayHours: string;
  sundayEarnings: string;
  overtimeHours: string;
  overtime: string;
  allowances: string;
};

function lineToDraft(line: PayRunLine): EditDraft {
  return {
    hours: String(line.hours ?? ''),
    ordinaryRate: String(line.ordinaryRate ?? ''),
    ordinaryEarnings: String(line.ordinaryEarnings ?? ''),
    saturdayHours: String(line.saturdayHours ?? 0),
    saturdayEarnings: String(line.saturdayEarnings ?? 0),
    sundayHours: String(line.sundayHours ?? 0),
    sundayEarnings: String(line.sundayEarnings ?? 0),
    overtimeHours: String(line.overtimeHours ?? 0),
    overtime: String(line.overtime ?? ''),
    allowances: String(line.allowances ?? ''),
  };
}

function parseNum(s: string) {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export default function PayRunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || '');
  const [payRun, setPayRun] = useState<PayRun | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [editingRun, setEditingRun] = useState(false);
  const [runDraft, setRunDraft] = useState({
    periodStart: '',
    periodEnd: '',
    paymentDate: '',
    frequency: 'weekly',
    notes: '',
  });

  const editingLine = useMemo(
    () => payRun?.lines.find((l) => l.employeeId === editingId) || null,
    [payRun, editingId]
  );

  const awardHint = useMemo(() => {
    const kind = hospitalityEmploymentKind(editingLine?.employmentStatus);
    const m = hospitalityWeekendMultipliers(kind);
    const label = kind === 'casual' ? 'Casual' : 'Full-time / part-time';
    return {
      kind,
      label,
      satPct: Math.round(m.saturday * 100),
      sunPct: Math.round(m.sunday * 100),
      saturday: m.saturday,
      sunday: m.sunday,
    };
  }, [editingLine?.employmentStatus]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/payruns/${id}`);
      if (!res.ok) throw new Error('Pay run not found');
      setPayRun(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (line: PayRunLine) => {
    if (!payRun) return;
    setEditingRun(false);
    setEditingId(line.employeeId);
    setDraft(lineToDraft(line));
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const startEditRun = () => {
    if (!payRun) return;
    setEditingId(null);
    setDraft(null);
    setRunDraft({
      periodStart: toIsoDateInput(payRun.periodStart) || payRun.periodStart,
      periodEnd: toIsoDateInput(payRun.periodEnd) || payRun.periodEnd,
      paymentDate: toIsoDateInput(payRun.paymentDate) || payRun.paymentDate,
      frequency: payRun.frequency === 'fortnightly' ? 'fortnightly' : 'weekly',
      notes: payRun.notes || '',
    });
    setEditingRun(true);
    setError('');
  };

  const cancelEditRun = () => {
    setEditingRun(false);
  };

  const savePayRunHeader = async () => {
    if (!payRun) return;
    if (!runDraft.periodStart || !runDraft.periodEnd || !runDraft.paymentDate) {
      setError('Period start, period end, and payment date are required.');
      return;
    }
    if (runDraft.periodStart > runDraft.periodEnd) {
      setError('Period start must be on or before period end.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/payruns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodStart: runDraft.periodStart,
          periodEnd: runDraft.periodEnd,
          paymentDate: runDraft.paymentDate,
          frequency: runDraft.frequency,
          notes: runDraft.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Save failed');
      }
      setPayRun(data.payRun);
      setEditingRun(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  /** Recalc award rows when hours or base rate change. */
  const recalculateAward = (patch: Partial<EditDraft>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      const rate = parseNum(next.ordinaryRate);
      const weekdayHrs = parseNum(next.hours);
      const satHrs = parseNum(next.saturdayHours);
      const sunHrs = parseNum(next.sundayHours);
      const otHrs = parseNum(next.overtimeHours);

      if ('hours' in patch || 'ordinaryRate' in patch) {
        next.ordinaryEarnings = String(Math.round(weekdayHrs * rate * 100) / 100);
      }
      if (
        'saturdayHours' in patch ||
        'ordinaryRate' in patch ||
        'hours' in patch
      ) {
        next.saturdayEarnings = String(
          hospitalityWeekendEarnings(rate, satHrs, awardHint.saturday)
        );
      }
      if (
        'sundayHours' in patch ||
        'ordinaryRate' in patch ||
        'hours' in patch
      ) {
        next.sundayEarnings = String(
          hospitalityWeekendEarnings(rate, sunHrs, awardHint.sunday)
        );
      }
      if (
        'overtimeHours' in patch ||
        'ordinaryRate' in patch ||
        'hours' in patch
      ) {
        next.overtime = String(hospitalityOvertimeAmount(rate, otHrs));
      }
      return next;
    });
  };

  const saveLine = async () => {
    if (!payRun || !editingId || !draft) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/payruns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: [
            {
              employeeId: editingId,
              hours: parseNum(draft.hours),
              ordinaryRate: parseNum(draft.ordinaryRate),
              ordinaryEarnings: parseNum(draft.ordinaryEarnings),
              saturdayHours: parseNum(draft.saturdayHours),
              saturdayEarnings: parseNum(draft.saturdayEarnings),
              sundayHours: parseNum(draft.sundayHours),
              sundayEarnings: parseNum(draft.sundayEarnings),
              overtimeHours: parseNum(draft.overtimeHours),
              overtime: parseNum(draft.overtime),
              allowances: parseNum(draft.allowances),
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Save failed');
      }
      setPayRun(data.payRun);
      setEditingId(null);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const repostPayRun = async () => {
    if (!payRun) return;
    const alreadyPosted = payRun.status !== 'draft';
    if (
      !confirm(
        alreadyPosted
          ? `Re/Post ${payRun.number}? Journals and the ledger will be updated with the current pay period, payment date, wages, PAYG and super figures.`
          : `Re/Post ${payRun.number}? This posts wages, PAYG and super journals to the ledger for BAS.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/payruns/${id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true, repost: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Re/Post failed');
      setPayRun(data.payRun);
      setNotice(
        data.message ||
          'Journals and ledger updated with the current pay run.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re/Post failed');
    } finally {
      setBusy(false);
    }
  };

  const deletePayRun = async () => {
    if (!payRun) return;
    const posted = payRun.status !== 'draft';
    if (
      !confirm(
        posted
          ? `Delete pay run ${payRun.number}? This also removes its payroll journal lines from the ledger.`
          : `Delete draft pay run ${payRun.number}?`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/payruns', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Delete failed');
      router.push('/employees');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setBusy(false);
    }
  };

  if (!payRun && !error) {
    return (
      <AccountingGate
        section="Employment"
        backHref="/employees"
        backLabel="← Back to Employment"
      >
        <div className="p-8 text-slate-500">Loading…</div>
      </AccountingGate>
    );
  }

  if (!payRun) {
    return (
      <AccountingGate
        section="Employment"
        backHref="/employees"
        backLabel="← Back to Employment"
      >
        <div className="p-8 text-red-600">{error}</div>
      </AccountingGate>
    );
  }

  const isDraft = payRun.status === 'draft';

  return (
    <AccountingGate
      section="Employment"
      backHref="/employees"
      backLabel="← Back to Employment"
    >
      <div className="p-8 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold">{payRun.number}</h1>
              <span
                className={`px-2.5 py-0.5 rounded-md text-xs font-medium ${statusClass(
                  payRun.status
                )}`}
              >
                {statusLabel(payRun.status)}
              </span>
            </div>
            <p className="text-slate-600">
              {formatAuDate(payRun.periodStart)} –{' '}
              {formatAuDate(payRun.periodEnd)} · Paid{' '}
              {formatAuDate(payRun.paymentDate)} · {payRun.frequency}
            </p>
            {payRun.journalRef && (
              <p className="text-xs text-slate-400 mt-1">
                Journal: {payRun.journalRef}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !payRun.lines.length}
              onClick={() => void repostPayRun()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {busy ? 'Updating…' : 'Re/Post'}
            </button>
            {!editingRun && (
              <button
                type="button"
                disabled={busy}
                onClick={startEditRun}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                Edit pay run
              </button>
            )}
            {payRun.lines[0] && !editingId && !editingRun && (
              <button
                type="button"
                disabled={busy}
                onClick={() => startEdit(payRun.lines[0])}
                className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                Edit payslips
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void deletePayRun()}
              className="bg-red-700 hover:bg-red-800 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>

        {isDraft ? (
          <p className="mb-4 text-sm text-slate-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            Draft — fix the period with <strong>Edit pay run</strong>, fix hours
            with <strong>Edit payslips</strong>, then press{' '}
            <strong>Re/Post</strong> to write wages / PAYG / super to the
            journals and ledger.
          </p>
        ) : (
          <p className="mb-4 text-sm text-slate-600 bg-sky-50 border border-sky-100 rounded-xl px-4 py-3">
            After any correction, press <strong>Re/Post</strong> so journals and
            the ledger are updated with the current figures (BAS W1/W2). Not
            lodged to the ATO from here.
          </p>
        )}

        {notice && (
          <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-semibold">
            {notice}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {editingRun && (
          <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50/60 p-5">
            <h2 className="text-lg font-semibold mb-3">Edit pay run</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="text-slate-600">Period start</span>
                <input
                  type="date"
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-white"
                  value={runDraft.periodStart}
                  onChange={(e) =>
                    setRunDraft({ ...runDraft, periodStart: e.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Period end</span>
                <input
                  type="date"
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-white"
                  value={runDraft.periodEnd}
                  onChange={(e) =>
                    setRunDraft({ ...runDraft, periodEnd: e.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Payment date</span>
                <input
                  type="date"
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-white"
                  value={runDraft.paymentDate}
                  onChange={(e) =>
                    setRunDraft({ ...runDraft, paymentDate: e.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Frequency</span>
                <select
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-white"
                  value={runDraft.frequency}
                  onChange={(e) =>
                    setRunDraft({ ...runDraft, frequency: e.target.value })
                  }
                >
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600">Notes</span>
                <input
                  type="text"
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-white"
                  value={runDraft.notes}
                  onChange={(e) =>
                    setRunDraft({ ...runDraft, notes: e.target.value })
                  }
                  placeholder="Optional"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void savePayRunHeader()}
                className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-xl text-sm font-semibold"
              >
                {busy ? 'Saving…' : 'Save pay run'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={cancelEditRun}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto mb-6">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-medium">Employee</th>
                <th className="text-right p-3 font-medium">Hours</th>
                <th className="text-right p-3 font-medium">Gross</th>
                <th className="text-right p-3 font-medium">PAYG</th>
                <th className="text-right p-3 font-medium">Super</th>
                <th className="text-right p-3 font-medium">Net</th>
                <th className="p-3 w-48 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payRun.lines.map((line) => {
                const open = editingId === line.employeeId;
                return (
                  <tr key={line.employeeId} className="border-b border-slate-100">
                    <td className="p-3 font-medium align-top">
                      {line.employeeName}
                    </td>
                    <td className="p-3 text-right align-top tabular-nums">
                      {totalHours(line)}
                    </td>
                    <td className="p-3 text-right align-top">{money(line.gross)}</td>
                    <td className="p-3 text-right align-top">
                      {money(line.paygWithheld)}
                    </td>
                    <td className="p-3 text-right align-top">
                      {money(line.superAmount)}
                    </td>
                    <td className="p-3 text-right align-top font-medium">
                      {money(line.net)}
                    </td>
                    <td className="p-3 text-right align-top whitespace-nowrap">
                      <div className="inline-flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/employees/payruns/${payRun.id}/payslip/${line.employeeId}`}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium"
                        >
                          Payslip
                        </Link>
                        {!open && (
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold"
                            onClick={() => startEdit(line)}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td className="p-3" colSpan={2}>
                  Totals ({payRun.totals.employeeCount} employees)
                </td>
                <td className="p-3 text-right">{money(payRun.totals.gross)}</td>
                <td className="p-3 text-right">
                  {money(payRun.totals.paygWithheld)}
                </td>
                <td className="p-3 text-right">
                  {money(payRun.totals.superAmount)}
                </td>
                <td className="p-3 text-right">{money(payRun.totals.net)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {editingId && draft && (
          <div className="bg-white rounded-2xl border border-orange-200 p-6 mb-6">
            <h2 className="font-semibold text-lg mb-1">
              Edit payslip — {editingLine?.employeeName}
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              Hospitality Award ({awardHint.label}): Sat {awardHint.satPct}%,
              Sun {awardHint.sunPct}%, OT first 2h @ 150% then 200%. Changing
              hours or rate recalculates $; you can still override any amount.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Base hourly rate
                </label>
                <input
                  type="number"
                  step="any"
                  className="no-spinner w-full border border-slate-300 rounded-xl px-3 py-2"
                  value={draft.ordinaryRate}
                  onChange={(e) =>
                    recalculateAward({ ordinaryRate: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Allowances $
                </label>
                <input
                  type="number"
                  step="any"
                  className="no-spinner w-full border border-slate-300 rounded-xl px-3 py-2"
                  value={draft.allowances}
                  onChange={(e) =>
                    setDraft({ ...draft, allowances: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left p-2.5 font-medium">Row</th>
                    <th className="text-right p-2.5 font-medium w-28">Hours</th>
                    <th className="text-right p-2.5 font-medium w-36">Amount $</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100">
                    <td className="p-2.5">Weekday ordinary (Mon–Fri)</td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="any"
                        className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5 text-right"
                        value={draft.hours}
                        onChange={(e) =>
                          recalculateAward({ hours: e.target.value })
                        }
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="any"
                        className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5 text-right"
                        value={draft.ordinaryEarnings}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            ordinaryEarnings: e.target.value,
                          })
                        }
                      />
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="p-2.5">
                      Saturday ({awardHint.satPct}%)
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="any"
                        className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5 text-right"
                        value={draft.saturdayHours}
                        onChange={(e) =>
                          recalculateAward({ saturdayHours: e.target.value })
                        }
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="any"
                        className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5 text-right"
                        value={draft.saturdayEarnings}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            saturdayEarnings: e.target.value,
                          })
                        }
                      />
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="p-2.5">Sunday ({awardHint.sunPct}%)</td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="any"
                        className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5 text-right"
                        value={draft.sundayHours}
                        onChange={(e) =>
                          recalculateAward({ sundayHours: e.target.value })
                        }
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="any"
                        className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5 text-right"
                        value={draft.sundayEarnings}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            sundayEarnings: e.target.value,
                          })
                        }
                      />
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="p-2.5">
                      Overtime (150% / 200%)
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="any"
                        className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5 text-right"
                        value={draft.overtimeHours}
                        onChange={(e) =>
                          recalculateAward({ overtimeHours: e.target.value })
                        }
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="any"
                        className="no-spinner w-full border border-slate-300 rounded-lg px-2 py-1.5 text-right"
                        value={draft.overtime}
                        onChange={(e) =>
                          setDraft({ ...draft, overtime: e.target.value })
                        }
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={saveLine}
                className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save employee payslip'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={cancelEdit}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-5 py-2 rounded-xl text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </AccountingGate>
  );
}
