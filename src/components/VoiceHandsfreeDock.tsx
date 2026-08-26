'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  getPendingInvoiceEmail,
  getPendingInvoiceField,
  isAwaitingCustomerName,
  isAwaitingInvoiceNumberSuffix,
  isHandsfreeEnabled,
  notifyInvoiceUpdated,
  requestVoiceListen,
  setAwaitingCustomerName,
  setAwaitingInvoiceNumberSuffix,
  setHandsfreeEnabled,
  setPendingInvoiceEmail,
  setPendingInvoiceField,
  takePendingLineIndex,
  todayIsoLocal,
} from '@/lib/voice/handsfreeSession';
import {
  invoiceIdFromPath,
  parsePlatformVoiceCommand,
} from '@/lib/voice/platformNav';
import { scrollPageByViewport } from '@/lib/voice/scrollPage';
import {
  parseSpokenFullInvoiceNumber,
  parseSpokenNumberSuffix,
} from '@/lib/voice/spokenNumberSuffix';
import {
  getSpeechRecognitionCtor,
  type SpeechRecognitionLike,
} from '@/lib/voice/speechRecognition';

function killRecognition(rec: SpeechRecognitionLike | null) {
  if (!rec) return;
  rec.onend = null;
  rec.onresult = null;
  rec.onerror = null;
  try {
    rec.abort?.();
  } catch {
    /* ignore */
  }
  try {
    rec.stop();
  } catch {
    /* ignore */
  }
}

/**
 * Persistent hands-free mic — lives in the root layout so it keeps listening
 * across page changes after the user taps Speak once.
 */
