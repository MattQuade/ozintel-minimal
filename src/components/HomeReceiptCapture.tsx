'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { checkAccountingAccess } from '@/lib/accounting/access';
import { prepareReceiptFile } from '@/lib/client/compressReceiptImage';
import { parseReceiptCaption } from '@/lib/accounting/receiptCaption';

type InboxReceipt = {
  id: string;
  caption?: string;
  captionAmount?: number;
  uploadedAt?: string;
  url: string;
};

const homeControlStyle: CSSProperties = {
  width: '90%',
  maxWidth: '400px',
  boxSizing: 'border-box',
};

export default function HomeReceiptCapture() {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [inbox, setInbox] = useState<InboxReceipt[]>([]);

  const loadInbox = () =>
    fetch('/api/ledger/receipts?inbox=1')
      .then((r) => r.json())
      .then((d) => {
        setInbox(Array.isArray(d.receipts) ? d.receipts : []);
      })
      .catch(() => {});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await checkAccountingAccess();
      if (cancelled) return;
      setAllowed(ok);
      if (ok) await loadInbox();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!photoFile) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  if (!allowed) return null;

  const parsed = parseReceiptCaption(caption);

  const save = async () => {
    if (!photoFile) {
      setStatus('Take a photo first.');
      return;
    }
    if (!parsed) {
      setStatus('Caption like ww 79.13');
      return;
    }
    setSaving(true);
    setStatus('Saving…');
    try {
      const prepared = await prepareReceiptFile(photoFile);
      const form = new FormData();
      form.append('file', prepared);
      form.append('caption', parsed.display);
      const res = await fetch('/api/ledger/receipts', {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Save failed');
      }
      setPhotoFile(null);
      setCaption('');
      if (photoInputRef.current) photoInputRef.current.value = '';
      setStatus(`Saved ${parsed.display} — waiting for CSV`);
      await loadInbox();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/ledger/receipts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    await loadInbox();
  };

  return (
    <div
      style={{
        ...homeControlStyle,
        background: '#1e2937',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: 16,
        textAlign: 'left',
      }}
    >
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
        style={{ display: 'none' }}
        aria-hidden
      />
      <button
        type="button"
        onClick={() => photoInputRef.current?.click()}
        style={{
          width: '100%',
          padding: '16px 20px',
          fontSize: '1.15rem',
          border: 'none',
          borderRadius: 10,
          cursor: 'pointer',
          background: '#ea580c',
          color: 'white',
          fontWeight: 700,
        }}
      >
        Capture receipt
      </button>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '10px 0 8px' }}>
        Photo stays in OzIntel. Caption the total, e.g. ww 79.13. CSV import
        attaches it — no extra step.
      </p>
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Receipt preview"
          style={{
            width: '100%',
            maxHeight: 220,
            objectFit: 'cover',
            borderRadius: 8,
            marginBottom: 8,
          }}
        />
      ) : null}
      <input
        type="text"
        inputMode="text"
        autoCapitalize="none"
        autoCorrect="off"
        placeholder="ww 79.13"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: 12,
          borderRadius: 8,
          border: '1px solid #475569',
          background: '#0f172a',
          color: 'white',
          fontSize: '1.05rem',
          marginBottom: 8,
        }}
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: '#22c55e',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Saving…' : 'Save to inbox'}
      </button>
      {status ? (
        <p style={{ color: '#cbd5e1', fontSize: '0.85rem', margin: '8px 0 0' }}>
          {status}
        </p>
      ) : null}
      {inbox.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <p
            style={{
              color: '#fbbf24',
              fontSize: '0.85rem',
              fontWeight: 700,
              margin: '0 0 8px',
            }}
          >
            Waiting for CSV ({inbox.length})
          </p>
          {inbox.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.url}
                alt=""
                style={{
                  width: 40,
                  height: 40,
                  objectFit: 'cover',
                  borderRadius: 6,
                  background: '#0f172a',
                }}
              />
              <span style={{ color: '#e2e8f0', fontSize: '0.9rem', flex: 1 }}>
                {r.caption || 'Receipt'}
              </span>
              <button
                type="button"
                onClick={() => void remove(r.id)}
                style={{
                  background: '#334155',
                  color: '#e2e8f0',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
