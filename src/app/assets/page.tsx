'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate, toIsoDateInput } from '@/lib/accounting/dates';

type AssetStatus = 'draft' | 'registered' | 'disposed';
type BookMethod = 'straight_line' | 'diminishing_value';
type AveragingMethod = 'actual_days' | 'full_month';

type FixedAsset = {
  id: string;
  number: string;
  name: string;
  assetType: string;
  status: AssetStatus;
  purchaseDate: string;
  cost: number;
  residualValue: number;
  description: string;
  bookMethod: BookMethod;
  bookRate: number;
  bookAveraging: AveragingMethod;
  bookDepreciationStartDate: string;
  bookValue: number;
  accumulatedDepreciation: number;
  lastDepreciatedTo: string | null;
  disposalDate: string | null;
  assetAccountCode: string;
  accumDepAccountCode: string;
  depExpenseAccountCode: string;
};

type DepreciationRun = {
  id: string;
  number: string;
  from: string;
  to: string;
  postedAt: string;
  journalRef: string;
  totalCharge: number;
  assetCount: number;
  alreadyPosted?: boolean;
};

type PreviewLine = {
  assetNumber: string;
  name: string;
  charge: number;
  openingBookValue: number;
  closingBookValue: number;
  days: number;
};

const TYPES = [
  'Plant & Equipment',
  'Motor Vehicles',
  'Property Improvements',
  'Fixtures & Fittings',
];

function money(n: number) {
  return (Number(n) || 0).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
  });
}

function statusClass(s: AssetStatus) {
  if (s === 'draft') return 'bg-yellow-100 text-yellow-800';
  if (s === 'registered') return 'bg-green-100 text-green-800';
  return 'bg-slate-100 text-slate-700';
}

function currentFy() {
  const now = new Date();
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 6 ? y : y - 1;
  return { from: `${startYear}-07-01`, to: `${startYear + 1}-06-30` };
}

const emptyForm = {
  name: '',
  assetType: 'Plant & Equipment',
  purchaseDate: toIsoDateInput(new Date()),
  cost: 0,
  residualValue: 0,
  description: '',
  bookMethod: 'diminishing_value' as BookMethod,
  bookRate: 20,
  bookAveraging: 'actual_days' as AveragingMethod,
  bookDepreciationStartDate: toIsoDateInput(new Date()),
};

