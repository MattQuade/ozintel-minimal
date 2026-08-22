'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { prepareReceiptFile } from '@/lib/client/compressReceiptImage';
import { parseReceiptCaption } from '@/lib/accounting/receiptCaption';
import {
  exportCroppedJpegFromSrc,
  FULL_CROP,
  type CropRectNorm,
} from '@/lib/client/cropImage';
import ReceiptCropEditor from '@/components/ReceiptCropEditor';

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

type Step = 'idle' | 'crop' | 'reading' | 'confirm';

export default function HomeReceiptCapture() {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('idle');
  /** Original camera/file pick — kept so Re-crop can go back. */
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropRectNorm>(FULL_CROP);
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

  useEffect(() => {
    if (!croppedFile) {
      setCroppedUrl(null);
      return;
    }
    const url = URL.createObjectURL(croppedFile);
    setCroppedUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [croppedFile]);

  const resetAll = () => {
    setStep('idle');
    setOriginalFile(null);
    setCroppedFile(null);
    setCrop(FULL_CROP);
    setCaption('');
    setReadHint('');
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const readCroppedFile = async (file: File) => {
    setStep('reading');
    setStatus('Reading receipt…');
    setReadHint('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/ledger/receipts/read', {
        method: 'POST',
        body: form,
        credentials: 'include',
        cache: 'no-store',
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
      setCaption('');
      setReadHint('');
      setStatus(
        err instanceof Error
          ? `${err.message} — type caption like ww 79.13`
          : 'Could not read — type caption like ww 79.13'
      );
      setStep('confirm');
    }
  };

  const applyCropAndContinue = async () => {
    if (!originalFile || !originalUrl) return;
    setStatus('Cropping…');
    try {
      const cropped = await exportCroppedJpegFromSrc({
        src: originalUrl,
        crop,
        fileName: originalFile.name || 'receipt',
      });
      setCroppedFile(cropped);
      await readCroppedFile(cropped);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Crop failed');
      setStep('crop');
    }
  };

  const save = async () => {
    const file = croppedFile || originalFile;
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
          setCroppedFile(null);
          setCrop(FULL_CROP);
          setCaption('');
          setReadHint('');
          setStatus('');
          setStep(file ? 'crop' : 'idle');
        }}
        style={srFileInput}
      />

      {step === 'crop' && originalUrl ? (
        <div
          style={{
            width: '92%',
            maxWidth: 420,
            boxSizing: 'border-box',
          }}
        >
          <ReceiptCropEditor
            key={originalUrl}
            src={originalUrl}
            initialCrop={FULL_CROP}
            theme="dark"
            onCropChange={setCrop}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
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
              onClick={() => void applyCropAndContinue()}
              style={{
                flex: 1.4,
                padding: '12px 10px',
                background: '#0ea5e9',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              Use crop
            </button>
          </div>
        </div>
      ) : null}

      {step === 'reading' ? (
        <p
          style={{
            color: '#cbd5e1',
            fontSize: '1rem',
            margin: 0,
            width: '90%',
            maxWidth: '400px',
          }}
        >
          Reading receipt…
        </p>
      ) : null}

      {step === 'confirm' && (croppedFile || originalFile) ? (
        <div
          style={{
            width: '90%',
            maxWidth: '400px',
            boxSizing: 'border-box',
          }}
        >
          {croppedUrl || originalUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={croppedUrl || originalUrl || ''}
              alt="Cropped receipt"
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
              onClick={() => {
                setStep('crop');
                setStatus('');
                setReadHint('');
              }}
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
              Re-crop
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
