'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { prepareReceiptFile, prepareReceiptFileForOcr } from '@/lib/client/compressReceiptImage';
import { parseReceiptCaption } from '@/lib/accounting/receiptCaption';
import { getPendingReceipt, setPendingReceipt, clearPendingReceipt } from '@/lib/client/pendingReceipt';

const srFileInput: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const greyBtn: CSSProperties = {
  flex: 1,
  padding: '12px 10px',
  background: '#334155',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
  touchAction: 'manipulation',
};

const retakeLabel: CSSProperties = {
  ...greyBtn,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
};

export default function CaptureReceiptClient() {
  const router = useRouter();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const readAbortRef = useRef<AbortController | null>(null);
  const captionTouchedRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [booting, setBooting] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [hint, setHint] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = parseReceiptCaption(caption);

  useEffect(() => {
    const pending = getPendingReceipt();
    if (pending) {
      setFile(pending);
      setBooting(false);
      return;
    }
    router.replace('/');
  }, [router]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!file) return;
    captionTouchedRef.current = false;
    setCaption('');
    setHint('Reading…');
    setStatus('');
    const ac = new AbortController();
    readAbortRef.current?.abort();
    readAbortRef.current = ac;

    const run = async () => {
      try {
        const forOcr = await prepareReceiptFileForOcr(file);
        if (ac.signal.aborted) return;
        const form = new FormData();
        // ASCII name — some runtimes choke on non-ASCII multipart filenames.
        form.append('file', forOcr, 'receipt.jpg');
        const res = await fetch('/api/ledger/receipts/read', {
          method: 'POST',
          body: form,
          credentials: 'include',
          cache: 'no-store',
          signal: ac.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (ac.signal.aborted) return;
        if (data.suggestion?.display && !captionTouchedRef.current) {
          setCaption(String(data.suggestion.display));
          const label = String(data.suggestion.merchantLabel || '').trim();
          setHint(
            label
              ? `Read ${label} · $${Number(data.suggestion.amount).toFixed(2)} — edit if needed`
              : `Read ${data.suggestion.display} — edit if needed`
          );
          return;
        }
        if (!captionTouchedRef.current) {
          setHint(
            data.error
              ? `${data.error} — type ww 79.13`
              : 'Type caption like ww 79.13'
          );
        }
      } catch {
        if (!ac.signal.aborted && !captionTouchedRef.current) {
          setHint('Type caption like ww 79.13');
        }
      } finally {
        if (readAbortRef.current === ac) readAbortRef.current = null;
      }
    };
    void run();
    return () => ac.abort();
  }, [file]);

  const save = async () => {
    if (!file) return;
    if (!parsed) {
      setStatus('Caption like ww 79.13');
      return;
    }
    setSaving(true);
    setStatus('Saving…');
    try {
      const prepared = await prepareReceiptFile(file);
      const form = new FormData();
      form.append('file', prepared);
      form.append('caption', parsed.display);
      const res = await fetch('/api/ledger/receipts', {
        method: 'POST',
        body: form,
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Save failed');
      }
      clearPendingReceipt();
      router.replace('/');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (booting || !file) {
    return (
      <div
        style={{
          fontFamily: 'system-ui',
          background: '#0f172a',
          color: '#94a3b8',
          minHeight: '100vh',
          padding: 20,
        }}
      />
    );
  }

  return (
    <div
      style={{
        fontFamily: 'system-ui',
        background: '#0f172a',
        color: 'white',
        textAlign: 'center',
        padding: 20,
        minHeight: '100vh',
        boxSizing: 'border-box',
      }}
    >
      <a
        href="/"
        style={{
          display: 'inline-block',
          marginBottom: 20,
          color: '#0f172a',
          background: '#e2e8f0',
          textDecoration: 'none',
          fontWeight: 600,
          padding: '10px 16px',
          borderRadius: 10,
        }}
      >
        ← Home
      </a>

      <input
        id="capture-receipt-retake"
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const next = e.target.files?.[0] || null;
          if (photoInputRef.current) photoInputRef.current.value = '';
          if (next) {
            setPendingReceipt(next);
            setFile(next);
          }
        }}
        style={srFileInput}
      />

      <div
        style={{
          width: '90%',
          maxWidth: 400,
          margin: '0 auto',
          boxSizing: 'border-box',
          textAlign: 'left',
        }}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Receipt"
            style={{
              width: '100%',
              maxHeight: 280,
              objectFit: 'contain',
              borderRadius: 8,
              marginBottom: 8,
              background: '#020617',
              border: '1px solid #334155',
            }}
          />
        ) : null}
        {hint ? (
          <p
            style={{
              color: '#94a3b8',
              fontSize: '0.85rem',
              margin: '0 0 8px',
            }}
          >
            {hint}
          </p>
        ) : null}
        <input
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="ww 79.13"
          value={caption}
          onChange={(e) => {
            captionTouchedRef.current = true;
            setCaption(e.target.value);
          }}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: 14,
            borderRadius: 8,
            border: '1px solid #475569',
            background: '#1e2937',
            color: 'white',
            fontSize: '1.05rem',
            marginBottom: 8,
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <label htmlFor="capture-receipt-retake" style={retakeLabel}>
            Retake
          </label>
          <button
            type="button"
            disabled={saving || !parsed}
            onClick={() => void save()}
            style={{
              ...greyBtn,
              flex: 1.4,
              padding: '12px 16px',
              background: '#22c55e',
              cursor: saving || !parsed ? 'not-allowed' : 'pointer',
              opacity: saving || !parsed ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>

      {status ? (
        <p
          style={{
            color: '#cbd5e1',
            fontSize: '0.9rem',
            margin: '16px auto 0',
            width: '90%',
            maxWidth: 400,
          }}
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}