export default function VoiceHandsfreeDock() {
  const router = useRouter();
  const pathname = usePathname();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [lastHeard, setLastHeard] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListenRef = useRef(false);
  const recGenRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const stopRecognition = useCallback((clearSession: boolean) => {
    wantListenRef.current = false;
    recGenRef.current += 1;
    clearRestartTimer();
    if (clearSession) setHandsfreeEnabled(false);
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    killRecognition(rec);
    setListening(false);
    setInterim('');
    if (clearSession) {
      setHint('');
      setVisible(false);
    }
  }, []);

  const runCommand = useCallback(
    async (transcript: string) => {
      const raw = transcript.trim();
      if (!raw || processingRef.current) return;

      let cmd = parsePlatformVoiceCommand(raw);
      const pendingField = getPendingInvoiceField();
      const interruptPending =
        cmd?.type === 'stop_listening' ||
        cmd?.type === 'go_back' ||
        cmd?.type === 'cancel_send' ||
        cmd?.type === 'scroll_down' ||
        cmd?.type === 'scroll_up';

      if (pendingField?.awaitingLineIndex && !interruptPending && !cmd) {
        const taken = takePendingLineIndex(raw);
        if (taken?.ok === false) {
          setError(taken.error);
          return;
        }
        if (taken?.ok) {
          setError('');
          setHint(taken.hint);
          return;
        }
      }
      const dictationField =
        pendingField &&
        (pendingField.field === 'notes' ||
          pendingField.field === 'description' ||
          pendingField.field === 'subject' ||
          pendingField.field === 'matchKeyword');

      if (pendingField && !interruptPending && (dictationField || !cmd)) {
        processingRef.current = true;
        setBusy(true);
        setError('');
        setHint('Saving…');
        try {
          const res = await fetch('/api/invoices/voice-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              field: pendingField.field,
              value: raw,
              invoiceId: pendingField.invoiceId,
              lineIndex: pendingField.lineIndex,
              createLine: pendingField.createLine,
              asOfDate: todayIsoLocal(),
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Could not update invoice');
          }
          setPendingInvoiceField(null);
          setHint(data.label || 'Saved');
          notifyInvoiceUpdated();
          if (data.href) router.push(data.href);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Update failed');
        } finally {
          processingRef.current = false;
          setBusy(false);
        }
        return;
      }

      // After “Select customer”, the next utterance is the customer name
      if (!cmd && isAwaitingCustomerName()) {
        cmd = {
          type: 'select_customer',
          customerQuery: raw,
          label: `Select customer ${raw}`,
        };
      }

      // After “Edit invoice number”, the next utterance is the dash/digit suffix
      if (!cmd && isAwaitingInvoiceNumberSuffix()) {
        if (/^(the\s+)?date(\s+suffix)?$/i.test(raw.trim())) {
          cmd = {
            type: 'edit_invoice_number',
            label: 'Add date to invoice number',
            useIssueDate: true,
          };
        } else {
          const replacement = parseSpokenFullInvoiceNumber(raw);
          if (replacement) {
            cmd = {
              type: 'edit_invoice_number',
              label: `Invoice number ${replacement}`,
              replacement,
            };
          } else {
            const suffix = parseSpokenNumberSuffix(raw);
            if (suffix) {
              cmd = {
                type: 'edit_invoice_number',
                label: `Edit invoice number ${suffix}`,
                suffix,
              };
            } else {
              setError(
                `Could not hear a number in “${raw}”. Try “two four six” or “dash zero seven zero nine dash twenty six”.`
              );
              return;
            }
          }
        }
      }

      // On the new-invoice picker, a bare name can select the customer
      if (
        !cmd &&
        (pathnameRef.current === '/invoices/new' ||
          pathnameRef.current.startsWith('/invoices/new?'))
      ) {
        const looksLikeName =
          raw.split(/\s+/).length <= 6 &&
          !/^(open|create|edit|add|stop|go|show)\b/i.test(raw);
        if (looksLikeName) {
          cmd = {
            type: 'select_customer',
            customerQuery: raw,
            label: `Select customer ${raw}`,
          };
        }
      }

      if (!cmd) {
        setError(
          isAwaitingCustomerName()
            ? `Say the customer name (heard “${raw}”).`
            : isAwaitingInvoiceNumberSuffix()
              ? `Say the number suffix (heard “${raw}”).`
              : getPendingInvoiceField()
                ? `Say ${getPendingInvoiceField()?.prompt || 'the value'} (heard “${raw}”).`
                : `Didn’t catch “${raw}”. Try “Open Railway Hotel 246”, or say “stop listening”.`
        );
        return;
      }

      if (cmd.type === 'stop_listening') {
        setHint('Stopped listening');
        setAwaitingCustomerName(false);
        setAwaitingInvoiceNumberSuffix(false);
        setPendingInvoiceEmail(null);
        setPendingInvoiceField(null);
        stopRecognition(true);
        return;
      }

      if (cmd.type === 'go_back') {
        setAwaitingCustomerName(false);
        setAwaitingInvoiceNumberSuffix(false);
        setPendingInvoiceEmail(null);
        setPendingInvoiceField(null);
        setHint('Going back…');
        router.back();
        return;
      }

      if (cmd.type === 'scroll_down' || cmd.type === 'scroll_up') {
        scrollPageByViewport(cmd.type === 'scroll_up' ? 'up' : 'down');
        setHint(cmd.label);
        return;
      }

      if (cmd.type === 'cancel_send') {
        if (getPendingInvoiceEmail()) {
          setPendingInvoiceEmail(null);
          setHint('Email cancelled');
        } else if (getPendingInvoiceField()) {
          setPendingInvoiceField(null);
          setHint('Cancelled');
        }
        return;
      }

      if (cmd.type === 'confirm_send') {
        const pending = getPendingInvoiceEmail();
        if (!pending) return;
        processingRef.current = true;
        setBusy(true);
        setError('');
        setHint(`Sending ${pending.invoiceNumber}…`);
        try {
          const res = await fetch(`/api/invoices/${pending.invoiceId}/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm: true, to: pending.to }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Email failed');
          }
          setPendingInvoiceEmail(null);
          setHint(data.label || `Sent to ${pending.to}`);
          if (data.href) router.push(data.href);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Email failed');
        } finally {
          processingRef.current = false;
          setBusy(false);
        }
        return;
      }

      processingRef.current = true;
      setBusy(true);
      setError('');
      setHint(cmd.label);

      try {
        if (cmd.type === 'navigate' || cmd.type === 'edit_invoices') {
          if (
            cmd.label === 'Select customer' ||
            cmd.href === '/invoices/new'
          ) {
            setAwaitingCustomerName(true);
            setAwaitingInvoiceNumberSuffix(false);
            setHint('Say the customer name…');
          } else {
            setAwaitingCustomerName(false);
            setAwaitingInvoiceNumberSuffix(false);
            setPendingInvoiceField(null);
          }
          router.push(cmd.href);
          return;
        }

        if (cmd.type === 'delete_invoice_number') {
          const res = await fetch('/api/invoices/voice-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcript: raw,
              invoiceId: invoiceIdFromPath(pathnameRef.current),
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Could not reset invoice number');
          }
          setAwaitingInvoiceNumberSuffix(false);
          setHint(data.label || cmd.label);
          notifyInvoiceUpdated();
          if (data.href) router.push(data.href);
          return;
        }

        if (cmd.type === 'edit_invoice_number') {
          if (!cmd.suffix && !cmd.useIssueDate && !cmd.replacement) {
            setAwaitingInvoiceNumberSuffix(true);
            setAwaitingCustomerName(false);
            setHint('Say the new number… e.g. two four six');
            return;
          }
          const spoken = cmd.useIssueDate
            ? 'edit invoice number date'
            : cmd.replacement
              ? `edit invoice number ${cmd.replacement}`
              : `edit invoice number ${cmd.suffix}`;
          const res = await fetch('/api/invoices/voice-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcript: spoken,
              invoiceId: invoiceIdFromPath(pathnameRef.current),
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Could not update invoice number');
          }
          setAwaitingInvoiceNumberSuffix(false);
          setHint(data.label || cmd.label);
          notifyInvoiceUpdated();
          if (data.href) router.push(data.href);
          return;
        }

        if (cmd.type === 'select_customer') {
          const res = await fetch('/api/invoices/voice-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcript: `select customer ${cmd.customerQuery}`,
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Could not select customer');
          }
          setAwaitingCustomerName(false);
          setAwaitingInvoiceNumberSuffix(false);
          setHint(data.label || cmd.label);
          if (data.href) router.push(data.href);
          return;
        }

        if (cmd.type === 'add_line_item' || cmd.type === 'edit_invoice_field') {
          const invoiceId = invoiceIdFromPath(pathnameRef.current);
          const res = await fetch('/api/invoices/voice-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcript: raw,
              invoiceId,
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Could not edit invoice');
          }
          if (data.needsValue && data.field && data.invoiceId) {
            setPendingInvoiceField({
              invoiceId: data.invoiceId,
              field: data.field,
              prompt: data.prompt || data.label || 'Say the value…',
              valuePrompt: data.valuePrompt,
              lineIndex: data.lineIndex,
              createLine: Boolean(data.createLine),
              awaitingLineIndex: Boolean(data.awaitingLineIndex),
            });
            setHint(data.prompt || data.label);
            if (data.href) router.push(data.href);
            return;
          }
          setPendingInvoiceField(null);
          setHint(data.label || cmd.label);
          notifyInvoiceUpdated();
          if (data.href) router.push(data.href);
          return;
        }

        if (cmd.type === 'email_invoice') {
          const invoiceId = invoiceIdFromPath(pathnameRef.current);
          const res = await fetch('/api/invoices/voice-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcript: raw,
              invoiceId,
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Could not email invoice');
          }
          if (data.needsConfirm && data.invoiceId && data.to) {
            setPendingInvoiceEmail({
              invoiceId: data.invoiceId,
              to: data.to,
              invoiceNumber: data.invoiceNumber || '',
            });
            setHint(data.label || `Email to ${data.to}? Say send.`);
            if (data.href) router.push(data.href);
            return;
          }
          setPendingInvoiceEmail(null);
          setHint(data.label || cmd.label);
          if (data.href) router.push(data.href);
          return;
        }

        const res = await fetch('/api/invoices/voice-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: raw,
            invoiceId: invoiceIdFromPath(pathnameRef.current),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Command failed');
        }
        setAwaitingCustomerName(false);
        setAwaitingInvoiceNumberSuffix(false);
        setHint(data.label || cmd.label);
        if (data.href) router.push(data.href);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Command failed');
      } finally {
        processingRef.current = false;
        setBusy(false);
      }
    },
    [router, stopRecognition]
  );

  const startRecognition = useCallback((opts?: { freshHint?: boolean }) => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError('Voice needs Chrome or Edge');
      setHandsfreeEnabled(false);
      return;
    }

    clearRestartTimer();
    wantListenRef.current = true;
    setHandsfreeEnabled(true);
    setVisible(true);
    setError('');
    setListening(true);
    if (opts?.freshHint) {
      setHint('Listening… keep giving commands');
    }

    const gen = ++recGenRef.current;
    const previous = recognitionRef.current;
    recognitionRef.current = null;
    killRecognition(previous);

    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = 'en-AU';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event) => {
      if (recGenRef.current !== gen) return;
      let interimBits = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript.trim();
        if (!piece) continue;
        if (event.results[i].isFinal) {
          setLastHeard(piece);
          setInterim('');
          void runCommand(piece);
        } else {
          interimBits += (interimBits ? ' ' : '') + piece;
        }
      }
      if (interimBits) setInterim(interimBits);
    };

    rec.onerror = (event) => {
      if (recGenRef.current !== gen) return;
      const err = event.error || '';
      // Benign — Chrome ends / no-speech often; we restart from onend
      if (err === 'no-speech' || err === 'aborted' || err === 'network') {
        return;
      }
      if (err === 'not-allowed') {
        setError('Microphone blocked — allow mic for this site');
        stopRecognition(true);
        return;
      }
      setError(`Voice error: ${err}`);
    };

    rec.onend = () => {
      if (recGenRef.current !== gen) return;
      if (!wantListenRef.current || !isHandsfreeEnabled()) {
        setListening(false);
        return;
      }
      // Chrome pauses between phrases. Stay on “Listening…” and restart this instance.
      clearRestartTimer();
      restartTimerRef.current = setTimeout(() => {
        if (recGenRef.current !== gen) return;
        if (!wantListenRef.current || !isHandsfreeEnabled()) return;
        try {
          rec.start();
          setListening(true);
        } catch {
          startRecognition();
        }
      }, 400);
    };

    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(true);
    }
  }, [runCommand, stopRecognition]);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()));

    const onListenRequest = (e: Event) => {
      const detail = (e as CustomEvent<{ on?: boolean }>).detail;
      if (detail?.on) startRecognition({ freshHint: true });
      else stopRecognition(true);
    };

    window.addEventListener(
      'ozintel-voice-listen',
      onListenRequest as EventListener
    );

    // Resume after refresh / remount if session still on
    if (isHandsfreeEnabled()) {
      setVisible(true);
      startRecognition();
    }

    return () => {
      window.removeEventListener(
        'ozintel-voice-listen',
        onListenRequest as EventListener
      );
      clearRestartTimer();
      wantListenRef.current = false;
      recGenRef.current += 1;
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      killRecognition(rec);
    };
    // intentionally once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After client navigations, resume only if Chrome dropped the session
  useEffect(() => {
    if (!isHandsfreeEnabled()) return;
    setVisible(true);
    wantListenRef.current = true;
    if (!recognitionRef.current) {
      startRecognition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!supported || !visible) return null;

  return (
    <div
      className="print:hidden"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 16,
        zIndex: 80,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          maxWidth: 440,
          width: '100%',
          background: '#0f172a',
          color: 'white',
          borderRadius: 16,
          border: '2px solid',
          borderColor: listening ? '#22c55e' : '#334155',
          boxSizing: 'border-box',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          padding: '12px 14px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: '0.95rem',
                color: listening ? '#4ade80' : '#e2e8f0',
              }}
            >
              {busy ? 'Working…' : listening ? 'Listening…' : 'Voice paused'}
            </p>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '0.8rem',
                color: '#94a3b8',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {interim ||
                hint ||
                lastHeard ||
                (typeof window !== 'undefined' && getPendingInvoiceEmail()
                  ? `Say send to email ${getPendingInvoiceEmail()?.invoiceNumber || ''}…`
                  : typeof window !== 'undefined' && getPendingInvoiceField()
                    ? getPendingInvoiceField()?.prompt || 'Say the value…'
                    : typeof window !== 'undefined' && isAwaitingCustomerName()
                    ? 'Say the customer name…'
                    : typeof window !== 'undefined' &&
                        isAwaitingInvoiceNumberSuffix()
                      ? 'Say the number suffix…'
                      : 'Say next command · “stop listening” to end')}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              listening || wantListenRef.current
                ? stopRecognition(true)
                : startRecognition({ freshHint: true })
            }
            style={{
              flexShrink: 0,
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
              background: listening ? '#dc2626' : '#0ea5e9',
              color: 'white',
            }}
          >
            {listening || wantListenRef.current ? 'Stop' : 'Speak'}
          </button>
        </div>
        {error && (
          <p
            style={{
              margin: '8px 0 0',
              fontSize: '0.8rem',
              color: '#f87171',
            }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** Used by page Speak buttons — starts the persistent dock session. */
export function startHandsfreeFromUi() {
  requestVoiceListen(true);
}

export function stopHandsfreeFromUi() {
  requestVoiceListen(false);
}
