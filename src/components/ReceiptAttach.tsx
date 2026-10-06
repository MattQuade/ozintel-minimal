'use client';

import { useRef, useState } from 'react';
import {
  prepareReceiptFile,
  RECEIPT_MAX_BYTES,
} from '@/lib/client/compressReceiptImage';
import { postReceiptUpload } from '@/lib/client/postReceiptUpload';
import { receiptMatchesSearch } from '@/lib/client/receiptSearch';
import { parseLooseIsoDate } from '@/lib/accounting/receiptCaption';

export type ReceiptInfo = {
  id: string;
  originalFilename?: string;
  mimeType?: string;
  url: string;
};

type Props = {
  /** Current receipt ids (controlled). */
  receiptIds: string[];
  onChange: (ids: string[]) => void;
  /** When set, upload links the receipt to this ledger entry immediately. */
  ledgerEntryId?: string;
  /** Journal amount, so the receipts list can lead with the same dollars. */
  suggestAmount?: number;
  /** Journal date, so a docket from the day before sorts next to this line. */
  suggestDate?: string;
  /** Compact layout for table rows / edit modals. */
  compact?: boolean;
  className?: string;
  label?: string;
};

const ACCEPT =
  'image/*,.pdf,image/heic,image/heif,application/pdf';

const MAX_MB = Math.round(RECEIPT_MAX_BYTES / (1024 * 1024));

