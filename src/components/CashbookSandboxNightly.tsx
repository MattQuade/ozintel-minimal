'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { prepareReceiptFileForOcr } from '@/lib/client/compressReceiptImage';
import {
  yearsInCloses,
  type SandboxCashOutAmount,
  type SandboxCloseAmounts,
} from '@/lib/cashbookSandbox/monthly';
import {
  formatAuDay,
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

type MiscPayment = {
  id: string;
  payee: string;
  amount: number;
  date: string;
};

type InvoicePayment = {
  id: string;
  customer: string;
  amount: number;
  date: string;
};

function moneyText(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return String(n);
}

function parseMoney(raw: string): number | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  const n = Number(text.replace(/[^0-9.]/g, ''));
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
  const [miscPayee, setMiscPayee] = useState('');
  const [miscAmount, setMiscAmount] = useState('');
  const [invoiceCustomer, setInvoiceCustomer] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [payments, setPayments] = useState<MiscPayment[]>([]);
  const [invoices, setInvoices] = useState<InvoicePayment[]>([]);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<SandboxCloseAmounts[]>([]);
  const [cashOuts, setCashOuts] = useState<SandboxCashOutAmount[]>([]);
  const [chartYear, setChartYear] = useState(() =>
    Number(sydneyTodayIso().slice(0, 4))
  );
  const [chartRefresh, setChartRefresh] = useState(0);
  const [reading, setReading] = useState<EftposSlot | null>(null);
  const [cameraSlot, setCameraSlot] = useState<EftposSlot | null>(null);
  const readSlotRef = useRef<EftposSlot | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const openingRef = useRef(false);
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
        setPayments(Array.isArray(data.miscPayments) ? data.miscPayments : []);
        setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
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

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraSlot(null);
  };

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraSlot || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    video.scrollIntoView({ block: 'center' });
  }, [cameraSlot]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const setSlot = (slot: EftposSlot, value: string) => {
    if (slot === 1) setEftpos1(value);
    else if (slot === 2) setEftpos2(value);
    else setEftpos3(value);
  };

  const startRead = async (slot: EftposSlot) => {
    if (openingRef.current || reading != null) return;
    openingRef.current = true;
    setStatus('');
    try {
      stopCamera();
      if (navigator.mediaDevices?.getUserMedia) {
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
          readSlotRef.current = slot;
          setCameraSlot(slot);
          return;
        } catch {
          streamRef.current = null;
        }
      }
      readSlotRef.current = slot;
      if (fileRef.current) fileRef.current.value = '';
      fileRef.current?.click();
    } finally {
      openingRef.current = false;
    }
  };

  const captureVideoFrame = async (video: HTMLVideoElement): Promise<File> => {
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
    return new File([blob], 'eftpos.jpg', {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  };

  const snapEftpos = async () => {
    const video = videoRef.current;
    const slot = cameraSlot;
    if (!video || !slot || reading != null) return;
    try {
      const file = await captureVideoFrame(video);
      stopCamera();
      await onReadFile(file, slot);
    } catch {
      setReading(null);
      setStatus('Could not capture this photo — type the total instead');
    }
  };

  const saveNight = async (slots: Record<EftposSlot, string>) => {
    const res = await fetch('/api/cashbook-sandbox/closes', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eftposDate,
        eftpos1: parseMoney(slots[1]),
        eftpos2: parseMoney(slots[2]),
        eftpos3: parseMoney(slots[3]),
        cashDepositDate: cashDeposit.trim() ? cashDate : null,
        cashDeposit: parseMoney(cashDeposit),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Could not save sandbox totals');
    }
    if (data.entry) {
      const saved = data.entry as SandboxCloseAmounts;
      setEntries((prev) => [
        ...prev.filter((row) => row.eftposDate !== saved.eftposDate),
        saved,
      ]);
    }
  };

  useEffect(() => {
    const onSettle = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{ amount?: number; handled?: boolean }>
      ).detail;
      const amount = Number(detail?.amount);
      if (!detail || !Number.isFinite(amount) || amount <= 0) return;
      const slots: Record<EftposSlot, string> = {
        1: eftpos1,
        2: eftpos2,
        3: eftpos3,
      };
      const empty = ([1, 2, 3] as EftposSlot[]).find(
        (slot) => parseMoney(slots[slot]) == null
      );
      const slot: EftposSlot = empty || 3;
      slots[slot] = moneyText(amount);
      setSlot(slot, slots[slot]);
      detail.handled = true;
      void saveNight(slots)
        .then(() =>
          setStatus(`EFTPOS ${slot} $${amount.toFixed(2)} added to cash in`)
        )
        .catch(() =>
          setStatus('Could not save the EFTPOS total — it is in the box')
        );
    };
    window.addEventListener('ozintel-eftpos-settlement', onSettle);
    return () => window.removeEventListener('ozintel-eftpos-settlement', onSettle);
  }, [eftpos1, eftpos2, eftpos3, eftposDate, cashDate, cashDeposit]);

  const onReadFile = async (file: File | null, slot: EftposSlot | null) => {
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
      form.append('kind', 'eftpos');
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
      const slots: Record<EftposSlot, string> = {
        1: eftpos1,
        2: eftpos2,
        3: eftpos3,
      };
      slots[slot] = moneyText(amount);
      setSlot(slot, slots[slot]);
      try {
        await saveNight(slots);
        setStatus(`EFTPOS ${slot} $${amount.toFixed(2)} added to cash in`);
      } catch (err) {
        setStatus(
          err instanceof Error
            ? `${err.message}. The total is in the box — press Save sandbox night`
            : 'Could not save. The total is in the box — press Save sandbox night'
        );
      }
    } catch {
      setStatus('Could not read — type the total instead');
    } finally {
      setReading(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    const payee = miscPayee.trim();
    const paid = parseMoney(miscAmount);
    const invoiced = parseMoney(invoiceAmount);
    const customer =
      invoiceCustomer.trim() || (invoiced != null && invoiced > 0 ? 'Invoice' : '');
    if (payee && (paid == null || paid <= 0)) {
      setStatus('Enter the amount paid');
      return;
    }
    if (!payee && miscAmount.trim()) {
      setStatus('Enter who was paid');
      return;
    }
    if (invoiceCustomer.trim() && (invoiced == null || invoiced <= 0)) {
      setStatus('Enter the invoice amount');
      return;
    }
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
          miscPayee: payee,
          miscAmount: paid,
          invoiceCustomer: customer,
          invoiceAmount: invoiced,
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
      const notes: string[] = [];
      if (data.miscPayment?.id) {
        const savedPay = data.miscPayment as MiscPayment;
        setPayments((prev) => [savedPay, ...prev.filter((row) => row.id !== savedPay.id)]);
        setMiscPayee('');
        setMiscAmount('');
        notes.push(`${savedPay.payee} $${savedPay.amount.toFixed(2)} saved for today`);
      }
      if (data.invoice?.id) {
        const savedInvoice = data.invoice as InvoicePayment;
        setInvoices((prev) => [
          savedInvoice,
          ...prev.filter((row) => row.id !== savedInvoice.id),
        ]);
        setInvoiceCustomer('');
        setInvoiceAmount('');
        notes.push(
          `${savedInvoice.customer} $${savedInvoice.amount.toFixed(2)} added to cash in`
        );
      }
      setStatus(
        notes.length > 0
          ? notes.join('. ')
          : 'Saved in cashbook sandbox (not live books)'
      );
    } catch {
      setStatus('Could not save sandbox totals');
    } finally {
      setSaving(false);
    }
  };

  const removeRow = async (kind: 'payment' | 'invoice', id: string) => {
    setStatus('');
    try {
      const res = await fetch(
        `/api/cashbook-sandbox/closes?id=${encodeURIComponent(id)}&kind=${kind}`,
        { method: 'DELETE', credentials: 'include', cache: 'no-store' }
      );
      if (!res.ok) {
        setStatus(kind === 'invoice' ? 'Could not remove that invoice' : 'Could not remove that payment');
        return;
      }
      if (kind === 'invoice') {
        setInvoices((prev) => prev.filter((row) => row.id !== id));
      } else {
        setPayments((prev) => prev.filter((row) => row.id !== id));
      }
    } catch {
      setStatus(kind === 'invoice' ? 'Could not remove that invoice' : 'Could not remove that payment');
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
          {reading === slot ? 'Reading…' : 'Capture'}
        </button>
      </div>
    </div>
  );

  const moneyOut = [
    ...cashOuts,
    ...payments.map((pay) => ({ date: pay.date, amount: pay.amount })),
  ];
  const invoiceIns = invoices.map((row) => ({
    date: row.date,
    amount: row.amount,
  }));

  return (
    <section style={box} aria-label="Cashbook sandbox nightly totals">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) =>
          void onReadFile(e.target.files?.[0] || null, readSlotRef.current)
        }
        style={sr}
      />

      <p style={{ ...label, marginBottom: 2 }}>Cashbook sandbox</p>
      <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '0 0 14px' }}>
        Practice only — EFTPOS, cash banked, and wholesale invoices are money
        in. Snapped receipts and misc payments are money out. Does not write
        the live ledger.
      </p>

      <CashbookSandboxMonthChart
        entries={entries}
        cashOuts={moneyOut}
        cashIns={invoiceIns}
        year={chartYear}
        years={yearsInCloses(entries, moneyOut, chartYear, invoiceIns)}
        onYear={setChartYear}
      />

      <p style={label}>EFTPOS totals</p>
      <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '0 0 8px' }}>
        Capture the settlement slip. The total is added to cash in.
      </p>
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
      {cameraSlot ? (
        <div style={{ marginBottom: 12 }}>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{
              width: '100%',
              maxHeight: 280,
              objectFit: 'cover',
              borderRadius: 8,
              background: '#020617',
              border: '1px solid #334155',
              marginBottom: 8,
            }}
          />
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 8px' }}>
            Line up the EFTPOS {cameraSlot} settlement, then snap.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={stopCamera} style={readBtn}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void snapEftpos()}
              disabled={reading != null}
              style={{
                ...readBtn,
                flex: 1,
                background: '#ea580c',
                opacity: reading != null ? 0.7 : 1,
              }}
            >
              {reading === cameraSlot ? 'Snapping…' : 'Snap'}
            </button>
          </div>
        </div>
      ) : null}
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

      <p style={fieldLabel}>Misc payments</p>
      <input
        type="text"
        placeholder="CUB"
        value={miscPayee}
        onChange={(e) => setMiscPayee(e.target.value)}
        style={inputStyle}
        aria-label="Misc payments"
      />
      <p style={fieldLabel}>Amount</p>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0.00"
        value={miscAmount}
        onChange={(e) => setMiscAmount(e.target.value)}
        style={inputStyle}
        aria-label="Misc payment amount"
      />
      {payments.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0 }}>
          {payments.slice(0, 20).map((pay) => (
            <li
              key={pay.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
                color: '#e2e8f0',
                fontSize: '0.9rem',
              }}
            >
              <span style={{ flex: 1 }}>
                {pay.payee} ${pay.amount.toFixed(2)} · {formatAuDay(pay.date)}
              </span>
              <button
                type="button"
                onClick={() => void removeRow('payment', pay.id)}
                style={{ ...readBtn, padding: '6px 8px' }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p style={fieldLabel}>Invoices</p>
      <input
        type="text"
        placeholder="Customer"
        value={invoiceCustomer}
        onChange={(e) => setInvoiceCustomer(e.target.value)}
        style={inputStyle}
        aria-label="Invoices"
      />
      <p style={fieldLabel}>Amount</p>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0.00"
        value={invoiceAmount}
        onChange={(e) => setInvoiceAmount(e.target.value)}
        style={inputStyle}
        aria-label="Invoice amount"
      />
      {invoices.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0 }}>
          {invoices.slice(0, 20).map((row) => (
            <li
              key={row.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
                color: '#e2e8f0',
                fontSize: '0.9rem',
              }}
            >
              <span style={{ flex: 1 }}>
                {row.customer} ${row.amount.toFixed(2)} · {formatAuDay(row.date)}
              </span>
              <button
                type="button"
                onClick={() => void removeRow('invoice', row.id)}
                style={{ ...readBtn, padding: '6px 8px' }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

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
