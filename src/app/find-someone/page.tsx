'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

type PostCard = {
  id: string;
  placeText: string;
  approxDate: string;
  question: string;
  createdAt: string;
  status: string;
};

export default function FindSomeonePage() {
  const [posts, setPosts] = useState<PostCard[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [placeText, setPlaceText] = useState('');
  const [approxDate, setApproxDate] = useState('');
  const [question, setQuestion] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/find-someone', {
      credentials: 'include',
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Could not load Find Someone');
    }
    setPosts(Array.isArray(data.posts) ? data.posts : []);
  }, []);

  useEffect(() => {
    void load().catch((err) =>
      setStatus(err instanceof Error ? err.message : 'Load failed')
    );
  }, [load]);

  const create = async () => {
    setBusy(true);
    setStatus('');
    try {
      const res = await fetch('/api/find-someone', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeText, approxDate, question }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not post');
      }
      setPlaceText('');
      setApproxDate('');
      setQuestion('');
      setStatus('Posted anonymously.');
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={page}>
      <a href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>
        ← Home
      </a>
      <h1 style={{ color: '#22d3ee', margin: '16px 0 8px' }}>Find Someone</h1>
      <p style={{ color: '#94a3b8', maxWidth: 520, marginTop: 0 }}>
        Free pathway. Posts are anonymous — no usernames. Place a location and
        approximate date, then a question only the right person would understand.
        If they recognise it and answer, only you see that answer. Accept the
        match to open a private chat.
      </p>

      {status ? (
        <p style={{ color: '#cbd5e1', fontSize: '0.95rem' }}>{status}</p>
      ) : null}

      <section style={card}>
        <h2 style={{ marginTop: 0, color: '#e2e8f0', fontSize: '1.15rem' }}>
          New anonymous post
        </h2>
        <label style={label}>
          Country / city / town + approx date (dd/mm/yyyy)
          <input
            value={placeText}
            onChange={(e) => setPlaceText(e.target.value)}
            placeholder="e.g. Baghdad, Green Zone"
            style={input}
          />
        </label>
        <label style={label}>
          Approximate date
          <input
            value={approxDate}
            onChange={(e) => setApproxDate(e.target.value)}
            placeholder="dd/mm/yyyy"
            style={input}
          />
        </label>
        <label style={label}>
          Question only they would understand
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Something only that person would know…"
            rows={3}
            style={{ ...input, resize: 'vertical' }}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void create()}
          style={btn('#0ea5e9')}
        >
          {busy ? 'Posting…' : 'Post anonymously'}
        </button>
      </section>

      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ marginTop: 0, color: '#e2e8f0', fontSize: '1.15rem' }}>
          Open posts
        </h2>
        {posts.length === 0 ? (
          <p style={{ color: '#64748b', marginBottom: 0 }}>No posts yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {posts.map((p) => (
              <li
                key={p.id}
                style={{
                  borderTop: '1px solid #334155',
                  padding: '12px 0',
                }}
              >
                <a
                  href={`/find-someone/${p.id}`}
                  style={{ color: '#38bdf8', fontWeight: 700, textDecoration: 'none' }}
                >
                  {p.placeText} · {p.approxDate}
                </a>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: 4 }}>
                  {p.status === 'open' ? 'Open' : p.status === 'matched' ? 'Matched' : p.status}
                </div>
                <div style={{ color: '#cbd5e1', marginTop: 6 }}>{p.question}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const page: CSSProperties = {
  fontFamily: 'system-ui',
  background: '#0f172a',
  color: 'white',
  minHeight: '100vh',
  padding: 20,
  boxSizing: 'border-box',
};

const card: CSSProperties = {
  background: '#1e2937',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: 16,
  maxWidth: 560,
};

const label: CSSProperties = {
  display: 'block',
  color: '#94a3b8',
  fontSize: '0.9rem',
  marginBottom: 12,
};

const input: CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  padding: 12,
  borderRadius: 8,
  border: '1px solid #475569',
  background: '#0f172a',
  color: 'white',
  boxSizing: 'border-box',
  fontSize: '1rem',
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
