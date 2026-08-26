/**
 * Parse spoken digit/dash phrases into an invoice-number suffix.
 * e.g. "dash zero seven zero nine dash twenty six" → "-0709-26"
 */

const SIMPLE: Record<string, string> = {
  zero: "0",
  oh: "0",
  o: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

const TEENS: Record<string, string> = {
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function collapse(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s-]+/g, " ")
    .replace(/-/g, " dash ")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMBER_FILLER = new Set([
  "and",
  "dash",
  "hyphen",
  "minus",
  "inv",
  "invoice",
  "invoices",
  "number",
  "no",
]);

/** True for digits, inv-246, or spoken number words (two, forty, hundred). */
export function isSpokenNumberToken(t: string): boolean {
  const x = String(t || "")
    .toLowerCase()
    .trim();
  if (!x) return false;
  if (/^\d+$/.test(x)) return true;
  if (/^inv-?\d+$/i.test(x)) return true;
  if (x === "hundred" || x === "thousand") return true;
  if (NUMBER_FILLER.has(x)) return x === "and" || x === "dash" || x === "hyphen" || x === "minus";
  return SIMPLE[x] != null || TEENS[x] != null || TENS[x] != null;
}

function parseCardinal(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let used = false;
  for (const raw of tokens) {
    const t = raw.toLowerCase();
    if (t === "and" || t === "dash" || t === "hyphen" || t === "minus") continue;
    const inv = t.match(/^inv-?(\d+)$/i);
    if (inv) {
      current += parseInt(inv[1], 10);
      used = true;
      continue;
    }
    if (/^\d+$/.test(t)) {
      current += parseInt(t, 10);
      used = true;
      continue;
    }
    if (SIMPLE[t] != null) {
      current += Number(SIMPLE[t]);
      used = true;
      continue;
    }
    if (TEENS[t] != null) {
      current += Number(TEENS[t]);
      used = true;
      continue;
    }
    if (TENS[t] != null) {
      current += TENS[t];
      used = true;
      continue;
    }
    if (t === "hundred") {
      current = (current || 1) * 100;
      used = true;
      continue;
    }
    if (t === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
      used = true;
    }
  }
  total += current;
  return used && total > 0 ? total : null;
}

/**
 * Spoken or typed invoice number → digits, e.g. "two four six" / "246" / "inv 0246" → "246".
 * Pass keepLeadingZeros when the spoken zeros are part of the invoice number.
 */
export function parseSpokenInvoiceDigits(
  phrase: string,
  opts?: { keepLeadingZeros?: boolean }
): string | null {
  const raw = String(phrase || "")
    .toLowerCase()
    .replace(/[^\w\s-]+/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;

  const tokens = raw
    .split(/\s+/)
    .filter((t) => t && t !== "inv" && t !== "invoice" && t !== "invoices" && t !== "number");
  if (!tokens.length) return null;

  const hasScale = tokens.some((t) => t === "hundred" || t === "thousand");
  if (hasScale) {
    const n = parseCardinal(tokens);
    return n != null ? String(n) : null;
  }

  const parts: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const inv = t.match(/^inv-?(\d+)$/i);
    if (inv) {
      parts.push(inv[1]);
      i += 1;
      continue;
    }
    if (/^\d+$/.test(t)) {
      parts.push(t);
      i += 1;
      continue;
    }
    if (TENS[t] != null) {
      const next = tokens[i + 1];
      if (next && SIMPLE[next] != null && SIMPLE[next].length === 1) {
        parts.push(String(TENS[t] + Number(SIMPLE[next])));
        i += 2;
        continue;
      }
      parts.push(String(TENS[t]));
      i += 1;
      continue;
    }
    if (TEENS[t] != null) {
      parts.push(TEENS[t]);
      i += 1;
      continue;
    }
    if (SIMPLE[t] != null) {
      parts.push(SIMPLE[t]);
      i += 1;
      continue;
    }
    i += 1;
  }

  let out = parts.join("");
  if (!opts?.keepLeadingZeros) {
    out = out.replace(/^0+(?=\d)/, "");
  }
  return /\d/.test(out) ? out : null;
}

/**
 * Spoken quantity or unit price: "2", "two", "two point five", "two hundred and eighty".
 */
export function parseSpokenAmount(phrase: string): number | null {
  const raw = String(phrase || "")
    .toLowerCase()
    .replace(/\$/g, " ")
    .replace(/\b(dollars?|bucks|each|ex\s+gst|including\s+gst|incl\s+gst)\b/g, " ")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;

  const typed = raw.match(/^-?\d+(?:\.\d+)?$/);
  if (typed) {
    const n = parseFloat(typed[0]);
    return Number.isFinite(n) ? n : null;
  }

  const point = raw.match(/^(.*)\s+point\s+(.+)$/);
  if (point) {
    const whole = parseSpokenInvoiceDigits(point[1]);
    const frac = parseSpokenInvoiceDigits(point[2]);
    if (whole != null && frac != null) {
      const n = parseFloat(`${whole}.${frac}`);
      return Number.isFinite(n) ? n : null;
    }
  }

  const digits = parseSpokenInvoiceDigits(raw);
  if (digits == null) return null;
  const n = parseFloat(digits);
  return Number.isFinite(n) ? n : null;
}

const LINE_INDEX_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  to: 2,
  too: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  last: -1,
};

