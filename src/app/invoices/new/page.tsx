'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';
import InvoiceEditorForm from '@/components/invoices/InvoiceEditorForm';
import VoiceNavBar from '@/components/VoiceNavBar';
import { parsePlatformVoiceCommand } from '@/lib/voice/platformNav';
import { readResponseJson } from '@/lib/readResponseJson';

type Customer = { id: string; name: string };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: {
    results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }>;
  }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function NewInvoiceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const blank = searchParams.get('blank') === '1';
  const preselectId = String(searchParams.get('customerId') || '').trim();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(preselectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [autoTried, setAutoTried] = useState(false);

  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceHint, setVoiceHint] = useState('');
  const [candidates, setCandidates] = useState<Customer[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(Array.isArray(d) ? d : []))
      .catch(() => {});
    setVoiceSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const createFromLast = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/invoices/from-last', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: id }),
      });
      const data = await readResponseJson<{
        success?: boolean;
        error?: string;
        invoice?: { id: string };
      }>(res);
      if (!res.ok || !data.success || !data.invoice?.id) {
        throw new Error(
          data.error || 'Could not create draft from last invoice'
        );
      }
      router.push(`/invoices/${data.invoice.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setBusy(false);
    }
  };

  const runVoiceCommand = useCallback(
    async (transcript: string, pickCustomerId?: string) => {
      const text = transcript.trim();
      if (!text) return;
      setBusy(true);
      setError('');
      setCandidates([]);
      setVoiceHint('');
      try {
        // Platform commands e.g. "Select customer …" / "Open Invoices"
        if (!pickCustomerId) {
          const platform = parsePlatformVoiceCommand(text);
          if (platform?.type === 'navigate' || platform?.type === 'edit_invoices') {
            router.push(platform.href);
            return;
          }
          if (platform?.type === 'select_customer') {
            const res = await fetch('/api/invoices/voice-action', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transcript: text }),
            });
            const data = await readResponseJson<{
              success?: boolean;
              error?: string;
              href?: string;
              ambiguous?: boolean;
              candidates?: Customer[];
            }>(res);
            if (data.ambiguous && Array.isArray(data.candidates)) {
              setCandidates(
                data.candidates.map((c: Customer) => ({
                  id: c.id,
                  name: c.name,
                }))
              );
              setError(data.error || 'Pick a customer');
              setBusy(false);
              return;
            }
            if (!res.ok || !data.success) {
              throw new Error(data.error || 'Voice command failed');
            }
            if (data.href) {
              router.push(data.href);
              return;
            }
          }
          if (
            platform &&
            platform.type !== 'stop_listening' &&
            (platform.type === 'edit_invoice' ||
              platform.type === 'append_invoice_suffix')
          ) {
            const res = await fetch('/api/invoices/voice-action', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transcript: text }),
            });
            const data = await readResponseJson<{
              success?: boolean;
              error?: string;
              href?: string;
            }>(res);
            if (!res.ok || !data.success) {
              throw new Error(data.error || 'Voice command failed');
            }
            if (data.href) router.push(data.href);
            else setBusy(false);
            return;
          }
        }

        const res = await fetch('/api/invoices/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: text,
            customerId: pickCustomerId || undefined,
          }),
        });
        const data = await readResponseJson<{
          success?: boolean;
          error?: string;
          invoice?: { id: string };
          ambiguous?: boolean;
          candidates?: Customer[];
        }>(res);
        if (data.ambiguous && Array.isArray(data.candidates)) {
          setCandidates(
            data.candidates.map((c: Customer) => ({
              id: c.id,
              name: c.name,
            }))
          );
          setError(data.error || 'Pick a customer');
          setBusy(false);
          return;
        }
        if (!res.ok || !data.success || !data.invoice?.id) {
          throw new Error(data.error || 'Voice command failed');
        }
        router.push(`/invoices/${data.invoice.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Voice command failed');
        setBusy(false);
      }
    },
    [router]
  );

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  };

  const startListening = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError('Voice needs Chrome or Edge on this device');
      return;
    }
    setError('');
    setCandidates([]);
    setVoiceHint('Listening… say e.g. “invoice Wagga Rugby same as last”');

    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = 'en-AU';
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = '';

    rec.onresult = (event) => {
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        parts.push(event.results[i][0].transcript);
      }
      const text = parts.join(' ').trim();
      finalText = text;
      setVoiceText(text);
    };

    rec.onerror = (event) => {
      setListening(false);
      if (event.error === 'not-allowed') {
        setError('Microphone permission blocked — allow mic for this site');
      } else if (event.error !== 'aborted') {
        setError(`Voice error: ${event.error || 'unknown'}`);
      }
    };

    rec.onend = () => {
      setListening(false);
      setVoiceHint('');
      if (finalText.trim()) {
        void runVoiceCommand(finalText);
      }
    };

    try {
      rec.start();
      setListening(true);
    } catch {
      setError('Could not start microphone');
      setListening(false);
    }
  };

  useEffect(() => {
    if (blank || !preselectId || autoTried) return;
    setAutoTried(true);
    void createFromLast(preselectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blank, preselectId, autoTried]);

  if (blank) {
    return <InvoiceEditorForm />;
  }

  return (
    <div className="p-8 max-w-lg mx-auto">
      <h1 className="text-3xl font-bold mb-2">New invoice</h1>
      <p className="text-slate-500 mb-6">
        Pick a customer — or say “Select customer” / “Select customer [name]” —
        to open a draft from their last invoice.
      </p>

      <VoiceNavBar
        variant="hub"
        examples={[
          'Select customer',
          'Select customer Wagga Rugby',
          'Invoice Wagga Rugby same as last',
        ]}
      />

      {customers.length === 0 && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          No customers yet.{' '}
          <Link href="/customers" className="font-medium underline">
            Add a customer
          </Link>{' '}
          first.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 mb-6">
        <div>
          <p className="text-sm font-medium text-slate-800 mb-1">Voice</p>
          <p className="text-xs text-slate-500 mb-3">
            Try: “Select customer [name]”, “invoice [customer] same as last”, or
            “invoice [customer] for 2 kegs at 280 and delivery at 40”. Opens a
            draft to review — never auto-finalises.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {voiceSupported ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => (listening ? stopListening() : startListening())}
                className={`px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 ${
                  listening
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {listening ? 'Stop' : 'Speak command'}
              </button>
            ) : (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Mic needs Chrome or Edge. You can still type a command below.
              </p>
            )}
            <button
              type="button"
              disabled={busy || !voiceText.trim()}
              onClick={() => runVoiceCommand(voiceText)}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create draft from command'}
            </button>
          </div>
          <textarea
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm min-h-[72px]"
            placeholder="Heard / typed command appears here"
            value={voiceText}
            disabled={busy}
            onChange={(e) => setVoiceText(e.target.value)}
          />
          {voiceHint && (
            <p className="text-xs text-orange-700 mt-2">{voiceHint}</p>
          )}
          {candidates.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-600">Which customer?</p>
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => runVoiceCommand(voiceText, c.id)}
                  className="block w-full text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-orange-300 text-sm"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <label className="block text-sm text-slate-600 mb-1">Customer</label>
          <select
            className="w-full border border-slate-300 rounded-xl px-3 py-2"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={busy}
          >
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="text-sm text-red-600 space-y-2">
            <p>{error}</p>
            <Link
              href="/invoices/new?blank=1"
              className="font-medium text-orange-700 hover:underline"
            >
              Start a blank invoice instead
            </Link>
          </div>
        )}

        <button
          type="button"
          disabled={busy || !customerId}
          onClick={() => createFromLast(customerId)}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium px-6 py-2.5 rounded-xl disabled:opacity-50"
        >
          {busy ? 'Creating draft…' : 'Create draft from last invoice'}
        </button>

        <p className="text-center text-sm text-slate-500">
          First time for this customer?{' '}
          <Link
            href="/invoices/new?blank=1"
            className="text-orange-700 hover:underline font-medium"
          >
            Start blank
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function NewInvoicePage() {
  return (
    <AccountingGate
      section="Invoices"
      backHref="/invoices"
      backLabel="← Back to Invoices"
    >
      <Suspense fallback={<div className="p-8 text-slate-500">Loading…</div>}>
        <NewInvoiceContent />
      </Suspense>
    </AccountingGate>
  );
}
