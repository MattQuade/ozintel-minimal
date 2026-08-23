'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { setPendingReceipt } from '@/lib/client/pendingReceipt';

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

/**
 * Capture Receipt opens the camera, saves the photo to IndexedDB, then
 * opens /receipts/capture (so Back returns Home instead of quitting the PWA).
 */
export default function HomeReceiptCapture() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <>
      <label
        htmlFor="home-receipt-photo"
        style={{
          ...homeButtonStyle,
          opacity: busy ? 0.7 : 1,
          pointerEvents: busy ? 'none' : 'auto',
        }}
      >
        {busy ? 'Opening…' : 'Capture Receipt'}
      </label>
      <input
        id="home-receipt-photo"
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          if (inputRef.current) inputRef.current.value = '';
          if (!file) return;
          setBusy(true);
          setError('');
          void (async () => {
            try {
              await setPendingReceipt(file);
              router.push('/receipts/capture');
            } catch (err) {
              setBusy(false);
              setError(
                err instanceof Error
                  ? err.message
                  : 'Could not keep the photo — try again'
              );
            }
          })();
        }}
        style={srFileInput}
      />
      {error ? (
        <p
          style={{
            color: '#fca5a5',
            fontSize: '0.9rem',
            margin: '10px 0 0',
            width: '90%',
            maxWidth: 400,
          }}
        >
          {error}
        </p>
      ) : null}
    </>
  );
}
