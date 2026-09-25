'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';

/**
 * Public retailer pathway — no OzIntel login.
 * Business owner shares connect code from Decision Brief.
 */
export default function RetailerConnectPage() {
  const [connectCode, setConnectCode] = useState('');
  const [retailerName, setRetailerName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setApiKey('');
    try {
      const res = await fetch('/api/decision-brief/retailer/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectCode, retailerName, contactEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Connect failed');
      }
      setApiKey(String(data.apiKey || ''));
      setOwnerEmail(String(data.ownerEmail || ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={page}>
      <h1 style={{ color: '#a78bfa', marginTop: 0 }}>Retailer connect</h1>
      <p style={{ color: '#94a3b8', maxWidth: 420 }}>
        Enter the business Decision Brief code. You get an API key to push bill
        totals into their energy brief — no OzIntel account needed.
      </p>

      {apiKey ? (
        <div style={card}>
          <p style={{ color: '#86efac', fontWeight: 700 }}>Connected</p>
          <p style={{ color: '#cbd5e1' }}>
            Linked to <strong>{ownerEmail}</strong>
          </p>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Save this API key (shown once):
          </p>
          <code
            style={{
              display: 'block',
              wordBreak: 'break-all',
              background: '#0f172a',
              padding: 12,
              borderRadius: 8,
              color: '#e2e8f0',
            }}
          >
            {apiKey}
          </code>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: 12 }}>
            Push example:
          </p>
          <pre
            style={{
              background: '#0f172a',
              padding: 12,
              borderRadius: 8,
              overflow: 'auto',
              fontSize: 12,
              color: '#cbd5e1',
            }}
          >{`POST /api/decision-brief/retailer/push
Authorization: Bearer ${apiKey}
{ "amountAud": 842.50, "kwh": 3120, "periodStart": "2026-07-01", "periodEnd": "2026-09-30" }`}</pre>
          <a href="/" style={{ color: '#38bdf8' }}>
            ozintel.com.au
          </a>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} style={card}>
          <label style={label}>
            Connect code
            <input
              value={connectCode}
              onChange={(e) => setConnectCode(e.target.value.toUpperCase())}
              required
              autoCapitalize="characters"
              placeholder="A1B2C3"
              style={input}
            />
          </label>
          <label style={label}>
            Retailer / company name
            <input
              value={retailerName}
              onChange={(e) => setRetailerName(e.target.value)}
              required
              style={input}
            />
          </label>
          <label style={label}>
            Your contact email
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              required
              style={input}
            />
          </label>
          {error ? (
            <p style={{ color: '#fca5a5', fontSize: '0.9rem' }}>{error}</p>
          ) : null}
          <button type="submit" disabled={busy} style={submitBtn}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      )}
    </main>
  );
}

const page: CSSProperties = {
  fontFamily: 'system-ui',
  background: '#0f172a',
  color: 'white',
  minHeight: '100vh',
  padding: 24,
  boxSizing: 'border-box',
};

const card: CSSProperties = {
  background: '#1e2937',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: 16,
  maxWidth: 440,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const label: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: '0.9rem',
  color: '#cbd5e1',
};

const input: CSSProperties = {
  padding: 12,
  borderRadius: 8,
  border: '1px solid #475569',
  background: '#0f172a',
  color: 'white',
  fontSize: '1rem',
};

const submitBtn: CSSProperties = {
  padding: '14px 16px',
  background: '#7c3aed',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
};
