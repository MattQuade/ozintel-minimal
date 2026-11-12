'use client';

import AccountingGate from '@/components/AccountingGate';
import HomeReceiptCapture from '@/components/HomeReceiptCapture';

/** Standalone capture page — keeps Snap/Done off the Accounting hub stack. */
export default function CaptureReceiptPage() {
  return (
    <AccountingGate
      section="Capture Receipt"
      backHref="/accounting"
      backLabel="← Back to Accounting"
    >
      <main
        style={{
          fontFamily: 'system-ui',
          background: '#0f172a',
          color: 'white',
          minHeight: 'calc(100vh - 57px)',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <h1 style={{ color: '#f97316', marginBottom: 8 }}>Capture Receipt</h1>
        <p style={{ color: '#94a3b8', margin: '0 0 24px' }}>
          Line up the receipt, snap, then confirm shop and total.
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <HomeReceiptCapture />
        </div>
      </main>
    </AccountingGate>
  );
}
