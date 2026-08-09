/**
 * Hands-free voice session — survives Next.js page navigations via sessionStorage
 * + a singleton SpeechRecognition owned by VoiceHandsfreeDock in the root layout.
 */

export const HANDSFREE_STORAGE_KEY = "ozintel_voice_handsfree";
export const AWAITING_CUSTOMER_KEY = "ozintel_voice_awaiting_customer";

export function isHandsfreeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(HANDSFREE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHandsfreeEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) sessionStorage.setItem(HANDSFREE_STORAGE_KEY, "1");
    else {
      sessionStorage.removeItem(HANDSFREE_STORAGE_KEY);
      sessionStorage.removeItem(AWAITING_CUSTOMER_KEY);
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
    if (on) sessionStorage.setItem(AWAITING_CUSTOMER_KEY, "1");
    else sessionStorage.removeItem(AWAITING_CUSTOMER_KEY);
  } catch {
    /* ignore */
  }
}

/** Ask the root-layout dock to start or stop continuous listening. */
export function requestVoiceListen(on: boolean) {
  if (typeof window === "undefined") return;
  setHandsfreeEnabled(on);
  window.dispatchEvent(
    new CustomEvent("ozintel-voice-listen", { detail: { on } })
  );
}
