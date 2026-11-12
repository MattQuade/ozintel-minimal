'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { prepareReceiptFileForOcr } from '@/lib/client/compressReceiptImage';
import {
  yearsInCloses,
  type SandboxCashOutAmount,
  type SandboxCloseAmounts,
} from '@/lib/cashbookSandbox/monthly';
import {
  formatAuDayLong,
  sydneyTodayIso,
} from '@/lib/cashbookSandbox/sydneyDate';
import CashbookSandboxMonthChart from '@/components/CashbookSandboxMonthChart';

const box: CSSProperties = {
  width: '100%',
  maxWidth: 400,
  boxSizing: 'border-box',
  textAlign: 'left',
  margin: '0 auto 20px',
  padding: 14,
  borderRadius: 12,
  border: '1px solid #334155',
  background: '#0b1220',
};

const label: CSSProperties = {
  color: '#f97316',
  fontSize: '0.95rem',
  fontWeight: 700,
  margin: '0 0 4px',
};

const dateLine: CSSProperties = {
  color: '#e2e8f0',
  fontSize: '1.05rem',
  fontWeight: 700,
  margin: '0 0 12px',
};

const fieldLabel: CSSProperties = {
  color: '#94a3b8',
  fontSize: '0.8rem',
  fontWeight: 700,
  margin: '0 0 4px',
};

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 10,
  borderRadius: 8,
  border: '1px solid #475569',
  background: '#1e2937',
  color: 'white',
  fontSize: '1.05rem',
  marginBottom: 8,
};

const row: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'stretch',
  marginBottom: 8,
};

const readBtn: CSSProperties = {
  flex: '0 0 auto',
  padding: '10px 12px',
  borderRadius: 8,
  border: 'none',
  background: '#334155',
  color: 'white',
  fontWeight: 700,
  fontSize: '0.85rem',
  cursor: 'pointer',
  touchAction: 'manipulation',
  whiteSpace: 'nowrap',
};

const saveBtn: CSSProperties = {
  width: '100%',
  padding: 12,
  borderRadius: 10,
  border: 'none',
  background: '#9a3412',
  color: 'white',
  fontWeight: 700,
  fontSize: '1rem',
  cursor: 'pointer',
  touchAction: 'manipulation',
  marginTop: 4,
};

