'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
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
 * Capture Receipt opens the camera immediately (label + file input).
 * After OK, the photo is handed to /receipts/capture so Back returns home.
 */
export default function HomeReceiptCapture() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/ledger/receipts/read', {
      credentials: 'include',
      cache: 'no-store',
    }).catch(() => undefined);
  }, []);

  return (
    <>
      <label htmlFor="home-receipt-photo" style={homeButtonStyle}>
        Capture Receipt
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
          setPendingReceipt(file);
          router.push('/receipts/capture');
        }}
        style={srFileInput}
      />
    </>
  );
}
