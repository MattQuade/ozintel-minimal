'use client';

import AccountingGate from '@/components/AccountingGate';
import CashbookSandboxNightly from '@/components/CashbookSandboxNightly';
import HomeReceiptCapture from '@/components/HomeReceiptCapture';

/** Standalone capture page — sandbox nightly totals + receipt snap. */
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
        <p style={{ color: '#94a3b8', margin: '0 0 20px' }}>
          Nightly EFTPOS and cash banked sit in the sandbox above. Receipts snap
          below as usual.
        </p>
        <CashbookSandboxNightly />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <HomeReceiptCapture />
        </div>
      </main>
    </AccountingGate>
  );
}
