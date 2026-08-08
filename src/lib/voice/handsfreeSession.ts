/**
 * Hands-free voice session — survives Next.js page navigations via sessionStorage
 * + a singleton SpeechRecognition owned by VoiceHandsfreeDock in the root layout.
 */

export const HANDSFREE_STORAGE_KEY = "ozintel_voice_handsfree";

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
    else sessionStorage.removeItem(HANDSFREE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent("ozintel-voice-handsfree", { detail: { on } })
  );
}

/** Ask the root-layout dock to start or stop continuous listening. */
export function requestVoiceListen(on: boolean) {
  if (typeof window === "undefined") return;
  setHandsfreeEnabled(on);
  window.dispatchEvent(
    new CustomEvent("ozintel-voice-listen", { detail: { on } })
  );
}
