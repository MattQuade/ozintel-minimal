'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  serialNumber: string;
  bookMethod: BookMethod;
  bookRate: number;
  bookAveraging: AveragingMethod;
  bookDepreciationStartDate: string;
  openingAccumulatedDep: number;
  taxMethod: BookMethod | null;
  taxRate: number | null;
  bookValue: number;
  accumulatedDepreciation: number;
  lastDepreciatedTo: string | null;
  disposalDate: string | null;
  disposalProceeds: number | null;
  assetAccountCode: string;
  accumDepAccountCode: string;
  depExpenseAccountCode: string;
};

type Bank = { id: string; name: string };

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

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || '');
  const [asset, setAsset] = useState<FixedAsset | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [disposalDate, setDisposalDate] = useState(toIsoDateInput(new Date()));
  const [proceeds, setProceeds] = useState(0);
  const [bankAccountId, setBankAccountId] = useState('');

  const load = async () => {
    const [assetRes, bankRes] = await Promise.all([
      fetch('/api/assets'),
      fetch('/api/bank-accounts'),
    ]);
    const data = await assetRes.json();
    const list: FixedAsset[] = Array.isArray(data.assets) ? data.assets : [];
    const found = list.find((a) => a.id === id) || null;
    setAsset(found);
    const bankJson = await bankRes.json().catch(() => []);
    setBanks(Array.isArray(bankJson) ? bankJson : bankJson.accounts || []);
  };

  useEffect(() => {
    if (id) load().catch(() => setStatus('Failed to load asset'));
  }, [id]);

  const save = async () => {
    if (!asset) return;
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asset),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      setAsset(data.asset);
      setStatus('Saved');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const register = async () => {
    const res = await fetch('/api/assets/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setStatus(data.error || 'Register failed');
      return;
    }
    setAsset(data.asset);
    setStatus(`Registered ${data.asset.number}`);
  };

  const dispose = async () => {
    if (
      !confirm(
        'Dispose this asset? Depreciation stops and a disposal journal is posted.'
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/assets/dispose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          disposalDate,
          proceeds,
          bankAccountId: bankAccountId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed');
      setAsset(data.asset);
      setStatus('Disposed');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
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
    <AccountingGate section="Assets" backHref="/assets" backLabel="← Back to assets">
      <div className="p-8 max-w-4xl mx-auto">
        {!asset ? (
          <p className="text-gray-500">Loading…</p>
        ) : (
          <>
            <h1 className="text-4xl font-bold mb-1">
              {asset.number} {asset.name}
            </h1>
            <p className="text-gray-500 mb-6 capitalize">{asset.status}</p>
            {status ? (
              <p className="mb-4 text-sm bg-slate-100 rounded-xl px-4 py-3">{status}</p>
            ) : null}

            <div className="bg-white rounded-3xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {field(
                'Name',
                <input
                  className={inputCls}
                  value={asset.name}
                  onChange={(e) => setAsset({ ...asset, name: e.target.value })}
                />
              )}
              {field(
                'Type',
                <select
                  className={inputCls}
                  value={asset.assetType}
                  onChange={(e) => setAsset({ ...asset, assetType: e.target.value })}
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
                  value={asset.purchaseDate}
                  onChange={(e) =>
                    setAsset({ ...asset, purchaseDate: e.target.value })
                  }
                />
              )}
              {field(
                'Cost',
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  value={asset.cost}
                  onChange={(e) =>
                    setAsset({ ...asset, cost: Number(e.target.value) || 0 })
                  }
                />
              )}
              {field(
                'Residual',
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  value={asset.residualValue}
                  onChange={(e) =>
                    setAsset({
                      ...asset,
                      residualValue: Number(e.target.value) || 0,
                    })
                  }
                />
              )}
              {field(
                'Book method',
                <select
                  className={inputCls}
                  value={asset.bookMethod}
                  onChange={(e) =>
                    setAsset({
                      ...asset,
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
                  value={asset.bookRate}
                  onChange={(e) =>
                    setAsset({ ...asset, bookRate: Number(e.target.value) || 0 })
                  }
                />
              )}
              {field(
                'Averaging',
                <select
                  className={inputCls}
                  value={asset.bookAveraging}
                  onChange={(e) =>
                    setAsset({
                      ...asset,
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
                  value={asset.bookDepreciationStartDate}
                  onChange={(e) =>
                    setAsset({
                      ...asset,
                      bookDepreciationStartDate: e.target.value,
                    })
                  }
                />
              )}
              {field(
                'Description',
                <input
                  className={inputCls}
                  value={asset.description}
                  onChange={(e) =>
                    setAsset({ ...asset, description: e.target.value })
                  }
                />
              )}
              {field(
                'Asset account',
                <input
                  className={inputCls}
                  value={asset.assetAccountCode}
                  onChange={(e) =>
                    setAsset({ ...asset, assetAccountCode: e.target.value })
                  }
                />
              )}
              {field(
                'Accum dep account',
                <input
                  className={inputCls}
                  value={asset.accumDepAccountCode}
                  onChange={(e) =>
                    setAsset({ ...asset, accumDepAccountCode: e.target.value })
                  }
                />
              )}
              {field(
                'Dep expense account',
                <input
                  className={inputCls}
                  value={asset.depExpenseAccountCode}
                  onChange={(e) =>
                    setAsset({ ...asset, depExpenseAccountCode: e.target.value })
                  }
                />
              )}
              <div className="md:col-span-2 text-sm text-gray-600">
                Book value {money(asset.bookValue)} · Accum{' '}
                {money(asset.accumulatedDepreciation)}
                {asset.lastDepreciatedTo
                  ? ` · Last run ${formatAuDate(asset.lastDepreciatedTo)}`
                  : ''}
                {asset.taxMethod
                  ? ` · Tax ${asset.taxMethod.replace('_', ' ')} ${asset.taxRate ?? ''}%`
                  : ''}
              </div>
              <div className="md:col-span-2 flex gap-3">
                <button
                  type="button"
                  disabled={saving || asset.status === 'disposed'}
                  onClick={save}
                  className="rounded-xl bg-orange-600 text-white font-medium px-4 py-3"
                >
                  Save
                </button>
                {asset.status === 'draft' ? (
                  <button
                    type="button"
                    onClick={register}
                    className="rounded-xl bg-slate-800 text-white font-medium px-4 py-3"
                  >
                    Register
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => router.push('/assets')}
                  className="rounded-xl bg-slate-100 px-4 py-3"
                >
                  Close
                </button>
              </div>
            </div>

            {asset.status === 'registered' ? (
              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4">Dispose</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  {field(
                    'Disposal date',
                    <input
                      type="date"
                      className={inputCls}
                      value={disposalDate}
                      onChange={(e) => setDisposalDate(e.target.value)}
                    />
                  )}
                  {field(
                    'Proceeds',
                    <input
                      type="number"
                      step="0.01"
                      className={inputCls}
                      value={proceeds}
                      onChange={(e) => setProceeds(Number(e.target.value) || 0)}
                    />
                  )}
                  {field(
                    'Bank (optional)',
                    <select
                      className={inputCls}
                      value={bankAccountId}
                      onChange={(e) => setBankAccountId(e.target.value)}
                    >
                      <option value="">Suspense if proceeds entered</option>
                      {banks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={dispose}
                  className="rounded-xl bg-red-700 text-white font-medium px-4 py-3"
                >
                  Dispose and post journals
                </button>
              </div>
            ) : null}

            {asset.status === 'disposed' ? (
              <p className="text-gray-600">
                Disposed {formatAuDate(asset.disposalDate)}
                {asset.disposalProceeds != null
                  ? ` · proceeds ${money(asset.disposalProceeds)}`
                  : ''}
              </p>
            ) : null}
          </>
        )}
      </div>
    </AccountingGate>
  );
}
