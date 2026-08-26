/**
 * Hands-free voice session — survives Next.js page navigations via sessionStorage
 * + a singleton SpeechRecognition owned by VoiceHandsfreeDock in the root layout.
 */

import type { InvoiceVoiceField } from "@/lib/invoices/applyInvoiceVoiceField";
import { parseSpokenLineIndex } from "@/lib/voice/spokenNumberSuffix";

export const HANDSFREE_STORAGE_KEY = "ozintel_voice_handsfree";
export const AWAITING_CUSTOMER_KEY = "ozintel_voice_awaiting_customer";
export const AWAITING_INVOICE_SUFFIX_KEY = "ozintel_voice_awaiting_invoice_suffix";
export const PENDING_EMAIL_KEY = "ozintel_voice_pending_email";
export const PENDING_INVOICE_FIELD_KEY = "ozintel_voice_pending_invoice_field";

export type PendingInvoiceEmail = {
  invoiceId: string;
  to: string;
  invoiceNumber: string;
};

export function isHandsfreeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(HANDSFREE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export type PendingInvoiceField = {
  invoiceId: string;
  field: InvoiceVoiceField;
  prompt: string;
  /** Prompt for the field value after the line number is known. */
  valuePrompt?: string;
  lineIndex?: number;
  createLine?: boolean;
  awaitingLineIndex?: boolean;
};

function clearAwaitingFlags() {
  try {
    sessionStorage.removeItem(AWAITING_CUSTOMER_KEY);
    sessionStorage.removeItem(AWAITING_INVOICE_SUFFIX_KEY);
    sessionStorage.removeItem(PENDING_EMAIL_KEY);
    sessionStorage.removeItem(PENDING_INVOICE_FIELD_KEY);
  } catch {
    /* ignore */
  }
}

export function setHandsfreeEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) sessionStorage.setItem(HANDSFREE_STORAGE_KEY, "1");
    else {
      sessionStorage.removeItem(HANDSFREE_STORAGE_KEY);
      clearAwaitingFlags();
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent("ozintel-voice-handsfree", { detail: { on } })
  );
}

export function isAwaitingCustomerName(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(AWAITING_CUSTOMER_KEY) === "1";
  } catch {
    return false;
  }
}

/** After “Select customer”, the next utterance is treated as the customer name. */
export function setAwaitingCustomerName(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) {
      sessionStorage.removeItem(AWAITING_INVOICE_SUFFIX_KEY);
      sessionStorage.removeItem(PENDING_INVOICE_FIELD_KEY);
      sessionStorage.setItem(AWAITING_CUSTOMER_KEY, "1");
    } else {
      sessionStorage.removeItem(AWAITING_CUSTOMER_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function isAwaitingInvoiceNumberSuffix(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(AWAITING_INVOICE_SUFFIX_KEY) === "1";
  } catch {
    return false;
  }
}

/** After “Edit invoice number”, the next utterance is the dash/digit suffix. */
export function setAwaitingInvoiceNumberSuffix(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) {
      sessionStorage.removeItem(AWAITING_CUSTOMER_KEY);
      sessionStorage.removeItem(PENDING_INVOICE_FIELD_KEY);
      sessionStorage.setItem(AWAITING_INVOICE_SUFFIX_KEY, "1");
    } else {
      sessionStorage.removeItem(AWAITING_INVOICE_SUFFIX_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function getPendingInvoiceEmail(): PendingInvoiceEmail | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_EMAIL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingInvoiceEmail;
    if (!parsed?.invoiceId || !parsed?.to) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setPendingInvoiceEmail(pending: PendingInvoiceEmail | null) {
  if (typeof window === "undefined") return;
  try {
    if (pending) {
      sessionStorage.removeItem(AWAITING_CUSTOMER_KEY);
      sessionStorage.removeItem(AWAITING_INVOICE_SUFFIX_KEY);
      sessionStorage.removeItem(PENDING_INVOICE_FIELD_KEY);
      sessionStorage.setItem(PENDING_EMAIL_KEY, JSON.stringify(pending));
    } else {
      sessionStorage.removeItem(PENDING_EMAIL_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function getPendingInvoiceField(): PendingInvoiceField | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_INVOICE_FIELD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingInvoiceField;
    if (!parsed?.invoiceId || !parsed?.field) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setPendingInvoiceField(pending: PendingInvoiceField | null) {
  if (typeof window === "undefined") return;
  try {
    if (pending) {
      sessionStorage.removeItem(AWAITING_CUSTOMER_KEY);
      sessionStorage.removeItem(AWAITING_INVOICE_SUFFIX_KEY);
      sessionStorage.removeItem(PENDING_EMAIL_KEY);
      sessionStorage.setItem(
        PENDING_INVOICE_FIELD_KEY,
        JSON.stringify(pending)
      );
    } else {
      sessionStorage.removeItem(PENDING_INVOICE_FIELD_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * After “Edit description”, the next utterance is the line number.
 * Returns null if we are not waiting for a line index.
 */
export function takePendingLineIndex(raw: string):
  | { ok: true; hint: string }
  | { ok: false; error: string }
  | null {
  const pending = getPendingInvoiceField();
  if (!pending?.awaitingLineIndex) return null;
  const n = parseSpokenLineIndex(raw);
  if (n == null || n < 1) {
    return {
      ok: false,
      error: `Say the line number (heard “${raw}”).`,
    };
  }
  const valuePrompt =
    pending.valuePrompt || pending.prompt || "Say the value…";
  setPendingInvoiceField({
    ...pending,
    lineIndex: n,
    awaitingLineIndex: false,
    prompt: valuePrompt,
  });
  return { ok: true, hint: `Line ${n}. ${valuePrompt}` };
}

export function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function notifyInvoiceUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("ozintel-invoice-updated"));
}

/** Ask the root-layout dock to start or stop continuous listening. */
export function requestVoiceListen(on: boolean) {
  if (typeof window === "undefined") return;
  setHandsfreeEnabled(on);
  window.dispatchEvent(
    new CustomEvent("ozintel-voice-listen", { detail: { on } })
  );
}
