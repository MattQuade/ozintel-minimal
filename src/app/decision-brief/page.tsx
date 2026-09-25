'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import AccountingGate from '@/components/AccountingGate';

type Store = {
  connectCode: string;
  energy: {
    averageMonthlyAud: number;
    monthsCovered: number;
    band: string;
    totalSpendAud: number;
    retailersSeen: string[];
    entryCount: number;
    updatedAt: string;
  } | null;
  schemeUpdates: Array<{
    id: string;
    source: string;
    title: string;
    url: string;
    snippet: string;
    fetchedAt: string;
  }>;
  retailerConnections: Array<{
    id: string;
    retailerName: string;
    contactEmail: string;
    status: string;
    apiKey: string;
    connectedAt: string;
    lastPushAt?: string;
  }>;
  installerConnections: Array<{
    id: string;
    installerName: string;
    contactEmail: string;
    status: string;
    apiKey: string;
    connectedAt: string;
    lastPushAt?: string;
  }>;
  retailerBills: Array<{
    id: string;
    amountAud?: number;
    kwh?: number;
    receivedAt: string;
    tariffNote?: string;
  }>;
  installerQuotes: Array<{
    id: string;
    solarKw?: number;
    batteryKwh?: number;
    quoteAud?: number;
    receivedAt: string;
  }>;
  brief: {
    headline: string;
    bottomLine: string[];
    figures: Array<{ label: string; value: string }>;
    whatChanged: string;
    nextAction: string;
    asOf: string;
  } | null;
};

export default function DecisionBriefPage() {
  return (
    <AccountingGate section="Decision Brief" backHref="/" backLabel="← Home">
      <DecisionBriefClient />
    </AccountingGate>
  );
}

