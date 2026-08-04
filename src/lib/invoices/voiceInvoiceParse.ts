/**
 * Parse spoken / typed invoice commands for v1 voice create.
 * Examples:
 *   "invoice Wagga Rugby same as last"
 *   "invoice Wagga Rugby for 2 kegs of pale ale at 280 and delivery at 40"
 */

export type VoiceInvoiceLine = {
  description: string;
  quantity: number;
  /** Unit price excluding GST (spoken $ treated as ex-GST unless noted). */
  unitPrice: number;
};

export type VoiceInvoiceIntent = {
  mode: "from_last" | "with_lines" | "unknown";
  customerQuery: string;
  lines: VoiceInvoiceLine[];
  raw: string;
  notes: string[];
};

export type CustomerMatch = { id: string; name: string };

const WORD_QTY: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function collapse(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w$.\s/%+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFiller(s: string): string {
  return collapse(s)
    .replace(/^(hey |ok |okay |please |can you |could you )+/g, "")
    .replace(/\b(please|thanks|thank you)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseQtyToken(tok: string): number | null {
  const t = tok.toLowerCase();
  if (WORD_QTY[t] != null) return WORD_QTY[t];
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseMoney(raw: string): number | null {
  const cleaned = String(raw)
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/\b(dollars?|bucks)\b/gi, "")
    .trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Split line-item phrases on and / comma / plus / then. */
function splitLinePhrases(rest: string): string[] {
  return collapse(rest)
    .split(/\s*(?:,|\band\b|\bplus\b|\bthen\b)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseOneLine(phrase: string): VoiceInvoiceLine | null {
  const p = collapse(phrase);
  if (!p) return null;

  // "2 kegs of pale ale at 280" / "2 x pale ale @ $280"
  let m = p.match(
    /^(\d+(?:\.\d+)?|[a-z]+)\s*(?:x|times)?\s+(.+?)\s+(?:at|@|for)\s*\$?\s*(\d+(?:\.\d+)?)\b/
  );
  if (m) {
    const qty = parseQtyToken(m[1]);
    const price = parseMoney(m[3]);
    const desc = m[2].replace(/\s+/g, " ").trim();
    // Avoid treating "delivery at 40" as qty=word + empty description
    if (qty != null && price != null && desc && !/^(at|@|for)$/.test(desc)) {
      return { description: titleCaseDesc(desc), quantity: qty, unitPrice: price };
    }
  }

  // "pale ale at 280" / "delivery at 40"
  m = p.match(/^(.+?)\s+(?:at|@)\s*\$?\s*(\d+(?:\.\d+)?)\b/);
  if (m) {
    const price = parseMoney(m[2]);
    const desc = m[1].trim();
    if (price != null && desc) {
      return { description: titleCaseDesc(desc), quantity: 1, unitPrice: price };
    }
  }

  // "delivery 40" / "2 cartons 120"
  m = p.match(/^(.+?)\s+\$?\s*(\d+(?:\.\d+)?)\s*(?:dollars?|bucks)?$/);
  if (m) {
    const price = parseMoney(m[2]);
    const left = m[1].trim();
    const qtyTok = left.split(/\s+/)[0];
    const qty = parseQtyToken(qtyTok);
    if (qty != null && left.split(/\s+/).length > 1) {
      const desc = left.split(/\s+/).slice(1).join(" ");
      if (price != null && desc) {
        return {
          description: titleCaseDesc(desc),
          quantity: qty,
          unitPrice: price,
        };
      }
    }
    if (price != null && left && !/^\d/.test(left)) {
      return {
        description: titleCaseDesc(left),
        quantity: 1,
        unitPrice: price,
      };
    }
  }

  return null;
}

function titleCaseDesc(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function cleanCustomerQuery(raw: string): string {
  return collapse(raw)
    .replace(/^(invoice|bill|create|make|new)\s+/g, "")
    .replace(/\b(invoice|bill)\b/g, " ")
    .replace(/\b(same as last|as usual|copy last|again)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseVoiceInvoiceTranscript(transcript: string): VoiceInvoiceIntent {
  const raw = String(transcript || "").trim();
  const text = stripFiller(raw);
  const notes: string[] = [];

  if (!text) {
    return {
      mode: "unknown",
      customerQuery: "",
      lines: [],
      raw,
      notes: ["Empty command"],
    };
  }

  const wantsFromLast =
    /\b(same as last|as usual|copy last|repeat last)\b/.test(text) ||
    /\bagain\b/.test(text);

  // "… for <lines>" — only when not pure same-as-last
  const forIdx = text.search(/\sfor\s/);
  if (forIdx >= 0 && !wantsFromLast) {
    const before = text.slice(0, forIdx).trim();
    const after = text.slice(forIdx + 4).trim();
    const customerQuery = cleanCustomerQuery(before);
    const phrases = splitLinePhrases(after);
    const lines: VoiceInvoiceLine[] = [];
    for (const ph of phrases) {
      const line = parseOneLine(ph);
      if (line) lines.push(line);
      else notes.push(`Could not parse line: "${ph}"`);
    }
    if (!customerQuery) {
      return {
        mode: "unknown",
        customerQuery: "",
        lines,
        raw,
        notes: [...notes, "Could not hear a customer name"],
      };
    }
    if (!lines.length) {
      notes.push("No line items parsed — try: 2 kegs at 280");
      return {
        mode: "unknown",
        customerQuery,
        lines: [],
        raw,
        notes,
      };
    }
    return { mode: "with_lines", customerQuery, lines, raw, notes };
  }

  // Default / same-as-last: "invoice Customer Name [same as last]"
  const customerQuery = cleanCustomerQuery(text);
  if (!customerQuery) {
    return {
      mode: "unknown",
      customerQuery: "",
      lines: [],
      raw,
      notes: ["Say a customer name, e.g. invoice Wagga Rugby same as last"],
    };
  }

  return {
    mode: "from_last",
    customerQuery,
    lines: [],
    raw,
    notes: wantsFromLast
      ? notes
      : [...notes, "No line items — will copy last invoice"],
  };
}

function scoreName(query: string, name: string): number {
  const q = collapse(query);
  const n = collapse(name);
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.startsWith(q) || q.startsWith(n)) return 90;
  if (n.includes(q)) return 80;
  if (q.includes(n) && n.length >= 3) return 70;

  const qWords = q.split(/\s+/).filter((w) => w.length > 1);
  const nWords = n.split(/\s+/);
  if (!qWords.length) return 0;
  let hits = 0;
  for (const w of qWords) {
    if (nWords.some((nw) => nw === w || nw.startsWith(w) || w.startsWith(nw))) {
      hits += 1;
    }
  }
  const ratio = hits / qWords.length;
  if (ratio >= 1) return 75;
  if (ratio >= 0.6) return 55;
  if (hits > 0) return 30;
  return 0;
}

/**
 * Pick the best customer for a spoken name.
 * Ambiguous when two scores are close at the top.
 */
export function matchCustomerByVoice(
  query: string,
  customers: CustomerMatch[]
): {
  match: CustomerMatch | null;
  candidates: Array<CustomerMatch & { score: number }>;
  ambiguous: boolean;
} {
  const scored = customers
    .map((c) => ({ ...c, score: scoreName(query, c.name) }))
    .filter((c) => c.score >= 30)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  if (!scored.length) {
    return { match: null, candidates: [], ambiguous: false };
  }

  const top = scored[0];
  const second = scored[1];
  const ambiguous = Boolean(
    second && second.score >= top.score - 10 && second.score >= 55
  );

  return {
    match: ambiguous ? null : { id: top.id, name: top.name },
    candidates: scored.slice(0, 5),
    ambiguous,
  };
}