async function deleteReceiptOnServer(id: string) {
  await fetch(`/api/ledger/receipts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

type SiloReceipt = {
  id: string;
  caption?: string;
  captionAlias?: string;
  captionAmount?: number;
  uploadedAt?: string;
  originalFilename?: string;
  url: string;
  docket?: {
    vendor?: string;
    date?: string;
    invoiceReceiptId?: string;
    subtotal?: number | null;
    total?: number | null;
    amountPaid?: number | null;
    lineItems?: Array<{ description?: string; amount?: number | null }>;
  } | null;
};

function receiptMoney(amount?: number | null) {
  if (amount == null || !Number.isFinite(amount)) return '';
  return amount.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function siloAmount(r: SiloReceipt): number | null {
  const n = r.captionAmount ?? r.docket?.amountPaid ?? r.docket?.total;
  return n != null && Number.isFinite(Number(n)) ? Math.abs(Number(n)) : null;
}

function amountsClose(a: number, b: number) {
  return Math.abs(Math.round(a * 100) - Math.round(Math.abs(b) * 100)) <= 1;
}

function siloLabel(r: SiloReceipt) {
  const vendor = String(r.docket?.vendor || '').trim();
  if (vendor) return vendor;
  if (r.caption?.trim()) return r.caption.trim();
  if (r.captionAlias && r.captionAmount != null) {
    return `${r.captionAlias} ${r.captionAmount}`;
  }
  return r.originalFilename || 'Receipt';
}

function amountQuery(n: number) {
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  return fixed.endsWith('.00') ? String(Math.round(abs)) : fixed;
}

export default function ReceiptAttach({
  receiptIds,
  onChange,
  ledgerEntryId,
  suggestAmount,
  suggestDate,
  compact = false,
  className = '',
  label = 'Receipt',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'idle' | 'compressing' | 'uploading'>(
    'idle'
  );
  const [error, setError] = useState('');
  const [siloOpen, setSiloOpen] = useState(false);
  const [siloLoading, setSiloLoading] = useState(false);
  const [siloReceipts, setSiloReceipts] = useState<SiloReceipt[]>([]);
  const [siloQuery, setSiloQuery] = useState('');
  const [linkingId, setLinkingId] = useState('');
  const busy = phase !== 'idle';

  const openSilo = async () => {
    const next = !siloOpen;
    setSiloOpen(next);
    setError('');
    if (!next) return;
    if (!siloQuery && suggestAmount != null && Math.abs(suggestAmount) > 0) {
      setSiloQuery(amountQuery(suggestAmount));
    }
    setSiloLoading(true);
    try {
      const res = await fetch('/api/ledger/receipts?inbox=1', {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not load receipts');
      }
      setSiloReceipts(Array.isArray(data.receipts) ? data.receipts : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load receipts');
      setSiloReceipts([]);
    } finally {
      setSiloLoading(false);
    }
  };

  const attachFromSilo = async (receipt: SiloReceipt) => {
    if (!ledgerEntryId || linkingId) return;
    setLinkingId(receipt.id);
    setError('');
    try {
      const res = await fetch('/api/ledger/receipts/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptId: receipt.id,
          ledgerEntryId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not attach receipt');
      }
      if (!receiptIds.includes(receipt.id)) {
        onChange([...receiptIds, receipt.id]);
      }
      setSiloReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach receipt');
    } finally {
      setLinkingId('');
    }
  };

  const visibleSilo = siloReceipts
    .filter((r) => !receiptIds.includes(r.id))
    .filter((r) => receiptMatchesSearch(r, siloQuery))
    .slice()
    .sort((a, b) => {
      const aAmt = siloAmount(a);
      const bAmt = siloAmount(b);
      const aSame =
        suggestAmount != null && aAmt != null && amountsClose(aAmt, suggestAmount)
          ? 0
          : 1;
      const bSame =
        suggestAmount != null && bAmt != null && amountsClose(bAmt, suggestAmount)
          ? 0
          : 1;
      if (aSame !== bSame) return aSame - bSame;
      const journalDay = parseLooseIsoDate(suggestDate);
      const gap = (r: SiloReceipt) => {
        const day = parseLooseIsoDate(r.docket?.date);
        if (!day || !journalDay) return 9999;
        const ms =
          Date.parse(`${journalDay}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`);
        return Math.abs(Math.round(ms / 86400000));
      };
      const dateGap = gap(a) - gap(b);
      if (dateGap !== 0) return dateGap;
      return Date.parse(b.uploadedAt || '') - Date.parse(a.uploadedAt || '');
    });

  const uploadFile = async (file: File) => {
    setPhase('compressing');
    setError('');
    try {
      const prepared = await prepareReceiptFile(file, (status) => {
        setPhase(status === 'compressing' ? 'compressing' : 'uploading');
      });
      setPhase('uploading');
      const { id } = await postReceiptUpload({
        file: prepared,
        ledgerEntryId,
      });
      if (!receiptIds.includes(id)) {
        onChange([...receiptIds, id]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setPhase('idle');
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeReceipt = async (id: string) => {
    if (
      !confirm(
        'Remove this receipt photo only? The transaction entry will stay.'
      )
    ) {
      return;
    }
    try {
      await deleteReceiptOnServer(id);
    } catch {
      // still remove from local list
    }
    onChange(receiptIds.filter((x) => x !== id));
  };

  const statusLabel =
    phase === 'compressing'
      ? 'Compressing…'
      : phase === 'uploading'
        ? 'Uploading…'
        : null;

  return (
    <div className={className}>
      {!compact && (
        <label className="block text-sm text-gray-500 mb-1">{label}</label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadFile(file);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={
            compact
              ? 'text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 min-h-[36px]'
              : 'border border-gray-300 rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50'
          }
        >
          {statusLabel
            ? statusLabel
            : compact
              ? receiptIds.length
                ? 'Add another'
                : 'Attach receipt'
              : '📷 Attach / capture receipt'}
        </button>
        {ledgerEntryId && (
          <button
            type="button"
            onClick={() => void openSilo()}
            className={
              compact
                ? 'text-sm text-blue-600 hover:text-blue-800 font-medium min-h-[36px]'
                : 'border border-gray-300 rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-50'
            }
          >
            {siloOpen ? 'Hide receipts' : 'From receipts'}
          </button>
        )}
        {receiptIds.length > 0 && (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
            Receipt attached
            {receiptIds.length > 1 ? ` (${receiptIds.length})` : ''}
          </span>
        )}
      </div>

      {receiptIds.length > 0 && (
        <ul className={`flex flex-wrap gap-3 ${compact ? 'mt-2' : 'mt-3'}`}>
          {receiptIds.map((id) => {
            const url = `/api/ledger/receipts/${encodeURIComponent(id)}`;
            return (
              <li
                key={id}
                className="relative border border-gray-200 rounded-xl overflow-hidden bg-gray-50"
              >
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  title="View / download receipt"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Receipt"
                    className="h-16 w-16 object-cover"
                    onError={(e) => {
                      const el = e.currentTarget;
                      el.style.display = 'none';
                      const sib = el.nextElementSibling as HTMLElement | null;
                      if (sib) sib.classList.remove('hidden');
                    }}
                  />
                  <span className="hidden h-16 w-16 flex items-center justify-center text-xs text-gray-600 p-1 text-center">
                    PDF / file
                  </span>
                </a>
                <button
                  type="button"
                  onClick={() => void removeReceipt(id)}
                  className="absolute -top-1 -right-1 flex items-center justify-center min-w-[28px] min-h-[28px] bg-white border border-red-200 text-red-600 rounded-full text-sm font-bold shadow-sm hover:bg-red-50"
                  title="Remove receipt photo only"
                  aria-label="Remove receipt photo"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {siloOpen && ledgerEntryId && (
        <div className={`border border-gray-200 rounded-xl bg-white ${compact ? 'mt-2' : 'mt-3'}`}>
          <div className="p-3 border-b border-gray-100">
            <input
              type="search"
              value={siloQuery}
              onChange={(e) => setSiloQuery(e.target.value)}
              placeholder="Supplier and amount, e.g. Deanos 285"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          {siloLoading ? (
            <p className="p-3 text-sm text-gray-500">Loading receipts…</p>
          ) : visibleSilo.length === 0 ? (
            <p className="p-3 text-sm text-gray-500">
              {siloReceipts.length === 0
                ? 'No photos are waiting in Receipts.'
                : 'No receipts match that supplier and amount.'}
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100">
              {visibleSilo.map((receipt) => {
                const amount = siloAmount(receipt);
                const same =
                  suggestAmount != null &&
                  amount != null &&
                  amountsClose(amount, suggestAmount);
                return (
                  <li key={receipt.id} className="flex items-center gap-3 p-3">
                    <a
                      href={receipt.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0"
                      title="View receipt"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={receipt.url}
                        alt=""
                        className="h-14 w-14 object-cover rounded-lg bg-gray-50"
                      />
                    </a>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {siloLabel(receipt)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {amount != null ? receiptMoney(amount) : 'Amount unknown'}
                        {receipt.docket?.date ? ` · ${receipt.docket.date}` : ''}
                      </p>
                      {same && (
                        <p className="text-xs font-medium text-emerald-700">
                          Same amount as this journal line
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={linkingId === receipt.id}
                      onClick={() => void attachFromSilo(receipt)}
                      className="shrink-0 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg px-3 py-2"
                    >
                      {linkingId === receipt.id ? 'Attaching…' : 'Attach'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!compact && (
        <p className="mt-1 text-xs text-gray-400">
          Phone camera or file · JPEG, PNG, WebP, HEIC, PDF · photos compressed
          to ~1280px / quality 0.1 for ATO-readable proof
          before upload · max {MAX_MB}MB
        </p>
      )}
    </div>
  );
}

/** Badge for list rows — optional onChange enables Remove (receipt only). */
export function ReceiptBadge({
  receiptIds,
  onChange,
}: {
  receiptIds?: string[] | null;
  /** When provided, shows a Remove control that DELETEs the receipt file only. */
  onChange?: (ids: string[]) => void;
}) {
  const ids = Array.isArray(receiptIds)
    ? receiptIds.filter((x) => typeof x === 'string' && x.trim())
    : [];
  if (ids.length === 0) return null;

  const remove = async (id: string) => {
    if (
      !confirm(
        'Remove this receipt photo only? The transaction entry will stay.'
      )
    ) {
      return;
    }
    try {
      await deleteReceiptOnServer(id);
    } catch {
      // still update UI
    }
    onChange?.(ids.filter((x) => x !== id));
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {ids.map((id) => (
        <span
          key={id}
          className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg pl-2 pr-0.5 py-0.5"
        >
          <a
            href={`/api/ledger/receipts/${encodeURIComponent(id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-emerald-900 py-1"
            title="View receipt"
            onClick={(e) => e.stopPropagation()}
          >
            📎 Receipt
          </a>
          {onChange && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void remove(id);
              }}
              className="inline-flex items-center justify-center min-w-[28px] min-h-[28px] text-red-600 hover:bg-red-50 rounded-md font-bold"
              title="Remove receipt photo only"
              aria-label="Remove receipt photo"
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!onChange && ids.length > 1 && (
        <span className="text-xs text-emerald-700">×{ids.length}</span>
      )}
    </span>
  );
}
