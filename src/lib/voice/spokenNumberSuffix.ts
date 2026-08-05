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

/** Append or replace trailing -DDMM-YY (or custom) suffix on an invoice number. */
export function applyInvoiceNumberSuffix(
  currentNumber: string,
  suffix: string
): string {
  const base = String(currentNumber || "").trim();
  let s = String(suffix || "").trim();
  if (!s) return base;
  if (!s.startsWith("-")) s = `-${s}`;
  if (base.endsWith(s)) return base;
  // Replace an existing trailing date-style suffix -DDMM-YY
  const stripped = base.replace(/-\d{4}-\d{2}$/, "");
  return `${stripped}${s}`;
}