const sr: CSSProperties = {
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

type EftposSlot = 1 | 2 | 3;

function moneyText(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return String(n);
}

function parseMoney(raw: string): number | null {
  const n = Number(String(raw || '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Sandbox-only nightly EFTPOS + cash-banked entry.
 * Lives above Capture Receipt; does not touch live books.
 */
export default function CashbookSandboxNightly() {
  const today = sydneyTodayIso();
  const [eftposDate, setEftposDate] = useState(today);
  const [cashDate, setCashDate] = useState(today);
  const [eftpos1, setEftpos1] = useState('');
  const [eftpos2, setEftpos2] = useState('');
  const [eftpos3, setEftpos3] = useState('');
  const [cashDeposit, setCashDeposit] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<SandboxCloseAmounts[]>([]);
  const [cashOuts, setCashOuts] = useState<SandboxCashOutAmount[]>([]);
  const [chartYear, setChartYear] = useState(() =>
    Number(sydneyTodayIso().slice(0, 4))
  );
  const [chartRefresh, setChartRefresh] = useState(0);
  const [reading, setReading] = useState<EftposSlot | null>(null);
  const readSlotRef = useRef<EftposSlot | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/cashbook-sandbox/closes', {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data?.entries)) return;
        setEntries(data.entries);
        setCashOuts(Array.isArray(data.cashOuts) ? data.cashOuts : []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chartRefresh]);

  useEffect(() => {
    const onSaved = () => setChartRefresh((n) => n + 1);
    window.addEventListener('ozintel-receipt-saved', onSaved);
    return () => window.removeEventListener('ozintel-receipt-saved', onSaved);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch(
      `/api/cashbook-sandbox/closes?date=${encodeURIComponent(eftposDate)}`,
      { credentials: 'include', cache: 'no-store' }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.entry) return;
        const e = data.entry;
        setEftpos1(moneyText(e.eftpos1));
        setEftpos2(moneyText(e.eftpos2));
        setEftpos3(moneyText(e.eftpos3));
        if (e.cashDepositDate) setCashDate(e.cashDepositDate);
        setCashDeposit(moneyText(e.cashDeposit));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [eftposDate]);

  const setSlot = (slot: EftposSlot, value: string) => {
    if (slot === 1) setEftpos1(value);
    else if (slot === 2) setEftpos2(value);
    else setEftpos3(value);
  };

  const startRead = (slot: EftposSlot) => {
    readSlotRef.current = slot;
    setReading(slot);
    setStatus('');
    fileRef.current?.click();
  };

  const onReadFile = async (file: File | null) => {
    const slot = readSlotRef.current;
    readSlotRef.current = null;
    if (!file || !slot) {
      setReading(null);
      return;
    }
    setReading(slot);
    setStatus(`Reading EFTPOS ${slot}…`);
    try {
      const forOcr = await prepareReceiptFileForOcr(file);
      const form = new FormData();
      form.append('file', forOcr, 'eftpos.jpg');
      const res = await fetch('/api/ledger/receipts/read', {
        method: 'POST',
        body: form,
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(
          data.error
            ? `${data.error} — type the total instead`
            : 'Could not read — type the total instead'
        );
        return;
      }
      const suggested = Number(data.suggestion?.amount);
      let amount =
        Number.isFinite(suggested) && suggested > 0 ? suggested : null;
      if (amount == null) {
        for (const row of data.amountCandidates || []) {
          const n = Number(row.amount ?? row);
          if (Number.isFinite(n) && n > 0) {
            amount = n;
            break;
          }
        }
      }
      if (amount == null) {
        setStatus('Could not read a total — type it in the box');
        return;
      }
      setSlot(slot, moneyText(amount));
      setStatus(`EFTPOS ${slot} set to $${amount.toFixed(2)} from photo`);
    } catch {
      setStatus('Could not read — type the total instead');
    } finally {
      setReading(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/cashbook-sandbox/closes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eftposDate,
          eftpos1: parseMoney(eftpos1),
          eftpos2: parseMoney(eftpos2),
          eftpos3: parseMoney(eftpos3),
          cashDepositDate: cashDeposit.trim() ? cashDate : null,
          cashDeposit: parseMoney(cashDeposit),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error || 'Could not save sandbox totals');
        return;
      }
      if (data.entry) {
        const saved = data.entry as SandboxCloseAmounts;
        setEntries((prev) => [
          ...prev.filter((row) => row.eftposDate !== saved.eftposDate),
          saved,
        ]);
      }
      setStatus('Saved in cashbook sandbox (not live books)');
    } catch {
      setStatus('Could not save sandbox totals');
    } finally {
      setSaving(false);
    }
  };

  const eftposField = (slot: EftposSlot, value: string) => (
    <div key={slot} style={{ marginBottom: 4 }}>
      <p style={fieldLabel}>EFTPOS {slot}</p>
      <div style={row}>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => setSlot(slot, e.target.value)}
          style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => startRead(slot)}
          disabled={reading != null}
          style={{
            ...readBtn,
            opacity: reading != null && reading !== slot ? 0.6 : 1,
          }}
        >
          {reading === slot ? 'Reading…' : 'Read'}
        </button>
      </div>
    </div>
  );

  return (
    <section style={box} aria-label="Cashbook sandbox nightly totals">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void onReadFile(e.target.files?.[0] || null)}
        style={sr}
      />

      <p style={{ ...label, marginBottom: 2 }}>Cashbook sandbox</p>
      <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '0 0 14px' }}>
        Practice only — EFTPOS and cash banked are money in. Snapped receipt
        totals are money out. Does not write the live ledger.
      </p>

      <CashbookSandboxMonthChart
        entries={entries}
        cashOuts={cashOuts}
        year={chartYear}
        years={yearsInCloses(entries, cashOuts, chartYear)}
        onYear={setChartYear}
      />

      <p style={label}>EFTPOS totals</p>
      <p style={dateLine}>{formatAuDayLong(eftposDate)}</p>
      <label style={{ ...fieldLabel, display: 'block' }}>
        Change night
        <input
          type="date"
          value={eftposDate}
          onChange={(e) => setEftposDate(e.target.value || today)}
          style={inputStyle}
        />
      </label>
      {eftposField(1, eftpos1)}
      {eftposField(2, eftpos2)}
      {eftposField(3, eftpos3)}

      <p style={{ ...label, marginTop: 14 }}>Cash deposit (when banked)</p>
      <p style={dateLine}>{formatAuDayLong(cashDate)}</p>
      <label style={{ ...fieldLabel, display: 'block' }}>
        Deposit date
        <input
          type="date"
          value={cashDate}
          onChange={(e) => setCashDate(e.target.value || today)}
          style={inputStyle}
        />
      </label>
      <p style={fieldLabel}>Amount banked</p>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0.00"
        value={cashDeposit}
        onChange={(e) => setCashDeposit(e.target.value)}
        style={inputStyle}
      />

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        style={{ ...saveBtn, opacity: saving ? 0.7 : 1 }}
      >
        {saving ? 'Saving…' : 'Save sandbox night'}
      </button>
      {status ? (
        <p style={{ color: '#cbd5e1', fontSize: '0.85rem', margin: '10px 0 0' }}>
          {status}
        </p>
      ) : null}
    </section>
  );
}
