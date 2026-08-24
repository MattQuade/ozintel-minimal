'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  prepareReceiptFile,
  prepareReceiptFileForOcr,
} from '@/lib/client/compressReceiptImage';
import { APPROVED_RECEIPT_MERCHANTS } from '@/lib/accounting/approvedMerchants';
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

const OCR_CLIENT_MS = 10_000;

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

/**
 * Camera opens from this button. Confirm stays on home: pick a preapproved
 * shop and a total (OCR only highlights). Back closes confirm, not the PWA.
 */
export default function HomeReceiptCapture() {
  const inputRef = useRef<HTMLInputElement>(null);
  const merchantTouchedRef = useRef(false);
  const amountTouchedRef = useRef(false);
  const ignorePopUntilRef = useRef(0);
  const releasingBackRef = useRef(false);
  const savePrepRef = useRef<{ source: File; promise: Promise<File> } | null>(
    null
  );
  const [inputKey, setInputKey] = useState(0);
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

  const effectiveAlias = alias || normalizeReceiptAlias(otherAlias);
  const typedAmount = parseTypedAmount(amountText);
  const effectiveAmount = typedAmount ?? amount;
  const parsed =
    effectiveAlias && effectiveAmount && effectiveAmount > 0
      ? parseReceiptCaption(`${effectiveAlias} ${effectiveAmount.toFixed(2)}`)
      : null;

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
    const onPop = () => {
      if (releasingBackRef.current) return;
      if (Date.now() < ignorePopUntilRef.current) {
        if (history.state?.ozintelReceipt !== 1) {
          history.pushState({ ozintelReceipt: 1 }, '');
        }
        return;
      }
      if (file) resetConfirm(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [file]);

  useEffect(() => {
    if (!file) return;
    merchantTouchedRef.current = false;
    amountTouchedRef.current = false;
    setAlias('');
    setOtherAlias('');
    setAmount(null);
    setAmountText('');
    setAmountChoices([]);
    setHint('Pick the shop — reading total…');
    setStatus('');
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), OCR_CLIENT_MS);
    const run = async () => {
      try {
        const forOcr = await prepareReceiptFileForOcr(file);
        if (ac.signal.aborted) {
          setHint('Pick the shop and type the total');
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
        if (!amountTouchedRef.current && data.suggestion?.lockAmount) {
          const suggestedAmount = Number(data.suggestion?.amount);
          if (Number.isFinite(suggestedAmount) && suggestedAmount > 0) {
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
        } else {
          setHint('Pick the shop and type the total');
        }
      } catch {
        setHint('Pick the shop and type the total');
      }
    };
    void run();
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [file]);

  const resetConfirm = (popHistory = false) => {
    setFile(null);
    setAlias('');
    setOtherAlias('');
    setAmount(null);
    setAmountText('');
    setAmountChoices([]);
    setHint('');
    setStatus('');
    merchantTouchedRef.current = false;
    amountTouchedRef.current = false;
    savePrepRef.current = null;
    clearPendingReceipt();
    setInputKey((k) => k + 1);
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

  const onPicked = (next: File | null) => {
    if (!next) return;
    ignorePopUntilRef.current = Date.now() + 2000;
    savePrepRef.current = { source: next, promise: prepareReceiptFile(next) };
    setPendingReceipt(next);
    setFile(next);
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
      resetConfirm(true);
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
        key={inputKey}
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
            {[...APPROVED_RECEIPT_MERCHANTS]
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
              {saving ? 'Saving…' : parsed ? `Confirm ${parsed.display}` : 'Confirm'}
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
