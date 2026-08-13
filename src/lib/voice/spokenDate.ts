/**
 * Parse spoken / typed AU dates to yyyy-mm-dd.
 * "today" / "tomorrow" use asOf (client local day) so Render UTC does not shift the date.
 */

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  "twenty first": 21,
  "twenty second": 22,
  "twenty third": 23,
  "twenty fourth": 24,
  "twenty fifth": 25,
  "twenty sixth": 26,
  "twenty seventh": 27,
  "twenty eighth": 28,
  "twenty ninth": 29,
  thirtieth: 30,
  "thirty first": 31,
};

const SIMPLE: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

const TEENS: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
};

function collapse(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function padIso(y: number, m: number, d: number): string | null {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseAsOf(asOfDate?: string): Date {
  const s = String(asOfDate || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T12:00:00`);
  }
  return new Date();
}

function wordNumber(token: string): number | null {
  const t = token.toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (SIMPLE[t] != null) return SIMPLE[t];
  if (TEENS[t] != null) return TEENS[t];
  if (TENS[t] != null) return TENS[t];
  if (ORDINALS[t] != null) return ORDINALS[t];
  return null;
}

function parseYearTokens(tokens: string[], start: number): number | null {
  const slice = tokens.slice(start);
  if (!slice.length) return null;
  const joined = slice.join(" ");
  const digits = joined.match(/^(\d{4})$/);
  if (digits) return parseInt(digits[1], 10);
  const yy = joined.match(/^(\d{2})$/);
  if (yy) {
    const n = parseInt(yy[1], 10);
    return n >= 0 ? 2000 + n : null;
  }
  if (slice[0] === "twenty" && slice[1] && wordNumber(slice[1]) != null) {
    const low = wordNumber(slice[1])!;
    if (slice[2] && wordNumber(slice[2]) != null) {
      return 2000 + low * 10 + wordNumber(slice[2])!;
    }
    if (low >= 10) return 2000 + low;
  }
  return null;
}

function dayFromToken(t: string): number | null {
  const raw = t.replace(/(st|nd|rd|th)$/i, "");
  const n = wordNumber(raw);
  if (n != null && n >= 1 && n <= 31) return n;
  return null;
}

/**
 * Convert spoken/typed date to yyyy-mm-dd, or null if not understood.
 */
export function parseSpokenDate(
  phrase: string,
  asOfDate?: string
): string | null {
  const asOf = parseAsOf(asOfDate);
  const t = collapse(phrase)
    .replace(/\b(the|of|date|is|to|set)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;

  if (/^(today|tonight)$/.test(t)) {
    return padIso(asOf.getFullYear(), asOf.getMonth() + 1, asOf.getDate());
  }
  if (/^tomorrow$/.test(t)) {
    const d = new Date(asOf);
    d.setDate(d.getDate() + 1);
    return padIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  if (/^yesterday$/.test(t)) {
    const d = new Date(asOf);
    d.setDate(d.getDate() - 1);
    return padIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return padIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (dmy) {
    let year = dmy[3] ? Number(dmy[3]) : asOf.getFullYear();
    if (year < 100) year += 2000;
    return padIso(year, Number(dmy[2]), Number(dmy[1]));
  }

  let s = t
    .replace(/\btwenty\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b/g, "twenty $1")
    .replace(/\bthirty\s+first\b/g, "thirty first");
  for (const [phraseKey, n] of Object.entries(ORDINALS)) {
    if (phraseKey.includes(" ")) {
      s = s.replace(new RegExp(`\\b${phraseKey}\\b`, "g"), String(n));
    }
  }

  const tokens = s.split(/\s+/).filter(Boolean);
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const mon = MONTHS[tok];
    if (mon) {
      month = mon;
      continue;
    }
    const d = dayFromToken(tok);
    if (d != null && day == null) {
      day = d;
      continue;
    }
    if (tok === "twenty" || tok === "thirty") {
      const next = tokens[i + 1];
      const compound = next ? ORDINALS[`${tok} ${next}`] : null;
      if (compound && day == null) {
        day = compound;
        i += 1;
        continue;
      }
    }
    const y = parseYearTokens(tokens, i);
    if (y != null && y >= 2000) {
      year = y;
      break;
    }
  }

  if (day != null && month != null) {
    return padIso(year || asOf.getFullYear(), month, day);
  }
  return null;
}