function DecisionBriefClient() {
  const [store, setStore] = useState<Store | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/decision-brief', {
      credentials: 'include',
      cache: 'no-store',
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to load');
    }
    setStore(data.store);
  }, []);

  useEffect(() => {
    void load().catch((err) =>
      setStatus(err instanceof Error ? err.message : 'Load failed')
    );
  }, [load]);

  const run = async (action: string) => {
    setBusy(true);
    setStatus('');
    try {
      const res = await fetch('/api/decision-brief', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Action failed');
      }
      if (data.store) setStore(data.store);
      else await load();
      setStatus(
        action === 'refreshEnergy'
          ? 'Energy numbers refreshed from Accounting'
          : action === 'rotateCode'
            ? 'New connect code ready — share with your retailer'
            : 'Done'
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    setBusy(true);
    setStatus('Scanning scheme sources…');
    try {
      const res = await fetch('/api/decision-brief/scan-updates', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Scan failed');
      }
      if (data.store) setStore(data.store);
      else await load();
      setStatus(`Scan complete (${data.scanned} sources)`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setBusy(false);
    }
  };

  const brief = store?.brief;
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://ozintel.com.au';

  return (
    <main
      style={{
        fontFamily: 'system-ui',
        background: '#0f172a',
        color: 'white',
        minHeight: '100vh',
        padding: 20,
        boxSizing: 'border-box',
      }}
    >
      <a href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>
        ← Home
      </a>
      <h1 style={{ color: '#a78bfa', margin: '16px 0 8px' }}>Decision Brief</h1>
      <p style={{ color: '#94a3b8', maxWidth: 520, marginTop: 0 }}>
        Concise decision intel — not reports. Energy numbers pull from your
        Accounting silo; retailers connect with your code.
      </p>

      {status ? (
        <p style={{ color: '#cbd5e1', fontSize: '0.95rem' }}>{status}</p>
      ) : null}

      {brief ? (
        <section
          style={{
            background: '#1e2937',
            border: '1px solid #334155',
            borderRadius: 12,
            padding: 16,
            maxWidth: 560,
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            As of {brief.asOf}
          </div>
          <h2 style={{ margin: '8px 0', fontSize: '1.25rem' }}>
            {brief.headline}
          </h2>
          <ul style={{ margin: '0 0 12px', paddingLeft: 18, color: '#e2e8f0' }}>
            {brief.bottomLine.map((line) => (
              <li key={line} style={{ marginBottom: 6 }}>
                {line}
              </li>
            ))}
          </ul>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 12,
            }}
          >
            {brief.figures.map((f) => (
              <div
                key={f.label}
                style={{
                  background: '#0f172a',
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {f.label}
                </div>
                <div style={{ fontWeight: 700 }}>{f.value}</div>
              </div>
            ))}
          </div>
          <p style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>
            <strong>What changed:</strong> {brief.whatChanged}
          </p>
          <p style={{ color: '#fde68a', fontSize: '0.95rem' }}>
            <strong>Next action:</strong> {brief.nextAction}
          </p>
        </section>
      ) : (
        <p style={{ color: '#94a3b8' }}>Loading brief…</p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('refreshEnergy')}
          style={btn('#ea580c')}
        >
          Refresh from Accounting
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void scan()}
          style={btn('#7c3aed')}
        >
          Scan scheme updates
        </button>
      </div>

      <section style={card}>
        <h3 style={{ marginTop: 0, color: '#a78bfa' }}>Partner connect code</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
          One code for both power retailers and solar/battery installers. They
          use different links below.
        </p>
        <div
          style={{
            fontSize: '2rem',
            fontWeight: 800,
            letterSpacing: '0.2em',
            margin: '12px 0',
          }}
        >
          {store?.connectCode || '······'}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('rotateCode')}
          style={btn('#334155')}
        >
          Rotate code
        </button>
      </section>

      <section style={{ ...card, marginTop: 16 }}>
        <h3 style={{ marginTop: 0, color: '#38bdf8' }}>Power retailer</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
          Bill / usage data from the energy retailer.
        </p>
        <p style={{ fontSize: '0.85rem', color: '#94a3b8', wordBreak: 'break-all' }}>
          Link:{' '}
          <a href="/decision-brief/retailer" style={{ color: '#38bdf8' }}>
            {origin}/decision-brief/retailer
          </a>
        </p>
        {(store?.retailerConnections?.length || 0) > 0 ? (
          <ul style={{ marginTop: 12, paddingLeft: 18 }}>
            {store!.retailerConnections.map((c) => (
              <li key={c.id} style={{ marginBottom: 8, color: '#e2e8f0' }}>
                <strong>{c.retailerName}</strong> ({c.contactEmail}) — {c.status}
                {c.lastPushAt
                  ? ` · last push ${c.lastPushAt.slice(0, 10)}`
                  : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            No retailers connected yet.
          </p>
        )}
      </section>

      <section style={{ ...card, marginTop: 16 }}>
        <h3 style={{ marginTop: 0, color: '#fbbf24' }}>
          Solar / battery installer
        </h3>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
          Quotes and system sizes from installers (not the power company).
        </p>
        <p style={{ fontSize: '0.85rem', color: '#94a3b8', wordBreak: 'break-all' }}>
          Link:{' '}
          <a href="/decision-brief/installer" style={{ color: '#38bdf8' }}>
            {origin}/decision-brief/installer
          </a>
        </p>
        {(store?.installerConnections?.length || 0) > 0 ? (
          <ul style={{ marginTop: 12, paddingLeft: 18 }}>
            {store!.installerConnections.map((c) => (
              <li key={c.id} style={{ marginBottom: 8, color: '#e2e8f0' }}>
                <strong>{c.installerName}</strong> ({c.contactEmail}) —{' '}
                {c.status}
                {c.lastPushAt
                  ? ` · last quote ${c.lastPushAt.slice(0, 10)}`
                  : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            No installers connected yet.
          </p>
        )}
        {(store?.installerQuotes?.length || 0) > 0 ? (
          <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginTop: 12 }}>
            Latest quote:{' '}
            {store!.installerQuotes[0].solarKw
              ? `${store!.installerQuotes[0].solarKw} kW`
              : '—'}
            {store!.installerQuotes[0].batteryKwh
              ? ` / ${store!.installerQuotes[0].batteryKwh} kWh battery`
              : ''}
            {store!.installerQuotes[0].quoteAud != null
              ? ` · $${Number(store!.installerQuotes[0].quoteAud).toFixed(0)}`
              : ''}
          </p>
        ) : null}
      </section>

      {(store?.schemeUpdates?.length || 0) > 0 ? (
        <section style={{ ...card, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Recent scheme scans</h3>
          <ul style={{ paddingLeft: 18, color: '#cbd5e1' }}>
            {store!.schemeUpdates.slice(0, 5).map((u) => (
              <li key={u.id} style={{ marginBottom: 10 }}>
                <a href={u.url} style={{ color: '#38bdf8' }} target="_blank" rel="noreferrer">
                  {u.title}
                </a>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  {u.source} · {u.fetchedAt.slice(0, 10)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

const card: CSSProperties = {
  background: '#1e2937',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: 16,
  maxWidth: 560,
};

function btn(bg: string): CSSProperties {
  return {
    padding: '12px 16px',
    background: bg,
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontWeight: 700,
    cursor: 'pointer',
    touchAction: 'manipulation',
  };
}
