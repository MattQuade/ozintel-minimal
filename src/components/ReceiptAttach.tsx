'use client';

import { useRef, useState } from 'react';
import {
  prepareReceiptFile,
  RECEIPT_MAX_BYTES,
} from '@/lib/client/compressReceiptImage';

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

export default function ReceiptAttach({
  receiptIds,
  onChange,
  ledgerEntryId,
  compact = false,
  className = '',
  label = 'Receipt',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'idle' | 'compressing' | 'uploading'>(
    'idle'
  );
  const [error, setError] = useState('');
  const busy = phase !== 'idle';

  const uploadFile = async (file: File) => {
    setPhase('compressing');
    setError('');
    try {
      const prepared = await prepareReceiptFile(file, (status) => {
        setPhase(status === 'compressing' ? 'compressing' : 'uploading');
      });
      setPhase('uploading');
      const form = new FormData();
      form.append('file', prepared);
      if (ledgerEntryId) form.append('ledgerEntryId', ledgerEntryId);
      const res = await fetch('/api/ledger/receipts', {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Upload failed');
      }
      const id = String(data.receipt?.id || '');
      if (!id) throw new Error('No receipt id returned');
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

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!compact && (
        <p className="mt-1 text-xs text-gray-400">
          Phone camera or file · JPEG, PNG, WebP, HEIC, PDF · photos compressed
          to ~1280px / quality 0.09 for ATO-readable proof
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
