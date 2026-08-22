'use client';

import { useCallback, useEffect, useState } from 'react';
import AccountingGate from '@/components/AccountingGate';
import ReceiptCropEditor from '@/components/ReceiptCropEditor';
import {
  exportCroppedJpeg,
  FULL_CROP,
  type CropRectNorm,
} from '@/lib/client/cropImage';
import { prepareReceiptFile } from '@/lib/client/compressReceiptImage';

type ReceiptRow = {
  id: string;
  caption?: string;
  captionAlias?: string;
  captionAmount?: number;
  uploadedAt: string;
  originalFilename: string;
  mimeType: string;
  linked: boolean;
  ledgerEntryIds: string[];
  url: string;
};

function formatWhen(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatAmount(amount?: number) {
  if (amount == null || !Number.isFinite(amount)) return '';
  return amount.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
  });
}

function ReceiptsLedger() {
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'inbox' | 'linked'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<ReceiptRow | null>(null);
  const [crop, setCrop] = useState<CropRectNorm>(FULL_CROP);
  const [cropSaving, setCropSaving] = useState(false);
  const [cropError, setCropError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ledger/receipts?all=1', {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load receipts');
      }
      setReceipts(Array.isArray(data.receipts) ? data.receipts : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load receipts');
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteReceipt = async (r: ReceiptRow) => {
    const label =
      r.caption ||
      (r.captionAlias && r.captionAmount != null
        ? `${r.captionAlias} ${r.captionAmount}`
        : r.originalFilename || 'this receipt');
    if (!window.confirm(`Delete receipt "${label}"? This cannot be undone.`)) {
      return;
    }
    setDeletingId(r.id);
    setError('');
    try {
      const res = await fetch(
        `/api/ledger/receipts/${encodeURIComponent(r.id)}`,
        {
          method: 'DELETE',
          credentials: 'include',
          cache: 'no-store',
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Delete failed');
      }
      setReceipts((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const openRecrop = (r: ReceiptRow) => {
    if (!(r.mimeType || '').startsWith('image/')) {
      setError('Only image receipts can be re-cropped (not PDFs).');
      return;
    }
    setCrop(FULL_CROP);
    setCropError('');
    setCropTarget(r);
  };

  const saveRecrop = async () => {
    if (!cropTarget) return;
    setCropSaving(true);
    setCropError('');
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () =>
          reject(new Error('Could not load receipt image for crop'));
        // Bust cache so we always crop the current file
        img.src = `${cropTarget.url}${cropTarget.url.includes('?') ? '&' : '?'}crop=${Date.now()}`;
      });
      const cropped = await exportCroppedJpeg({
        source: img,
        crop,
        fileName: cropTarget.originalFilename || 'receipt',
      });
      const prepared = await prepareReceiptFile(cropped);
      const form = new FormData();
      form.append('file', prepared);
      const res = await fetch(
        `/api/ledger/receipts/${encodeURIComponent(cropTarget.id)}`,
        {
          method: 'PUT',
          body: form,
          credentials: 'include',
          cache: 'no-store',
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save crop');
      }
      const updated = data.receipt as ReceiptRow;
      setReceipts((prev) =>
        prev.map((r) =>
          r.id === cropTarget.id
            ? {
                ...r,
                ...updated,
                url: updated.url || `${r.url.split('?')[0]}?v=${Date.now()}`,
              }
            : r
        )
      );
      setCropTarget(null);
    } catch (err) {
      setCropError(err instanceof Error ? err.message : 'Failed to save crop');
    } finally {
      setCropSaving(false);
    }
  };

  const visible = receipts.filter((r) => {
    if (filter === 'inbox') return !r.linked;
    if (filter === 'linked') return r.linked;
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Receipts</h1>
        <p className="text-slate-600 mt-1">
          Photos captured from the home screen, with their captions. Use{' '}
          <strong>Recrop</strong> on desktop to trim wasted space.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {(
          [
            ['all', 'All'],
            ['inbox', 'Waiting for bank'],
            ['linked', 'Matched'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border ${
              filter === key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading receipts…</p>
      ) : error ? (
        <p className="text-red-600 mb-4">{error}</p>
      ) : null}

      {!loading && !error && visible.length === 0 ? (
        <p className="text-slate-500">
          No receipts yet. Capture one from the Alerts home page, then refresh
          here.
        </p>
      ) : null}

      {!loading && visible.length > 0 ? (
        <ul className="divide-y divide-slate-200 border-t border-b border-slate-200 bg-white">
          {visible.map((r) => {
            const isImage = (r.mimeType || '').startsWith('image/');
            const caption =
              r.caption ||
              (r.captionAlias && r.captionAmount != null
                ? `${r.captionAlias} ${r.captionAmount}`
                : r.originalFilename || 'Untitled receipt');
            const busy = deletingId === r.id;
            return (
              <li key={r.id} className="flex gap-4 py-4 items-start">
                <div className="shrink-0 flex flex-col items-center gap-2">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-20 h-20 rounded-md overflow-hidden bg-slate-100 border border-slate-200"
                    title="Open receipt"
                  >
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.url}
                        alt={caption}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-slate-500 px-1 text-center">
                        PDF
                      </span>
                    )}
                  </a>
                  {isImage ? (
                    <button
                      type="button"
                      disabled={deletingId !== null || cropSaving}
                      onClick={() => openRecrop(r)}
                      className="px-2.5 py-1 text-xs font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Recrop
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || deletingId !== null}
                    onClick={() => void deleteReceipt(r)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {busy ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 text-lg leading-tight">
                    {caption}
                  </p>
                  {r.captionAmount != null ? (
                    <p className="text-slate-800 mt-0.5">
                      {formatAmount(r.captionAmount)}
                      {r.captionAlias ? (
                        <span className="text-slate-500 font-normal">
                          {' '}
                          · {r.captionAlias}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  <p className="text-sm text-slate-500 mt-1">
                    {formatWhen(r.uploadedAt)}
                  </p>
                  <p className="text-sm mt-1">
                    {r.linked ? (
                      <span className="text-emerald-700">
                        Matched to bank entry
                      </span>
                    ) : (
                      <span className="text-amber-700">
                        Waiting for CSV match
                      </span>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {cropTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.65)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Recrop receipt"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-auto p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Recrop receipt
                </h2>
                <p className="text-sm text-slate-600">
                  {cropTarget.caption || cropTarget.originalFilename}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !cropSaving && setCropTarget(null)}
                className="text-slate-500 hover:text-slate-800 text-sm font-medium"
              >
                Close
              </button>
            </div>
            <ReceiptCropEditor
              key={cropTarget.id + cropTarget.url}
              src={`${cropTarget.url}${cropTarget.url.includes('?') ? '&' : '?'}edit=1`}
              initialCrop={FULL_CROP}
              theme="light"
              onCropChange={setCrop}
            />
            {cropError ? (
              <p className="text-red-600 text-sm mt-3">{cropError}</p>
            ) : null}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                disabled={cropSaving}
                onClick={() => setCropTarget(null)}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={cropSaving}
                onClick={() => void saveRecrop()}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {cropSaving ? 'Saving…' : 'Save crop'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AccountingReceiptsPage() {
  return (
    <AccountingGate section="Receipts">
      <ReceiptsLedger />
    </AccountingGate>
  );
}
