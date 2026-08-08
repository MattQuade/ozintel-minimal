'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  isHandsfreeEnabled,
  requestVoiceListen,
} from '@/lib/voice/handsfreeSession';
import {
  PLATFORM_VOICE_EXAMPLES,
  parsePlatformVoiceCommand,
} from '@/lib/voice/platformNav';
import { getSpeechRecognitionCtor } from '@/lib/voice/speechRecognition';

type Variant = 'home' | 'hub';

type Props = {
  /** Visual style — home matches OzIntel dark alerts page. */
  variant?: Variant;
  /** Extra examples shown under the control. */
  examples?: string[];
};

export default function VoiceNavBar({
  variant = 'home',
  examples = PLATFORM_VOICE_EXAMPLES,
}: Props) {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()));
    setListening(isHandsfreeEnabled());

    const sync = (e: Event) => {
      const detail = (e as CustomEvent<{ on?: boolean }>).detail;
      setListening(Boolean(detail?.on ?? isHandsfreeEnabled()));
    };
    window.addEventListener('ozintel-voice-handsfree', sync as EventListener);
    window.addEventListener('ozintel-voice-listen', sync as EventListener);
    return () => {
      window.removeEventListener(
        'ozintel-voice-handsfree',
        sync as EventListener
      );
      window.removeEventListener(
        'ozintel-voice-listen',
        sync as EventListener
      );
    };
  }, []);

  const goTyped = async (transcript: string) => {
    const raw = transcript.trim();
    if (!raw) return;
    setError('');
    setHint('');

    const cmd = parsePlatformVoiceCommand(raw);
    if (!cmd) {
      setError(
        `Didn’t catch that. Try “Open Accounting”, “Edit invoice”, or “Add date to invoice number”.`
      );
      return;
    }

    if (cmd.type === 'stop_listening') {
      requestVoiceListen(false);
      setHint('Stopped listening');
      setListening(false);
      return;
    }

    if (cmd.type === 'navigate' || cmd.type === 'edit_invoices') {
      setBusy(true);
      setHint(`Opening ${cmd.label}…`);
      router.push(cmd.href);
      return;
    }

    setBusy(true);
    setHint(`${cmd.label}…`);
    try {
      const res = await fetch('/api/invoices/voice-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: raw }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Command failed');
      }
      setHint(data.label || cmd.label);
      if (data.href) router.push(data.href);
      else setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed');
      setBusy(false);
      setHint('');
    }
  };

  const toggleListen = () => {
    if (listening) {
      requestVoiceListen(false);
      setListening(false);
      setHint('');
    } else {
      setError('');
      setHint('Hands-free on — keep giving commands after each page opens');
      requestVoiceListen(true);
      setListening(true);
    }
  };

  const isHome = variant === 'home';

  const wrapStyle: CSSProperties = isHome
    ? {
        background: '#1e2937',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: 16,
        margin: 0,
        maxWidth: 400,
        textAlign: 'left',
        width: '90%',
        boxSizing: 'border-box',
      }
    : {
        background: '#fff7ed',
        border: '1px solid #fed7aa',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        textAlign: 'left',
      };

  const labelColor = isHome ? '#e2e8f0' : '#9a3412';
  const mutedColor = isHome ? '#94a3b8' : '#78716c';
  const inputStyle: CSSProperties = isHome
    ? {
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid #475569',
        background: '#0f172a',
        color: 'white',
        fontSize: '0.95rem',
        marginTop: 8,
      }
    : {
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid #d6d3d1',
        background: 'white',
        fontSize: '0.95rem',
        marginTop: 8,
      };

  return (
    <div style={wrapStyle}>
      <p
        style={{
          margin: 0,
          fontWeight: 700,
          color: labelColor,
          fontSize: '1.05rem',
        }}
      >
        Voice command
      </p>
      <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: mutedColor }}>
        Tap Speak once, then keep talking across pages. Say “stop listening”
        when done. {examples.slice(0, 3).join(' · ')}
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 12,
        }}
      >
        {supported ? (
          <button
            type="button"
            disabled={busy}
            onClick={toggleListen}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              background: listening ? '#dc2626' : isHome ? '#0ea5e9' : '#0f172a',
              color: 'white',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {listening ? 'Stop' : 'Speak'}
          </button>
        ) : (
          <span style={{ fontSize: '0.8rem', color: mutedColor }}>
            Mic needs Chrome/Edge — type below instead.
          </span>
        )}
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => void goTyped(text)}
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            border: 'none',
            cursor: busy || !text.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 700,
            background: isHome ? '#f97316' : '#ea580c',
            color: 'white',
            opacity: busy || !text.trim() ? 0.5 : 1,
          }}
        >
          Go
        </button>
      </div>

      <input
        type="text"
        value={text}
        disabled={busy}
        placeholder="Or type: Edit invoice"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void goTyped(text);
        }}
        style={inputStyle}
      />

      {hint && (
        <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#38bdf8' }}>
          {hint}
        </p>
      )}
      {error && (
        <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#f87171' }}>
          {error}
        </p>
      )}
    </div>
  );
}
