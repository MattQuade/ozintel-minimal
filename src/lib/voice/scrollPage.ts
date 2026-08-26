/** Default voice scroll: half of the visible screen. */
export const VOICE_SCROLL_FRACTION = 1 / 2;

export function scrollPageByViewport(
  direction: "down" | "up",
  fraction = VOICE_SCROLL_FRACTION
): number {
  if (typeof window === "undefined") return 0;
  const delta = Math.max(1, Math.round(window.innerHeight * fraction));
  const top = direction === "down" ? delta : -delta;
  window.scrollBy({ top, left: 0, behavior: "smooth" });
  return top;
}
