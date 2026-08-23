'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  prepareReceiptFile,
  RECEIPT_OCR_JPEG_QUALITY,
  RECEIPT_OCR_MAX_EDGE,
} from '@/lib/client/compressReceiptImage';
import {
  collapseDuplicateQuadCaptions,
  parseReceiptCaption,
} from '@/lib/accounting/receiptCaption';
import {
  exportCroppedJpegFromSrc,
  FULL_CROP,
  type CropRectNorm,
} from '@/lib/client/cropImage';
import { QUAD_LABELS, defaultQuadCrops } from '@/lib/client/quadCrops';
import ReceiptCropEditor from '@/components/ReceiptCropEditor';
import ReceiptQuadEditor from '@/components/ReceiptQuadEditor';

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
type Layout = 'single' | 'quad';

const OCR_CLIENT_TIMEOUT_MS = 32_000;

type OcrResult = { caption: string; hint: string; amount: number | null };

async function readOneReceipt(
  file: File,
  signal: AbortSignal
): Promise<OcrResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/ledger/receipts/read', {
    method: 'POST',
    body: form,
    credentials: 'include',
    cache: 'no-store',
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Read failed');
  }
  if (data.suggestion?.display) {
    const label = String(data.suggestion.merchantLabel || '').trim();
    const amount = Number(data.suggestion.amount);
    return {
      caption: String(data.suggestion.display),
      hint: label
        ? `Read ${label} · $${Number(data.suggestion.amount).toFixed(2)}`
        : `Read ${data.suggestion.display}`,
      amount: Number.isFinite(amount) ? amount : null,
    };
  }
  if (Number(data.amount) > 0) {
    const amt = Number(data.amount).toFixed(2);
    return {
      caption: '',
      hint: `Read $${amt} — type merchant like ww ${amt}`,
      amount: Number(data.amount),
    };
  }
  return { caption: '', hint: 'Could not read — type caption', amount: null };
}

