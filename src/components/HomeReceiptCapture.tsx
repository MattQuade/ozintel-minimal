'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  prepareReceiptFile,
  RECEIPT_OCR_JPEG_QUALITY,
  RECEIPT_OCR_MAX_EDGE,
} from '@/lib/client/compressReceiptImage';
import { parseReceiptCaption } from '@/lib/accounting/receiptCaption';
import {
  exportCroppedJpegFromSrc,
  FULL_CROP,
} from '@/lib/client/cropImage';

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
  WebkitTapHighlightColor: 'rgba(234,88,12,0.35)',
  touchAction: 'manipulation',
};

/** Hidden from view but still tappable via <label> — iOS PWAs ignore display:none + .click(). */
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

type Step = 'idle' | 'reading' | 'confirm';

const OCR_CLIENT_TIMEOUT_MS = 45_000;

export default function HomeReceiptCapture() {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const readAbortRef = useRef<AbortController | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [readHint, setReadHint] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = parseReceiptCaption(caption);

  useEffect(() => {
    if (!originalFile) {
      setOriginalUrl(null);
      return;
    }
    const url = URL.createObjectURL(originalFile);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [originalFile]);

  const resetAll = () => {
    readAbortRef.current?.abort();
    setStep('idle');
    setOriginalFile(null);
    setCaption('');
    setReadHint('');
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const skipReading = () => {
    readAbortRef.current?.abort();
    setCaption('');
    setReadHint('');
    setStatus('Type caption like ww 79.13');
    setStep('confirm');
  };

  const readPhoto = async (file: File) => {
    setStep('reading');
    setStatus('Reading receipt…');
    setReadHint('');
    const ac = new AbortController();
    readAbortRef.current = ac;
    const timer = setTimeout(() => ac.abort(), OCR_CLIENT_TIMEOUT_MS);
    const src = URL.createObjectURL(file);
    try {
      let ocrFile = file;
      try {
        ocrFile = await exportCroppedJpegFromSrc({
          src,
          crop: FULL_CROP,
          fileName: file.name || 'receipt',
          maxEdge: RECEIPT_OCR_MAX_EDGE,
          quality: RECEIPT_OCR_JPEG_QUALITY,
        });
      } catch {
        // HEIC etc. — send the camera file if the browser cannot re-encode.
      }
      const form = new FormData();
      form.append('file', ocrFile);
      const res = await fetch('/api/ledger/receipts/read', {
        method: 'POST',
        body: form,
        credentials: 'include',
        cache: 'no-store',
        signal: ac.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Read failed');
      }
      if (data.suggestion?.display) {
        setCaption(String(data.suggestion.display));
        const label = String(data.suggestion.merchantLabel || '').trim();
        setReadHint(
          label
            ? `Read ${label} · $${Number(data.suggestion.amount).toFixed(2)} — confirm or edit`
            : `Read ${data.suggestion.display} — confirm or edit`
        );
        setStatus('');
      } else {
        setCaption('');
        setReadHint('');
        setStatus('Could not read — type caption like ww 79.13');
      }
      setStep('confirm');
    } catch (err) {
      const aborted =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');
      setCaption('');
      setReadHint('');
      setStatus(
        aborted
          ? 'Read timed out — type caption like ww 79.13'
          : err instanceof Error
            ? `${err.message} — type caption like ww 79.13`
            : 'Could not read — type caption like ww 79.13'
      );
      setStep('confirm');
    } finally {
      URL.revokeObjectURL(src);
      clearTimeout(timer);
      if (readAbortRef.current === ac) readAbortRef.current = null;
    }
  };

  const save = async () => {
    if (!originalFile) return;
    if (!parsed) {
      setStatus('Caption like ww 79.13');
      return;
    }
    setSaving(true);
    setStatus('Saving…');
    try {
      const prepared = await prepareReceiptFile(originalFile);
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
      resetAll();
      setStatus(`Saved ${parsed.display}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {step === 'idle' ? (
        <label htmlFor="home-receipt-photo" style={homeButtonStyle}>
          Capture Receipt
        </label>
      ) : null}
      <input
        id="home-receipt-photo"
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          setOriginalFile(file);
          setCaption('');
          setReadHint('');
          setStatus('');
          if (file) void readPhoto(file);
          else setStep('idle');
        }}
        style={srFileInput}
      />

      {step === 'reading' ? (
        <div
          style={{
            width: '90%',
            maxWidth: '400px',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              color: '#cbd5e1',
              fontSize: '1rem',
              margin: '0 0 12px',
            }}
          >
            Reading receipt…
          </p>
          <button
            type="button"
            onClick={skipReading}
            style={{
              padding: '12px 16px',
              background: '#334155',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            Type it myself
          </button>
        </div>
      ) : null}

      {step === 'confirm' && originalFile ? (
        <div
          style={{
            width: '90%',
            maxWidth: '400px',
            boxSizing: 'border-box',
          }}
        >
          {originalUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={originalUrl}
              alt="Receipt"
              style={{
                width: '100%',
                maxHeight: 220,
                objectFit: 'contain',
                borderRadius: 8,
                marginBottom: 8,
                background: '#0f172a',
                border: '1px solid #334155',
              }}
            />
          ) : null}
          {readHint ? (
            <p
              style={{
                color: '#94a3b8',
                fontSize: '0.85rem',
                margin: '0 0 8px',
              }}
            >
              {readHint}
            </p>
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
            <button
              type="button"
              onClick={resetAll}
              style={{
                flex: 1,
                padding: '12px 10px',
                background: '#334155',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              Retake
            </button>
            <button
              type="button"
              disabled={saving || !parsed}
              onClick={() => void save()}
              style={{
                flex: 1.4,
                padding: '12px 16px',
                background: '#22c55e',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                cursor: saving || !parsed ? 'not-allowed' : 'pointer',
                opacity: saving || !parsed ? 0.7 : 1,
                touchAction: 'manipulation',
              }}
            >
              {saving ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </div>
      ) : null}

      {status ? (
        <p
          style={{
            color: '#cbd5e1',
            fontSize: '0.9rem',
            margin: 0,
            width: '90%',
            maxWidth: '400px',
          }}
        >
          {status}
        </p>
      ) : null}
    </>
  );
}