export default function AssetsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const fy = currentFy();
  const [tab, setTab] = useState<'register' | 'run' | 'import'>('register');
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [runs, setRuns] = useState<DepreciationRun[]>([]);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [depFrom, setDepFrom] = useState(fy.from);
  const [depTo, setDepTo] = useState(fy.to);
  const [preview, setPreview] = useState<{
    lines: PreviewLine[];
    totalCharge: number;
    alreadyPosted?: boolean;
  } | null>(null);
  const [replaceImport, setReplaceImport] = useState(false);

  const load = async () => {
    const res = await fetch('/api/assets');
    const data = await res.json();
    setAssets(Array.isArray(data.assets) ? data.assets : []);
    setRuns(Array.isArray(data.runs) ? data.runs : []);
  };

  useEffect(() => {
    load().catch(() => setStatus('Failed to load assets'));
  }, []);

  const totals = useMemo(() => {
    const live = assets.filter((a) => a.status !== 'disposed');
    return {
      cost: live.reduce((s, a) => s + a.cost, 0),
      accum: live.reduce((s, a) => s + a.accumulatedDepreciation, 0),
      book: live.reduce((s, a) => s + a.bookValue, 0),
    };
  }, [assets]);

  const saveAsset = async () => {
    if (!form.name.trim()) {
      setStatus('Name is required');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      setShowForm(false);
      setForm({ ...emptyForm });
      await load();
      setStatus(`Saved ${data.asset.number}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const register = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/assets/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed');
      await load();
      setStatus(`Registered ${data.asset.number}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this draft asset?')) return;
    const res = await fetch('/api/assets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setStatus(data.error || 'Delete failed');
      return;
    }
    await load();
  };

  const runDep = async (previewOnly: boolean) => {
    if (
      !previewOnly &&
      !confirm(
        `Post depreciation ${formatAuDate(depFrom)} – ${formatAuDate(depTo)} to the ledger? Already-posted periods are skipped.`
      )
    ) {
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/assets/depreciate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: depFrom, to: depTo, preview: previewOnly }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed');
      setPreview({
        lines: data.lines || [],
        totalCharge: data.totalCharge || 0,
        alreadyPosted: data.alreadyPosted,
      });
      if (!previewOnly) {
        await load();
        setStatus(
          data.alreadyPosted
            ? `Already posted ${data.run?.number || ''} — not duplicated`
            : `Posted ${data.run?.number || 'run'} · ${money(data.totalCharge)}`
        );
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const importFile = async (file: File) => {
    setSaving(true);
    setStatus('');
    try {
      const body = new FormData();
      body.append('file', file);
      if (replaceImport) body.append('replace', 'true');
      const res = await fetch('/api/assets/import', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Import failed');
      await load();
      setStatus(
        `Imported into this account only: ${data.imported} new, ${data.updated} updated, ${data.total} in register`
      );
      setTab('register');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const field = (label: string, children: ReactNode) => (
    <div>
      <label className="block text-sm text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
  const inputCls = 'w-full border rounded-xl px-4 py-3';

  return (
    <AccountingGate section="Assets" backHref="/accounting" backLabel="← Back to Accounting">
      <div className="p-8 max-w-screen-2xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-4xl font-bold">Fixed assets</h1>
            <p className="text-gray-500 mt-2 max-w-2xl">
              Book depreciation register for this account only. Use it to get
              close to EOFY figures your accountant prepares — it does not
              replace a firm or lodge tax depreciation.
            </p>
          </div>
          <Link
            href="/reports/assets"
            className="rounded-xl bg-slate-800 text-white font-medium px-4 py-3"
          >
            Asset reports
          </Link>
        </div>

        {status ? (
          <p className="mb-4 text-sm text-slate-700 bg-slate-100 rounded-xl px-4 py-3">
            {status}
          </p>
        ) : null}

        <div className="flex gap-2 mb-6">
          {(['register', 'run', 'import'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl font-medium ${
                tab === t ? 'bg-orange-600 text-white' : 'bg-white text-slate-700'
              }`}
            >
              {t === 'register' ? 'Register' : t === 'run' ? 'Run depreciation' : 'Import'}
            </button>
          ))}
        </div>

        {tab === 'register' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <p className="text-gray-500">Cost (held)</p>
                <p className="text-2xl font-semibold mt-2">{money(totals.cost)}</p>
              </div>
              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <p className="text-gray-500">Accumulated dep</p>
                <p className="text-2xl font-semibold mt-2">{money(totals.accum)}</p>
              </div>
              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <p className="text-gray-500">Book value</p>
                <p className="text-2xl font-semibold mt-2">{money(totals.book)}</p>
              </div>
            </div>

            <div className="mb-4">
              <button
                type="button"
                onClick={() => {
                  setForm({ ...emptyForm });
                  setShowForm(true);
                }}
                className="rounded-xl bg-orange-600 text-white font-medium px-4 py-3"
              >
                Add asset
              </button>
            </div>

            {showForm && (
              <div className="bg-white rounded-3xl p-6 shadow-sm mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {field(
                  'Name',
                  <input
                    className={inputCls}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                )}
                {field(
                  'Type',
                  <select
                    className={inputCls}
                    value={form.assetType}
                    onChange={(e) => setForm({ ...form, assetType: e.target.value })}
                  >
                    {TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                )}
                {field(
                  'Purchase date',
                  <input
                    type="date"
                    className={inputCls}
                    value={form.purchaseDate}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        purchaseDate: e.target.value,
                        bookDepreciationStartDate:
                          form.bookDepreciationStartDate || e.target.value,
                      })
                    }
                  />
                )}
                {field(
                  'Cost',
                  <input
                    type="number"
                    step="0.01"
                    className={inputCls}
                    value={form.cost}
                    onChange={(e) =>
                      setForm({ ...form, cost: Number(e.target.value) || 0 })
                    }
                  />
                )}
                {field(
                  'Residual',
                  <input
                    type="number"
                    step="0.01"
                    className={inputCls}
                    value={form.residualValue}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        residualValue: Number(e.target.value) || 0,
                      })
                    }
                  />
                )}
                {field(
                  'Book method',
                  <select
                    className={inputCls}
                    value={form.bookMethod}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        bookMethod: e.target.value as BookMethod,
                      })
                    }
                  >
                    <option value="diminishing_value">Diminishing value</option>
                    <option value="straight_line">Straight line</option>
                  </select>
                )}
                {field(
                  'Book rate %',
                  <input
                    type="number"
                    step="0.01"
                    className={inputCls}
                    value={form.bookRate}
                    onChange={(e) =>
                      setForm({ ...form, bookRate: Number(e.target.value) || 0 })
                    }
                  />
                )}
                {field(
                  'Averaging',
                  <select
                    className={inputCls}
                    value={form.bookAveraging}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        bookAveraging: e.target.value as AveragingMethod,
                      })
                    }
                  >
                    <option value="actual_days">Actual days</option>
                    <option value="full_month">Full month</option>
                  </select>
                )}
                {field(
                  'Depreciation start',
                  <input
                    type="date"
                    className={inputCls}
                    value={form.bookDepreciationStartDate}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        bookDepreciationStartDate: e.target.value,
                      })
                    }
                  />
                )}
                {field(
                  'Description',
                  <input
                    className={inputCls}
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                )}
                <div className="md:col-span-2 flex gap-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveAsset}
                    className="rounded-xl bg-orange-600 text-white font-medium px-4 py-3"
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="rounded-xl bg-slate-100 px-4 py-3"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-3xl shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-500 border-b">
                  <tr>
                    <th className="px-4 py-3">No.</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Purchased</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Accum</th>
                    <th className="px-4 py-3 text-right">Book</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {assets.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                        Empty register for this account. Add an asset or import
                        your own Xero file — nothing is shared from another
                        business.
                      </td>
                    </tr>
                  ) : (
                    assets.map((a) => (
                      <tr key={a.id} className="border-t">
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/assets/${a.id}`} className="hover:underline">
                            {a.number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{a.name}</td>
                        <td className="px-4 py-3">{a.assetType}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(a.status)}`}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{formatAuDate(a.purchaseDate)}</td>
                        <td className="px-4 py-3 text-right">{money(a.cost)}</td>
                        <td className="px-4 py-3 text-right">
                          {money(a.accumulatedDepreciation)}
                        </td>
                        <td className="px-4 py-3 text-right">{money(a.bookValue)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {a.status === 'draft' ? (
                            <>
                              <button
                                type="button"
                                className="text-orange-700 hover:underline mr-3"
                                onClick={() => register(a.id)}
                              >
                                Register
                              </button>
                              <button
                                type="button"
                                className="text-red-600 hover:underline"
                                onClick={() => remove(a.id)}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <Link href={`/assets/${a.id}`} className="hover:underline">
                              Open
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'run' && (
          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <p className="text-gray-600 mb-4">
              Posts Dr depreciation expense / Cr accumulated depreciation for
              registered assets not yet run through the end date. Use 1 Jul –
              30 Jun for EOFY.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mb-4">
              {field(
                'From',
                <input
                  type="date"
                  className={inputCls}
                  value={depFrom}
                  onChange={(e) => setDepFrom(e.target.value)}
                />
              )}
              {field(
                'To',
                <input
                  type="date"
                  className={inputCls}
                  value={depTo}
                  onChange={(e) => setDepTo(e.target.value)}
                />
              )}
            </div>
            <div className="flex gap-3 mb-6">
              <button
                type="button"
                disabled={saving}
                onClick={() => runDep(true)}
                className="rounded-xl bg-slate-100 px-4 py-3 font-medium"
              >
                Preview
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => runDep(false)}
                className="rounded-xl bg-orange-600 text-white px-4 py-3 font-medium"
              >
                Post to ledger
              </button>
            </div>
            {preview ? (
              <div className="overflow-x-auto mb-8">
                {preview.alreadyPosted ? (
                  <p className="text-sm text-amber-800 mb-2">
                    This period was already posted — preview only.
                  </p>
                ) : null}
                <table className="min-w-full text-sm">
                  <thead className="text-left text-gray-500 border-b">
                    <tr>
                      <th className="py-2">Asset</th>
                      <th className="py-2">Days</th>
                      <th className="py-2 text-right">Opening</th>
                      <th className="py-2 text-right">Charge</th>
                      <th className="py-2 text-right">Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((l) => (
                      <tr key={l.assetNumber} className="border-t">
                        <td className="py-2">
                          {l.assetNumber} {l.name}
                        </td>
                        <td className="py-2">{l.days}</td>
                        <td className="py-2 text-right">
                          {money(l.openingBookValue)}
                        </td>
                        <td className="py-2 text-right">{money(l.charge)}</td>
                        <td className="py-2 text-right">
                          {money(l.closingBookValue)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t font-semibold">
                      <td className="py-2" colSpan={3}>
                        Total
                      </td>
                      <td className="py-2 text-right">{money(preview.totalCharge)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
            <h2 className="text-xl font-semibold mb-3">Run history</h2>
            {runs.length === 0 ? (
              <p className="text-gray-500">No depreciation posted yet.</p>
            ) : (
              <ul className="space-y-2">
                {runs.map((r) => (
                  <li key={r.id} className="text-sm">
                    <span className="font-medium">{r.number}</span> ·{' '}
                    {formatAuDate(r.from)} – {formatAuDate(r.to)} ·{' '}
                    {money(r.totalCharge)} · {r.assetCount} assets · {r.journalRef}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'import' && (
          <div className="bg-white rounded-3xl p-6 shadow-sm max-w-2xl">
            <p className="text-gray-600 mb-4">
              Upload a Xero Assets export (xlsx or csv). Rows are written only
              to <strong>this signed-in account</strong>. A new user starts
              empty and imports their own file — hotel figures are not a
              product default.
            </p>
            <label className="flex items-center gap-2 mb-4 text-sm">
              <input
                type="checkbox"
                checked={replaceImport}
                onChange={(e) => setReplaceImport(e.target.checked)}
              />
              Replace this account&apos;s register (does not touch other users)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.tsv"
              disabled={saving}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importFile(file);
              }}
            />
          </div>
        )}
      </div>
    </AccountingGate>
  );
}