export default function HomeReceiptCapture() {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const quadInputRef = useRef<HTMLInputElement>(null);
  const readAbortRef = useRef<AbortController | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [layout, setLayout] = useState<Layout>('single');
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropRectNorm>(FULL_CROP);
  const [quads, setQuads] = useState<CropRectNorm[]>(() => defaultQuadCrops());
  const [quadSelected, setQuadSelected] = useState(0);
  const [quadFiles, setQuadFiles] = useState<(File | null)[]>([null, null, null, null]);
  const [quadUrls, setQuadUrls] = useState<(string | null)[]>([null, null, null, null]);
  const [quadCaptions, setQuadCaptions] = useState(['', '', '', '']);
  const [quadHints, setQuadHints] = useState(['', '', '', '']);
  const [readProgress, setReadProgress] = useState('');
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

  useEffect(() => {
    const urls = quadFiles.map((file) =>
      file ? URL.createObjectURL(file) : null
    );
    setQuadUrls(urls);
    return () => {
      for (const url of urls) {
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, [quadFiles]);

  const resetAll = () => {
    readAbortRef.current?.abort();
    setStep('idle');
    setLayout('single');
    setOriginalFile(null);
    setCroppedFile(null);
    setCrop(FULL_CROP);
    setQuads(defaultQuadCrops());
    setQuadSelected(0);
    setQuadFiles([null, null, null, null]);
    setQuadCaptions(['', '', '', '']);
    setQuadHints(['', '', '', '']);
    setCaption('');
    setReadHint('');
    setReadProgress('');
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (quadInputRef.current) quadInputRef.current.value = '';
  };

  const startFromFile = (file: File | null, nextLayout: Layout) => {
    setLayout(nextLayout);
    setOriginalFile(file);
    setCroppedFile(null);
    setCrop(FULL_CROP);
    setQuads(defaultQuadCrops());
    setQuadSelected(0);
    setQuadFiles([null, null, null, null]);
    setQuadCaptions(['', '', '', '']);
    setQuadHints(['', '', '', '']);
    setCaption('');
    setReadHint('');
    setStatus('');
    setReadProgress('');
    setStep(file ? 'crop' : 'idle');
  };

  const skipReading = () => {
    readAbortRef.current?.abort();
    if (layout === 'quad') {
      setStatus('Edit any blank captions, or leave blank to skip');
    } else {
      setCaption('');
      setReadHint('');
      setStatus('Type caption like ww 79.13');
    }
    setStep('confirm');
  };

  const readCroppedFile = async (file: File) => {
    setStep('reading');
    setStatus('Reading receipt…');
    setReadHint('');
    const ac = new AbortController();
    readAbortRef.current = ac;
    const timer = setTimeout(() => ac.abort(), OCR_CLIENT_TIMEOUT_MS);
    try {
      const result = await readOneReceipt(file, ac.signal);
      setCaption(result.caption);
      setReadHint(result.hint);
      setStatus(result.caption ? '' : result.hint);
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
      clearTimeout(timer);
      if (readAbortRef.current === ac) readAbortRef.current = null;
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
        maxEdge: RECEIPT_OCR_MAX_EDGE,
        quality: RECEIPT_OCR_JPEG_QUALITY,
      });
      setCroppedFile(cropped);
      await readCroppedFile(cropped);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Crop failed');
      setStep('crop');
    }
  };

  const applyQuadAndContinue = async () => {
    if (!originalFile || !originalUrl) return;
    setStep('reading');
    setReadProgress('Cropping 4 receipts…');
    const ac = new AbortController();
    readAbortRef.current = ac;
    try {
      const files: (File | null)[] = [];
      for (let i = 0; i < 4; i += 1) {
        const cropped = await exportCroppedJpegFromSrc({
          src: originalUrl,
          crop: quads[i],
          fileName: `receipt-${QUAD_LABELS[i]}`,
          maxEdge: RECEIPT_OCR_MAX_EDGE,
          quality: RECEIPT_OCR_JPEG_QUALITY,
        });
        files.push(cropped);
      }
      setQuadFiles(files);

      const captions = ['', '', '', ''];
      const hints = ['', '', '', ''];
      const amounts: Array<number | null> = [null, null, null, null];
      for (let i = 0; i < 4; i += 1) {
        if (ac.signal.aborted) break;
        setReadProgress(`Reading ${QUAD_LABELS[i]} of 4…`);
        const file = files[i];
        if (!file) continue;
        const itemAc = new AbortController();
        const stop = () => itemAc.abort();
        ac.signal.addEventListener('abort', stop);
        const timer = setTimeout(() => itemAc.abort(), OCR_CLIENT_TIMEOUT_MS);
        try {
          const result = await readOneReceipt(file, itemAc.signal);
          captions[i] = result.caption;
          hints[i] = result.hint;
          amounts[i] = result.amount;
        } catch {
          captions[i] = '';
          hints[i] = 'Could not read — type or leave blank to skip';
          amounts[i] = null;
        } finally {
          clearTimeout(timer);
          ac.signal.removeEventListener('abort', stop);
        }
      }
      const collapsed = collapseDuplicateQuadCaptions(captions, amounts);
      for (let i = 0; i < 4; i += 1) {
        captions[i] = collapsed.captions[i];
        if (collapsed.hints[i]) hints[i] = collapsed.hints[i] as string;
      }
      setQuadCaptions(captions);
      setQuadHints(hints);
      setStatus('Confirm each docket. Blank = skip.');
      setReadProgress('');
      setStep('confirm');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Crop failed');
      setStep('crop');
    } finally {
      if (readAbortRef.current === ac) readAbortRef.current = null;
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

  const saveQuad = async () => {
    const ready = quadFiles
      .map((file, i) => ({
        file,
        parsed: parseReceiptCaption(quadCaptions[i]),
        label: QUAD_LABELS[i],
      }))
      .filter((row) => row.file && row.parsed);
    if (ready.length === 0) {
      setStatus('Type at least one caption like ww 79.13');
      return;
    }
    setSaving(true);
    setStatus(`Saving ${ready.length}…`);
    try {
      const saved: string[] = [];
      for (const row of ready) {
        const prepared = await prepareReceiptFile(row.file as File);
        const form = new FormData();
        form.append('file', prepared);
        form.append('caption', row.parsed!.display);
        const res = await fetch('/api/ledger/receipts', {
          method: 'POST',
          body: form,
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || `Save failed for ${row.label}`);
        }
        saved.push(row.parsed!.display);
      }
      resetAll();
      setStatus(`Saved ${saved.join(', ')}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {step === 'idle' ? (
        <>
          <label htmlFor="home-receipt-photo" style={homeButtonStyle}>
            Capture Receipt
          </label>
          <label
            htmlFor="home-receipt-quad"
            style={{
              ...homeButtonStyle,
              padding: '16px 20px',
              fontSize: '1.15rem',
              background: '#c2410c',
            }}
          >
            Capture 4 receipts
          </label>
        </>
      ) : null}
      <input
        id="home-receipt-photo"
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) =>
          startFromFile(e.target.files?.[0] || null, 'single')
        }
        style={srFileInput}
      />
      <input
        id="home-receipt-quad"
        ref={quadInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => startFromFile(e.target.files?.[0] || null, 'quad')}
        style={srFileInput}
      />

      {step === 'crop' && originalUrl && layout === 'single' ? (
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

      {step === 'crop' && originalUrl && layout === 'quad' ? (
        <div
          style={{
            width: '92%',
            maxWidth: 420,
            boxSizing: 'border-box',
          }}
        >
          <ReceiptQuadEditor
            src={originalUrl}
            crops={quads}
            selected={quadSelected}
            onSelect={setQuadSelected}
            onCropsChange={setQuads}
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
              onClick={() => void applyQuadAndContinue()}
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
              Read all 4
            </button>
          </div>
        </div>
      ) : null}

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
            {readProgress || 'Reading receipt…'}
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

      {step === 'confirm' && layout === 'single' && (croppedFile || originalFile) ? (
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

      {step === 'confirm' && layout === 'quad' ? (
        <div
          style={{
            width: '92%',
            maxWidth: 420,
            boxSizing: 'border-box',
          }}
        >
          {QUAD_LABELS.map((label, i) => (
            <div
              key={label}
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 10,
                alignItems: 'flex-start',
              }}
            >
              {quadUrls[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={quadUrls[i] || ''}
                  alt={`Receipt ${label}`}
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: 'contain',
                    borderRadius: 8,
                    background: '#0f172a',
                    border: '1px solid #334155',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 8,
                    background: '#1e2937',
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    margin: '0 0 4px',
                    color: '#94a3b8',
                    fontSize: '0.75rem',
                  }}
                >
                  {label}
                  {quadHints[i] ? ` · ${quadHints[i]}` : ''}
                </p>
                <input
                  type="text"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="ww 79.13 or blank to skip"
                  value={quadCaptions[i]}
                  onChange={(e) => {
                    const next = [...quadCaptions];
                    next[i] = e.target.value;
                    setQuadCaptions(next);
                  }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid #475569',
                    background: '#1e2937',
                    color: 'white',
                    fontSize: '1rem',
                  }}
                />
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setStep('crop');
                setStatus('');
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
              disabled={saving}
              onClick={() => void saveQuad()}
              style={{
                flex: 1.4,
                padding: '12px 16px',
                background: '#22c55e',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                touchAction: 'manipulation',
              }}
            >
              {saving ? 'Saving…' : 'Confirm all'}
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
