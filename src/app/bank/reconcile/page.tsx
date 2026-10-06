'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate } from '@/lib/accounting/dates';
import { FY2627_Q1, JOURNAL_PERIODS } from '@/lib/accounting/journalPeriods';

type ReconciliationLine = {
  id: string;
  date: string;
  description: string;
  amount: number;
  runningBalance: number;
};

type AccountReconciliation = {
  bankAccountId: string;
  name: string;
  accountNumber: string;
  type: string;
  openingAsAt: string;
  openingIncluded: boolean;
  openingBalance: number;
  moneyIn: number;
  moneyOut: number;
  booksBalance: number;
  lineCount: number;
  linesBeforeOpening: number;
  linesAfterAsAt: number;
  undatedLines: number;
  statementBalance: number | null;
  difference: number | null;
  lines: ReconciliationLine[];
};

function money(n: number) {
  return n.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  });
}

function gapText(difference: number): string {
  const gap = Math.abs(difference);
  if (difference > 0) {
    return `Statement is ${money(gap)} higher than the books. A deposit may be missing from the journal, or the journal has an extra payment.`;
  }
  return `Books are ${money(gap)} higher than the statement. A payment may be missing from the journal, or the journal has an extra deposit.`;
}

export default function BankReconcilePage() {
  const [periodId, setPeriodId] = useState<string>(FY2627_Q1.id);
  const [asAt, setAsAt] = useState<string>(FY2627_Q1.to);
  const [accounts, setAccounts] = useState<AccountReconciliation[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [savedId, setSavedId] = useState('');

  const load = useCallback(async (day: string, quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/reports/bank-reconciliation?asAt=${encodeURIComponent(day)}`,
        { cache: 'no-store' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load reconciliation');
      const rows: AccountReconciliation[] = Array.isArray(data.accounts) ? data.accounts : [];
      setAccounts(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((row) => [
            row.bankAccountId,
            row.statementBalance == null ? '' : String(row.statementBalance),
          ])
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reconciliation');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(asAt);
  }, [asAt, load]);

  const save = async (account: AccountReconciliation) => {
    const raw = (drafts[account.bankAccountId] ?? '').trim();
    setSavingId(account.bankAccountId);
    setSavedId('');
    setError('');
    try {
      const res = await fetch('/api/reports/bank-reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccountId: account.bankAccountId,
          asAt,
          statementBalance: raw === '' ? null : raw,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save the statement balance');
      setSavedId(account.bankAccountId);
      await load(asAt, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the statement balance');
    } finally {
      setSavingId('');
    }
  };

  const periodMatch = JOURNAL_PERIODS.find((period) => period.id === periodId);

  return (
    <AccountingGate section="Bank">
      <div className="p-6 max-w-screen-2xl mx-auto">
        <div className="flex justify-between items-end mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold">Reconcile</h1>
            <p className="text-gray-600 mt-2 max-w-3xl">
              For every bank account, the books balance is the opening balance plus
              the journal lines from that opening date through the statement date.
              Type the closing balance printed on each statement. A zero difference
              means that account is complete to that date.
            </p>
          </div>
          <Link href="/bank/accounts" className="text-blue-600 hover:text-blue-800 font-medium">
            Bank accounts
          </Link>
        </div>

        <div className="flex flex-wrap items-end gap-4 mb-8">
          <label className="block">
            <span className="block text-sm text-gray-500 mb-1">Statement date</span>
            <input
              type="date"
              value={asAt}
              onChange={(e) => {
                const day = e.target.value;
                setAsAt(day);
                const still = JOURNAL_PERIODS.find((period) => period.id === periodId);
                if (still?.to === day) return;
                const hits = JOURNAL_PERIODS.filter((period) => period.to === day);
                setPeriodId(hits.length === 1 ? hits[0].id : '');
              }}
              className="border rounded-xl px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="block text-sm text-gray-500 mb-1">Period</span>
            <select
              value={periodMatch?.id || ''}
              onChange={(e) => {
                const period = JOURNAL_PERIODS.find((row) => row.id === e.target.value);
                setPeriodId(e.target.value);
                if (period) setAsAt(period.to);
              }}
              className="border rounded-xl px-3 py-2"
            >
              <option value="">Custom date</option>
              {JOURNAL_PERIODS.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-700 bg-red-50 rounded-xl p-4">{error}</p>
        )}

        {loading ? (
          <div className="py-16 text-center text-gray-500">Loading accounts…</div>
        ) : accounts.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 shadow-sm">
            <p className="text-gray-600">
              No bank accounts yet. Add them on{' '}
              <Link href="/bank/accounts" className="text-blue-600 hover:text-blue-800">
                Bank accounts
              </Link>
              , including each opening balance.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {accounts.map((account) => {
              const matched = account.difference != null && Math.abs(account.difference) < 0.005;
              return (
                <section key={account.bankAccountId} className="bg-white rounded-3xl shadow-sm p-6">
                  <div className="flex justify-between gap-4 flex-wrap items-start">
                    <div>
                      <h2 className="text-2xl font-semibold">{account.name}</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        {account.type}
                        {account.accountNumber ? ` · ${account.accountNumber}` : ''}
                        {account.openingAsAt
                          ? ` · opening ${formatAuDate(account.openingAsAt)}`
                          : ''}
                      </p>
                    </div>
                    <p
                      className={`text-sm font-medium rounded-full px-3 py-1 ${
                        account.statementBalance == null
                          ? 'bg-gray-100 text-gray-600'
                          : matched
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {account.statementBalance == null
                        ? 'Needs the statement balance'
                        : matched
                          ? 'Matches the statement'
                          : 'Out of balance'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">Opening</p>
                      <p className="text-lg font-medium mt-1">
                        {account.openingIncluded ? money(account.openingBalance) : 'Left out'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">Money in</p>
                      <p className="text-lg font-medium mt-1">{money(account.moneyIn)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">Money out</p>
                      <p className="text-lg font-medium mt-1">{money(account.moneyOut)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">
                        Books at {formatAuDate(asAt)}
                      </p>
                      <p className="text-lg font-semibold mt-1">{money(account.booksBalance)}</p>
                    </div>
                  </div>

                  {!account.openingIncluded && (
                    <p className="mt-4 text-sm text-amber-800 bg-amber-50 rounded-xl p-3">
                      The opening date is after {formatAuDate(asAt)}, so that opening balance
                      is left out of this check.
                    </p>
                  )}

                  <div className="mt-6 flex flex-wrap items-end gap-3">
                    <label className="block">
                      <span className="block text-sm text-gray-500 mb-1">
                        Statement closing balance
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={drafts[account.bankAccountId] ?? ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [account.bankAccountId]: e.target.value,
                          }))
                        }
                        placeholder="0.00"
                        className="border rounded-xl px-3 py-2 w-44"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={savingId === account.bankAccountId}
                      onClick={() => void save(account)}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-xl"
                    >
                      {savingId === account.bankAccountId ? 'Saving…' : 'Save'}
                    </button>
                    {savedId === account.bankAccountId && !loading && (
                      <span className="text-sm text-emerald-700">Saved</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    Use the closing figure on the statement. Type a minus if the account is
                    overdrawn.
                  </p>

                  {account.difference != null && (
                    <p
                      className={`mt-4 text-sm rounded-xl p-4 ${
                        matched ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'
                      }`}
                    >
                      {matched
                        ? `Books ${money(account.booksBalance)} match the statement.`
                        : gapText(account.difference)}
                    </p>
                  )}

                  {(account.linesBeforeOpening > 0 ||
                    account.linesAfterAsAt > 0 ||
                    account.undatedLines > 0) && (
                    <p className="mt-3 text-xs text-gray-500">
                      {account.linesBeforeOpening > 0
                        ? `${account.linesBeforeOpening} line${account.linesBeforeOpening === 1 ? '' : 's'} before the opening date left out. `
                        : ''}
                      {account.linesAfterAsAt > 0
                        ? `${account.linesAfterAsAt} line${account.linesAfterAsAt === 1 ? '' : 's'} after ${formatAuDate(asAt)} left out. `
                        : ''}
                      {account.undatedLines > 0
                        ? `${account.undatedLines} line${account.undatedLines === 1 ? '' : 's'} with no date left out.`
                        : ''}
                    </p>
                  )}

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-blue-700">
                      Show {account.lineCount} journal line{account.lineCount === 1 ? '' : 's'} and
                      the running balance
                    </summary>
                    {account.lines.length === 0 ? (
                      <p className="mt-3 text-sm text-gray-500">No journal lines in this window.</p>
                    ) : (
                      <div className="mt-3 overflow-x-auto max-h-96 overflow-y-auto border rounded-xl">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left p-3 font-medium">Date</th>
                              <th className="text-left p-3 font-medium">Description</th>
                              <th className="text-right p-3 font-medium">In</th>
                              <th className="text-right p-3 font-medium">Out</th>
                              <th className="text-right p-3 font-medium">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {account.lines.map((line) => (
                              <tr key={line.id || `${line.date}-${line.runningBalance}`} className="border-t">
                                <td className="p-3 whitespace-nowrap">{formatAuDate(line.date)}</td>
                                <td className="p-3">{line.description}</td>
                                <td className="p-3 text-right">
                                  {line.amount > 0 ? money(line.amount) : ''}
                                </td>
                                <td className="p-3 text-right">
                                  {line.amount < 0 ? money(Math.abs(line.amount)) : ''}
                                </td>
                                <td className="p-3 text-right font-medium">
                                  {money(line.runningBalance)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </details>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AccountingGate>
  );
}
