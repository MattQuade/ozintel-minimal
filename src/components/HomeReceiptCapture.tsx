'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  prepareReceiptFile,
  prepareReceiptFileForOcr,
} from '@/lib/client/compressReceiptImage';
import { postReceiptUpload } from '@/lib/client/postReceiptUpload';
import { APPROVED_RECEIPT_MERCHANTS, type ApprovedMerchant } from '@/lib/accounting/approvedMerchants';
import {
  normalizeReceiptAlias,
  parseReceiptCaption,
} from '@/lib/accounting/receiptCaption';
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

const OCR_CLIENT_MS = 28_000;

function chipStyle(selected: boolean): CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 999,
    border: selected ? '2px solid #fb923c' : '1px solid #475569',
    background: selected ? '#9a3412' : '#1e2937',
    color: 'white',
    fontWeight: 700,
    fontSize: '0.88rem',
    cursor: 'pointer',
    touchAction: 'manipulation',
  };
}

function parseTypedAmount(raw: string): number | null {
  const n = Number(String(raw || '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

async function captureVideoFrame(video: HTMLVideoElement): Promise<File> {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 960;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not capture this photo');
  ctx.drawImage(video, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not capture this photo'))),
      'image/jpeg',
      0.92
    );
  });
  return new File([blob], 'receipt.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

/**
 * Camera opens from this button. Confirm stays on home: pick a preapproved
 * shop and a total (OCR only highlights). A live session stays open so the
 * next receipt can be shot without tapping Capture Receipt again.
 */
export default function HomeReceiptCapture() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const merchantTouchedRef = useRef(false);
  const amountTouchedRef = useRef(false);
  const ignorePopUntilRef = useRef(0);
  const releasingBackRef = useRef(false);
  const reopenNativeRef = useRef(false);
  const savePrepRef = useRef<{ source: File; promise: Promise<File> } | null>(
    null
  );
  const [inputKey, setInputKey] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'live' | 'confirm'>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [alias, setAlias] = useState('');
  const [otherAlias, setOtherAlias] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [amountText, setAmountText] = useState('');
  const [amountChoices, setAmountChoices] = useState<number[]>([]);
  const [hint, setHint] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [merchants, setMerchants] = useState<ApprovedMerchant[]>(
    APPROVED_RECEIPT_MERCHANTS
  );

  const effectiveAlias = alias || normalizeReceiptAlias(otherAlias);
  const typedAmount = parseTypedAmount(amountText);
  const effectiveAmount = typedAmount ?? amount;
  const parsed =
    effectiveAlias && effectiveAmount && effectiveAmount > 0
      ? parseReceiptCaption(`${effectiveAlias} ${effectiveAmount.toFixed(2)}`)
      : null;


  useEffect(() => {
    let cancelled = false;
    void fetch('/api/merchants', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data?.merchants) || data.merchants.length === 0) {
          return;
        }
        setMerchants(data.merchants);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadPendingReceipt().then((pending) => {
      if (!cancelled && pending) {
        setFile(pending);
        setPhase('confirm');
      }
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
      ignorePopUntilRef.current = Date.now() + 2000;
      history.pushState({ ozintelReceipt: 1 }, '');
    }
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!file) {
      savePrepRef.current = null;
      return;
    }
    if (savePrepRef.current?.source !== file) {
      savePrepRef.current = { source: file, promise: prepareReceiptFile(file) };
    }
  }, [file]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (phase !== 'live' || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [phase]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'idle' || !reopenNativeRef.current) return;
    reopenNativeRef.current = false;
    const t = window.setTimeout(() => inputRef.current?.click(), 80);
    return () => window.clearTimeout(t);
  }, [phase, inputKey]);

  const stopLive = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const resetPhoto = () => {
    setFile(null);
    setAlias('');
    setOtherAlias('');
    setAmount(null);
    setAmountText('');
    setAmountChoices([]);
    setHint('');
    merchantTouchedRef.current = false;
    amountTouchedRef.current = false;
    savePrepRef.current = null;
    clearPendingReceipt();
    setInputKey((k) => k + 1);
  };

  const endSession = (popHistory = false) => {
    stopLive();
    resetPhoto();
    setPhase('idle');
    setSaving(false);
    setSnapping(false);
    reopenNativeRef.current = false;
    if (
      popHistory &&
      typeof history !== 'undefined' &&
      history.state?.ozintelReceipt === 1
    ) {
      releasingBackRef.current = true;
      history.back();
      setTimeout(() => {
        releasingBackRef.current = false;
      }, 400);
    }
  };

  useEffect(() => {
    const onPop = () => {
      if (releasingBackRef.current) return;
      if (Date.now() < ignorePopUntilRef.current) {
        if (history.state?.ozintelReceipt !== 1) {
          history.pushState({ ozintelReceipt: 1 }, '');
        }
        return;
      }
      if (phase === 'confirm') {
        if (streamRef.current) {
          resetPhoto();
          setPhase('live');
          setStatus('');
        } else {
          endSession(false);
        }
        return;
      }
      if (phase === 'live') {
        const n = savedCount;
        endSession(false);
        setSavedCount(0);
        setStatus(
          n === 0 ? '' : n === 1 ? '1 receipt saved' : `${n} receipts saved`
        );
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [phase, savedCount]);

  useEffect(() => {
    if (!file) return;
    merchantTouchedRef.current = false;
    amountTouchedRef.current = false;
    setAlias('');
    setOtherAlias('');
    setAmount(null);
    setAmountText('');
    setAmountChoices([]);
    setHint('Reading shop and total…');
    setStatus('');
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), OCR_CLIENT_MS);
    const run = async () => {
      try {
        const forOcr = await prepareReceiptFileForOcr(file);
        if (ac.signal.aborted) {
          setHint('Still reading — pick the shop if you need to go ahead');
          return;
        }
        const form = new FormData();
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

        if (res.status === 401 || res.status === 403) {
          setHint(
            'This account needs Accounting ticked so the photo can be read'
          );
          return;
        }
        if (!res.ok) {
          setHint(
            data.error
              ? `${data.error} — pick the shop and type the total`
              : 'Could not read — pick the shop and type the total'
          );
          return;
        }

        const choices: number[] = [];
        for (const row of data.amountCandidates || []) {
          const n = Number(row.amount ?? row);
          if (Number.isFinite(n) && n > 0 && !choices.includes(n)) choices.push(n);
        }
        setAmountChoices(choices);

        if (!merchantTouchedRef.current && data.suggestion?.alias) {
          setAlias(String(data.suggestion.alias));
          setOtherAlias('');
        }
        if (!amountTouchedRef.current) {
          const suggestedAmount = Number(data.suggestion?.amount);
          if (Number.isFinite(suggestedAmount) && suggestedAmount > 0) {
            if (!choices.includes(suggestedAmount)) {
              choices.push(suggestedAmount);
              setAmountChoices(choices);
            }
            setAmount(suggestedAmount);
            setAmountText('');
          }
        }

        if (choices.length) {
          setHint(
            data.suggestion?.lockAmount
              ? 'Tap the shop and the total — edit if the highlight is wrong'
              : 'Tap the total at the bottom of the photo, or type it'
          );
        } else if (data.suggestion?.alias) {
          setHint('Shop highlighted — type the total');
        } else {
          setHint('Could not read this photo — pick the shop and type the total');
        }
      } catch (err) {
        if (ac.signal.aborted) {
          setHint('Still reading — pick the shop if you need to go ahead');
          return;
        }
        setHint('Could not read this photo — pick the shop and type the total');
      }
    };
    void run();
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [file]);

  const acceptPhoto = (next: File) => {
    ignorePopUntilRef.current = Date.now() + 2000;
    savePrepRef.current = { source: next, promise: prepareReceiptFile(next) };
    setPendingReceipt(next);
    setFile(next);
    setPhase('confirm');
  };

  const onPicked = (next: File | null) => {
    if (!next) return;
    acceptPhoto(next);
  };

  const startLive = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      inputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1920 },
        },
      });
      streamRef.current = stream;
      ignorePopUntilRef.current = Date.now() + 2000;
      if (typeof history !== 'undefined' && history.state?.ozintelReceipt !== 1) {
        history.pushState({ ozintelReceipt: 1 }, '');
      }
      setStatus('');
      setPhase('live');
    } catch {
      inputRef.current?.click();
    }
  };

  const snap = async () => {
    const video = videoRef.current;
    if (!video) return;
    setSnapping(true);
    try {
      const next = await captureVideoFrame(video);
      acceptPhoto(next);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not capture this photo');
    } finally {
      setSnapping(false);
    }
  };

  const discardPhoto = () => {
    resetPhoto();
    setStatus('');
    if (streamRef.current) setPhase('live');
    else goNextNative();
  };

  const goNextNative = () => {
    reopenNativeRef.current = true;
    resetPhoto();
    setPhase('idle');
  };

  const save = async () => {
    if (!file || !parsed) {
      setStatus('Pick a shop and a total');
      return;
    }
    setSaving(true);
    setStatus('Saving…');
    try {
      let prepared: File;
      const prep = savePrepRef.current;
      if (prep && prep.source === file) {
        try {
          prepared = await prep.promise;
        } catch {
          prepared = await prepareReceiptFile(file);
        }
      } else {
        prepared = await prepareReceiptFile(file);
      }
      await postReceiptUpload({
        file: prepared,
        caption: parsed.display,
      });
      const saved = parsed.display;
      setSavedCount((n) => n + 1);
      setStatus(`Saved ${saved} — next receipt`);
      resetPhoto();
      if (streamRef.current) {
        setPhase('live');
      } else {
        goNextNative();
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const doneLabel =
    savedCount === 0
      ? 'Done'
      : savedCount === 1
        ? 'Done · 1 saved'
        : `Done · ${savedCount} saved`;

  return (
    <>
      <input
        id="home-receipt-photo"
        key={inputKey}
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onPicked(e.target.files?.[0] || null)}
        style={srFileInput}
      />

      {phase === 'idle' ? (
        <div
          style={{
            width: '90%',
            maxWidth: 400,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <button type="button" onClick={() => void startLive()} style={homeButtonStyle}>
            {savedCount > 0 ? 'Next receipt' : 'Capture Receipt'}
          </button>
          {savedCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                const n = savedCount;
                endSession(true);
                setSavedCount(0);
                setStatus(n === 1 ? '1 receipt saved' : `${n} receipts saved`);
              }}
              style={{ ...greyBtn, width: '100%' }}
            >
              {doneLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === 'live' ? (
        <div
          style={{
            width: '90%',
            maxWidth: 400,
            boxSizing: 'border-box',
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{
              width: '100%',
              maxHeight: 320,
              objectFit: 'cover',
              borderRadius: 8,
              background: '#020617',
              border: '1px solid #334155',
              marginBottom: 10,
            }}
          />
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 10px' }}>
            Line up the receipt, then snap. Confirm shop and total after each shot.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                const n = savedCount;
                endSession(true);
                setSavedCount(0);
                setStatus(
                  n === 0
                    ? ''
                    : n === 1
                      ? '1 receipt saved'
                      : `${n} receipts saved`
                );
              }}
              style={greyBtn}
            >
              {doneLabel}
            </button>
            <button
              type="button"
              disabled={snapping}
              onClick={() => void snap()}
              style={{
                ...greyBtn,
                flex: 1.6,
                background: '#ea580c',
                opacity: snapping ? 0.7 : 1,
              }}
            >
              {snapping ? 'Snapping…' : 'Snap'}
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'confirm' && file ? (
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
                maxHeight: 160,
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

          <p style={{ color: '#cbd5e1', fontSize: '0.8rem', margin: '0 0 6px', fontWeight: 700 }}>
            Shop
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {[...merchants]
              .sort((a, b) => a.label.localeCompare(b.label, 'en'))
              .map((m) => (
              <button
                key={m.alias}
                type="button"
                onClick={() => {
                  merchantTouchedRef.current = true;
                  setAlias(m.alias);
                  setOtherAlias('');
                }}
                style={chipStyle(alias === m.alias)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="Other shop alias"
            value={otherAlias}
            onChange={(e) => {
              merchantTouchedRef.current = true;
              setOtherAlias(e.target.value);
              setAlias('');
            }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: 10,
              borderRadius: 8,
              border: '1px solid #475569',
              background: '#1e2937',
              color: 'white',
              fontSize: '0.95rem',
              marginBottom: 10,
            }}
          />

          <p style={{ color: '#cbd5e1', fontSize: '0.8rem', margin: '0 0 6px', fontWeight: 700 }}>
            Total
          </p>
          {amountChoices.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {amountChoices.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    amountTouchedRef.current = true;
                    setAmount(n);
                    setAmountText('');
                  }}
                  style={chipStyle(typedAmount == null && amount === n)}
                >
                  ${n.toFixed(2)}
                </button>
              ))}
            </div>
          ) : null}
          <input
            type="text"
            inputMode="decimal"
            placeholder="or type total"
            value={amountText}
            onChange={(e) => {
              amountTouchedRef.current = true;
              setAmountText(e.target.value);
            }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: 10,
              borderRadius: 8,
              border: '1px solid #475569',
              background: '#1e2937',
              color: 'white',
              fontSize: '1.05rem',
              marginBottom: 8,
            }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={discardPhoto} style={greyBtn}>
              {streamRef.current ? 'Reshoot' : 'Retake'}
            </button>
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
              {saving ? 'Saving…' : parsed ? `Confirm ${parsed.display}` : 'Confirm'}
            </button>
          </div>
        </div>
      ) : null}

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
