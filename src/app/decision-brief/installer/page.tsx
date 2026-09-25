'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';

/**
 * Public solar/battery installer pathway — no OzIntel login.
 * Business owner shares the same Decision Brief connect code.
 */
export default function InstallerConnectPage() {
  const [connectCode, setConnectCode] = useState('');
  const [installerName, setInstallerName] = useState('');
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
      const res = await fetch('/api/decision-brief/installer/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectCode, installerName, contactEmail }),
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
      <h1 style={{ color: '#a78bfa', marginTop: 0 }}>Installer connect</h1>
      <p style={{ color: '#94a3b8', maxWidth: 440 }}>
        For solar and battery installers. Enter the business Decision Brief
        code — you get an API key to push quotes into their energy brief. Power
        retailers use a separate link.
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
            Quote push example:
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
          >{`POST /api/decision-brief/installer/push
Authorization: Bearer ${apiKey}
{ "solarKw": 40, "batteryKwh": 30, "quoteAud": 48500, "paybackYears": 5.5 }`}</pre>
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
            Installer / company name
            <input
              value={installerName}
              onChange={(e) => setInstallerName(e.target.value)}
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
