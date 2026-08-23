'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { prepareReceiptFile } from '@/lib/client/compressReceiptImage';
import { parseReceiptCaption } from '@/lib/accounting/receiptCaption';
import {
  setPendingReceipt,
  loadPendingReceipt,
  clearPendingReceipt,
} from '@/lib/client/pendingReceipt';

const homeButtonStyle: CSSProperties = {
  display: 'block',
  padding: '20px',
  fontSize: '1.3rem',
  border: 'none',
  borderRadius: '12px',
  width: '90%',
  maxWidth: '400px',
  cursor: 'pointer',
  background: '#ea580c',
  color: 'white',
  fontWeight: 'bold',
  boxSizing: 'border-box',
  textAlign: 'center',
  textDecoration: 'none',
  WebkitTapHighlightColor: 'rgba(234,88,12,0.35)',
  touchAction: 'manipulation',
};

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

const OCR_CLIENT_MS = 10_000;

/**
 * Camera opens from this button. Confirm stays on home so the photo is not
 * lost when the Android camera activity returns, and Back closes confirm
 * instead of the PWA.
 */
export default function HomeReceiptCapture() {
  const inputRef = useRef<HTMLInputElement>(null);
  const captionTouchedRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [hint, setHint] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = parseReceiptCaption(caption);

  useEffect(() => {
    let cancelled = false;
    void loadPendingReceipt().then((pending) => {
      if (!cancelled && pending) setFile(pending);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    if (typeof history !== 'undefined' && history.state?.ozintelReceipt !== 1) {
      history.pushState({ ozintelReceipt: 1 }, '');
    }
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const onPop = () => {
      if (file) resetConfirm();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [file]);

  useEffect(() => {
    if (!file) return;
    captionTouchedRef.current = false;
    setCaption('');
    setHint('Reading…');
    setStatus('');
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), OCR_CLIENT_MS);
    const run = async () => {
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/ledger/receipts/read', {
          method: 'POST',
          body: form,
          credentials: 'include',
          cache: 'no-store',
          signal: ac.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (ac.signal.aborted || captionTouchedRef.current) return;
        if (data.suggestion?.display) {
          setCaption(String(data.suggestion.display));
          const label = String(data.suggestion.merchantLabel || '').trim();
          setHint(
            label
              ? `Read ${label} · $${Number(data.suggestion.amount).toFixed(2)} — edit if needed`
              : `Read ${data.suggestion.display} — edit if needed`
          );
          return;
        }
        setHint('Type caption like ww 79.13');
      } catch {
        if (!captionTouchedRef.current) setHint('Type caption like ww 79.13');
      }
    };
    void run();
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [file]);

  const resetConfirm = () => {
    setFile(null);
    setCaption('');
    setHint('');
    setStatus('');
    captionTouchedRef.current = false;
    clearPendingReceipt();
    if (inputRef.current) inputRef.current.value = '';
  };

  const onPicked = (next: File | null) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!next) return;
    setPendingReceipt(next);
    setFile(next);
  };

  const save = async () => {
    if (!file || !parsed) {
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
      const saved = parsed.display;
      resetConfirm();
      setStatus(`Saved ${saved}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <input
        id="home-receipt-photo"
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onPicked(e.target.files?.[0] || null)}
        style={srFileInput}
      />

      {!file ? (
        <label htmlFor="home-receipt-photo" style={homeButtonStyle}>
          Capture Receipt
        </label>
      ) : (
        <div
          style={{
            width: '90%',
            maxWidth: 400,
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
                maxHeight: 240,
                objectFit: 'contain',
                borderRadius: 8,
                marginBottom: 8,
                background: '#020617',
                border: '1px solid #334155',
              }}
            />
          ) : null}
          {hint ? (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 8px' }}>
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
            <label htmlFor="home-receipt-photo" style={{ ...greyBtn, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Retake
            </label>
            <button
              type="button"
              disabled={saving || !parsed}
              onClick={() => void save()}
              style={{
                ...greyBtn,
                flex: 1.4,
                background: '#22c55e',
                cursor: saving || !parsed ? 'not-allowed' : 'pointer',
                opacity: saving || !parsed ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </div>
      )}

      {status ? (
        <p
          style={{
            color: '#cbd5e1',
            fontSize: '0.9rem',
            margin: '8px 0 0',
            width: '90%',
            maxWidth: 400,
          }}
        >
          {status}
        </p>
      ) : null}
    </>
  );
}
