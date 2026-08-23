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
  textDecoration: 'none',
  WebkitTapHighlightColor: 'rgba(234,88,12,0.35)',
  touchAction: 'manipulation',
};

/**
 * Home control is a real page link so Android Back returns to home
 * instead of closing the standalone PWA.
 */
export default function HomeReceiptCapture() {
  return (
    <a href="/receipts/capture" style={homeButtonStyle}>
      Capture Receipt
    </a>
  );
}
