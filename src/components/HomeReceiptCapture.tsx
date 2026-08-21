'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { prepareReceiptFile } from '@/lib/client/compressReceiptImage';
import { parseReceiptCaption } from '@/lib/accounting/receiptCaption';

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

export default function HomeReceiptCapture() {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = parseReceiptCaption(caption);

  const resetPhoto = () => {
    setPhotoFile(null);
    setCaption('');
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const save = async () => {
    if (!photoFile) return;
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
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Save failed');
      }
      resetPhoto();
      setStatus(`Saved ${parsed.display}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <label htmlFor="home-receipt-photo" style={homeButtonStyle}>
        Capture Receipt
      </label>
      <input
        id="home-receipt-photo"
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          setPhotoFile(e.target.files?.[0] || null);
          setStatus('');
        }}
        style={srFileInput}
      />
      {photoFile ? (
        <div
          style={{
            width: '90%',
            maxWidth: '400px',
            boxSizing: 'border-box',
          }}
        >
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
              touchAction: 'manipulation',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
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
