'use client';

import { useRef, useState } from 'react';

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

export default function ReceiptAttach({
  receiptIds,
  onChange,
  ledgerEntryId,
  compact = false,
  className = '',
  label = 'Receipt',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
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
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeReceipt = async (id: string) => {
    // Detach from UI; delete file only when confirmed (keeps orphan cleanup optional)
    if (!confirm('Remove this receipt attachment?')) return;
    try {
      await fetch(`/api/ledger/receipts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch {
      // still remove from local list
    }
    onChange(receiptIds.filter((x) => x !== id));
  };

  return (
    <div className={className}>
      {!compact && (
        <label className="block text-sm text-gray-500 mb-1">{label}</label>
      )}
      <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : ''}`}>
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
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={
            compact
              ? 'text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50'
              : 'border border-gray-300 rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50'
          }
        >
          {uploading
            ? 'Uploading…'
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
                className="relative group border border-gray-200 rounded-xl overflow-hidden bg-gray-50"
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
                  className="absolute top-0.5 right-0.5 bg-white/90 text-red-600 rounded-full w-5 h-5 text-xs leading-none shadow"
                  title="Remove"
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
          Phone camera or file · JPEG, PNG, WebP, HEIC, PDF · max 12MB
        </p>
      )}
    </div>
  );
}

/** Small badge for list rows when an entry has receipts. */
export function ReceiptBadge({
  receiptIds,
}: {
  receiptIds?: string[] | null;
}) {
  const count = Array.isArray(receiptIds) ? receiptIds.length : 0;
  if (count === 0) return null;
  const first = receiptIds![0];
  return (
    <a
      href={`/api/ledger/receipts/${encodeURIComponent(first)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg"
      title="View receipt"
      onClick={(e) => e.stopPropagation()}
    >
      📎 Receipt{count > 1 ? ` ×${count}` : ''}
    </a>
  );
}
