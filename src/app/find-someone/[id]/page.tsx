'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';

type PostCard = {
  id: string;
  placeText: string;
  approxDate: string;
  question: string;
  createdAt: string;
  status: string;
};

type AnswerRow = {
  id: string;
  answerText: string;
  createdAt: string;
  accepted?: boolean;
};

type MessageRow = {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
};

export default function FindSomeonePostPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const [post, setPost] = useState<PostCard | null>(null);
  const [viewerRole, setViewerRole] = useState('visitor');
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [canMessage, setCanMessage] = useState(false);
  const [myAnswerSubmitted, setMyAnswerSubmitted] = useState(false);
  const [answerText, setAnswerText] = useState('');
  const [showAnswerBox, setShowAnswerBox] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [chatBody, setChatBody] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/find-someone/${encodeURIComponent(id)}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Could not load post');
    }
    setPost(data.post || null);
    setViewerRole(String(data.viewerRole || 'visitor'));
    setAnswers(Array.isArray(data.answers) ? data.answers : []);
    setCanMessage(Boolean(data.canMessage));
    setMyAnswerSubmitted(Boolean(data.myAnswerSubmitted));
    if (data.canMessage) {
      const msgRes = await fetch(
        `/api/find-someone/${encodeURIComponent(id)}/messages`,
        { credentials: 'include', cache: 'no-store' }
      );
      const msgData = await msgRes.json().catch(() => ({}));
      if (msgRes.ok && msgData.success) {
        setMessages(Array.isArray(msgData.messages) ? msgData.messages : []);
      }
    }
  }, [id]);

  useEffect(() => {
    void load().catch((err) =>
      setStatus(err instanceof Error ? err.message : 'Load failed')
    );
  }, [load]);

  const submitAnswer = async () => {
    setBusy(true);
    setStatus('');
    try {
      const res = await fetch(`/api/find-someone/${encodeURIComponent(id)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer', answerText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not submit answer');
      }
      setAnswerText('');
      setShowAnswerBox(false);
      setStatus('Answer sent — only the poster can see it.');
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const accept = async (answerId: string) => {
    setBusy(true);
    setStatus('');
    try {
      const res = await fetch(`/api/find-someone/${encodeURIComponent(id)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', answerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not accept');
      }
      setStatus('Matched — private chat is open.');
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const sendChat = async () => {
    setBusy(true);
    setStatus('');
    try {
      const res = await fetch(
        `/api/find-someone/${encodeURIComponent(id)}/messages`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: chatBody }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not send');
      }
      setChatBody('');
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={page}>
      <a href="/find-someone" style={{ color: '#38bdf8', textDecoration: 'none' }}>
        ← Find Someone
      </a>
      {!post ? (
        <p style={{ color: '#94a3b8', marginTop: 16 }}>
          {status || 'Loading…'}
        </p>
      ) : (
        <>
          <h1 style={{ color: '#22d3ee', margin: '16px 0 8px', fontSize: '1.5rem' }}>
            {post.placeText}
          </h1>
          <p style={{ color: '#94a3b8', marginTop: 0 }}>
            Approx {post.approxDate} · {post.status}
          </p>
          <section style={card}>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Question</div>
            <p style={{ margin: '6px 0 0', color: '#e2e8f0', fontSize: '1.1rem' }}>
              {post.question}
            </p>
          </section>

          {status ? (
            <p style={{ color: '#cbd5e1', fontSize: '0.95rem' }}>{status}</p>
          ) : null}

          {viewerRole === 'visitor' && post.status === 'open' ? (
            <section style={{ ...card, marginTop: 16 }}>
              {!showAnswerBox ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowAnswerBox(true)}
                  style={btn('#15803d')}
                >
                  I recognise this
                </button>
              ) : (
                <>
                  <label style={label}>
                    Your answer (only the poster sees this)
                    <textarea
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      rows={3}
                      style={{ ...input, resize: 'vertical' }}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void submitAnswer()}
                      style={btn('#0ea5e9')}
                    >
                      Send answer
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setShowAnswerBox(false)}
                      style={btn('#334155')}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </section>
          ) : null}

          {viewerRole === 'answered' || myAnswerSubmitted ? (
            <p style={{ color: '#94a3b8' }}>
              Your answer was sent anonymously. Waiting for the poster.
            </p>
          ) : null}

          {viewerRole === 'author' ? (
            <section style={{ ...card, marginTop: 16 }}>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>
                Answers (only you see these)
              </h2>
              {answers.length === 0 ? (
                <p style={{ color: '#64748b', marginBottom: 0 }}>
                  No answers yet.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {answers.map((a) => (
                    <li
                      key={a.id}
                      style={{
                        borderTop: '1px solid #334155',
                        padding: '12px 0',
                      }}
                    >
                      <p style={{ margin: '0 0 8px', color: '#e2e8f0' }}>
                        {a.answerText}
                      </p>
                      {post.status === 'open' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void accept(a.id)}
                          style={btn('#7c3aed')}
                        >
                          This is them — open chat
                        </button>
                      ) : a.accepted ? (
                        <span style={{ color: '#4ade80' }}>Accepted</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {canMessage ? (
            <section style={{ ...card, marginTop: 16 }}>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>
                Private messages
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 0 }}>
                Still anonymous to everyone else. Only you two see this thread.
              </p>
              <div
                style={{
                  maxHeight: 320,
                  overflowY: 'auto',
                  marginBottom: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {messages.length === 0 ? (
                  <p style={{ color: '#64748b' }}>No messages yet.</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.mine ? 'flex-end' : 'flex-start',
                        background: m.mine ? '#1d4ed8' : '#334155',
                        color: 'white',
                        borderRadius: 10,
                        padding: '8px 12px',
                        maxWidth: '85%',
                      }}
                    >
                      {m.body}
                    </div>
                  ))
                )}
              </div>
              <textarea
                value={chatBody}
                onChange={(e) => setChatBody(e.target.value)}
                rows={2}
                placeholder="Write a message…"
                style={{ ...input, resize: 'vertical', marginBottom: 8 }}
              />
              <button
                type="button"
                disabled={busy || !chatBody.trim()}
                onClick={() => void sendChat()}
                style={btn('#0ea5e9')}
              >
                Send
              </button>
            </section>
          ) : null}
        </>
      )}
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