/**
 * Spoken line index: "2", "two", "line 2", "to" (speech for two).
 * `last` is -1.
 */
export function parseSpokenLineIndex(phrase: string): number | null {
  const t = String(phrase || "")
    .toLowerCase()
    .replace(/[^\w\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  const m = t.match(
    /^(?:(?:the\s+)?(?:line|item|number|no)\s+)?(\d+|one|two|to|too|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|last)$/
  );
  if (!m) return null;
  const raw = m[1];
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return n > 0 ? n : null;
  }
  const n = LINE_INDEX_WORDS[raw];
  return n != null ? n : null;
}

/**
 * Convert a spoken/typed suffix phrase to e.g. "-0709-26".
 * Returns null if nothing useful was parsed.
 */
export function parseSpokenNumberSuffix(phrase: string): string | null {
  const raw = collapse(phrase);
  if (!raw) return null;

  // Already looks like -0709-26 or 0709-26
  const typed = raw.replace(/\s+/g, "").match(/^-?(\d{4}-\d{2}|\d{6})$/);
  if (typed) {
    const body = typed[1];
    if (body.length === 6) {
      return `-${body.slice(0, 4)}-${body.slice(4)}`;
    }
    return body.startsWith("-") ? body : `-${body}`;
  }

  const tokens = raw.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "dash" || t === "hyphen" || t === "minus") {
      parts.push("-");
      i += 1;
      continue;
    }
    if (/^\d+$/.test(t)) {
      parts.push(t);
      i += 1;
      continue;
    }
    if (TENS[t] != null) {
      const next = tokens[i + 1];
      if (next && SIMPLE[next] != null && SIMPLE[next].length === 1) {
        parts.push(String(TENS[t] + Number(SIMPLE[next])));
        i += 2;
        continue;
      }
      parts.push(String(TENS[t]));
      i += 1;
      continue;
    }
    if (TEENS[t] != null) {
      parts.push(TEENS[t]);
      i += 1;
      continue;
    }
    if (SIMPLE[t] != null) {
      parts.push(SIMPLE[t]);
      i += 1;
      continue;
    }
    // skip unknown filler words (to, the, invoice, number, add, …)
    i += 1;
  }

  let out = parts.join("");
  if (!out) return null;
  // Ensure leading dash for invoice suffix style
  if (!out.startsWith("-")) out = `-${out}`;
  // Collapse duplicate dashes
  out = out.replace(/-+/g, "-");
  // Must contain digits
  if (!/\d/.test(out)) return null;
  return out;
}

/** AU display date 07/09/26 or ISO 2026-09-07 → "-0709-26" (DDMM-YY). */
export function invoiceDateSuffixFromDate(
  dateIsoOrAu: string,
  fallback = new Date()
): string {
  const s = String(dateIsoOrAu || "").trim();
  let d: Date | null = null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  } else {
    const au = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (au) {
      let year = Number(au[3]);
      if (year < 100) year += 2000;
      d = new Date(year, Number(au[2]) - 1, Number(au[1]));
    }
  }
  if (!d || Number.isNaN(d.getTime())) d = fallback;

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `-${dd}${mm}-${yy}`;
}

/**
 * Spoken/typed full invoice number → the digits as said, e.g. 246 or 246-0709-26.
 * Does not treat a leading “dash …” as a whole number (that stays a suffix).
 * Does not pad a leading 0 unless it was spoken or typed.
 */
export function parseSpokenFullInvoiceNumber(phrase: string): string | null {
  const raw = String(phrase || "")
    .toLowerCase()
    .replace(/[^\w\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;
  if (/^(dash|hyphen|minus|-)\b/.test(raw)) return null;

  const compact = raw.replace(/\s+/g, "");
  const typed = compact.match(/^(?:inv-?)?(\d+)((?:-\d+)*)$/i);
  if (typed && /^\d/.test(typed[1])) {
    return `${typed[1]}${typed[2] || ""}`;
  }

  const parts = raw
    .split(/\s*(?:dash|hyphen|minus|-)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  const head = parts[0].replace(/^(inv|invoice|number|no)\s+/g, "").trim();
  const seq = parseSpokenInvoiceDigits(head, { keepLeadingZeros: true });
  if (!seq) return null;
  let out = seq;
  if (parts.length === 1) return out;

  const suffix = parseSpokenNumberSuffix(parts.slice(1).join(" dash "));
  if (suffix) out = `${out}${suffix}`;
  return out;
}

/** Append or replace trailing -DDMM-YY (or custom) suffix on an invoice number. */
export function applyInvoiceNumberSuffix(
  currentNumber: string,
  suffix: string
): string {
  const base = String(currentNumber || "").trim().replace(/^INV-/i, "");
  let s = String(suffix || "").trim();
  if (!s) return base;
  if (!s.startsWith("-")) s = `-${s}`;
  if (base.endsWith(s)) return base;
  // Replace an existing trailing date-style suffix -DDMM-YY
  const stripped = base.replace(/-\d{4}-\d{2}$/, "");
  return `${stripped}${s}`;
}
