/**
 * Platform voice commands: navigation + invoice actions.
 */

import type { InvoiceVoiceField } from "@/lib/invoices/applyInvoiceVoiceField";
import {
  applyInvoiceNumberSuffix,
  invoiceDateSuffixFromDate,
  isSpokenNumberToken,
  parseSpokenFullInvoiceNumber,
  parseSpokenInvoiceDigits,
  parseSpokenLineIndex,
  parseSpokenNumberSuffix,
} from "@/lib/voice/spokenNumberSuffix";

export type PlatformVoiceNav = {
  type: "navigate";
  href: string;
  label: string;
};

export type PlatformVoiceAction =
  | {
      type: "edit_invoice";
      label: string;
    }
  | {
      type: "edit_invoices";
      href: string;
      label: string;
    }
  | {
      type: "edit_invoice_number";
      label: string;
      /** When set, apply immediately; otherwise wait for spoken suffix. */
      suffix?: string;
      useIssueDate?: boolean;
      /** Replace the whole number, e.g. 0251. */
      replacement?: string;
    }
  | {
      type: "delete_invoice_number";
      label: string;
    }
  | {
      type: "select_customer";
      label: string;
      /** Spoken customer name; empty means open the picker only. */
      customerQuery: string;
    }
  | {
      type: "append_invoice_suffix";
      label: string;
      /** Explicit spoken/typed suffix, e.g. "-0709-26". */
      suffix?: string;
      /** When true, derive suffix from the invoice issue date (or today). */
      useIssueDate?: boolean;
    }
  | {
      type: "go_back";
      label: string;
    }
  | {
      type: "scroll_down" | "scroll_up";
      label: string;
    }
  | {
      type: "open_invoice";
      label: string;
      /** Spoken customer name; empty means match by number only. */
      customerQuery: string;
      /** Digits from the spoken/typed invoice number, e.g. "246". */
      numberQuery: string;
    }
  | {
      type: "email_invoice";
      label: string;
    }
  | {
      type: "add_line_item";
      label: string;
    }
  | {
      type: "edit_invoice_field";
      label: string;
      field: InvoiceVoiceField;
      /** 1-based line when the user said “line 2”. */
      lineIndex?: number;
    }
  | {
      type: "confirm_send";
      label: string;
    }
  | {
      type: "cancel_send";
      label: string;
    }
  | {
      type: "stop_listening";
      label: string;
    };

export type PlatformVoiceCommand = PlatformVoiceNav | PlatformVoiceAction;

type NavRule = {
  href: string;
  label: string;
  test: (t: string) => boolean;
};

function collapse(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFiller(s: string): string {
  return collapse(s)
    .replace(/^(hey |ok |okay |please |can you |could you |ozintel )+/g, "")
    .replace(/\b(please|thanks|thank you)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withOpen(body: string): RegExp {
  return new RegExp(
    `^(?:(?:open|go to|goto|show|launch|take me to|navigate to)\\s+)?(?:the\\s+)?${body}\\s*$`
  );
}

const RULES: NavRule[] = [
  {
    href: "/invoices/new",
    label: "New invoice",
    test: (t) =>
      /\b(create|make|start|new)\b.*\binvoice\b/.test(t) ||
      /\binvoice\b.*\b(create|new|make)\b/.test(t) ||
      withOpen("new invoice").test(t),
  },
  {
    href: "/invoices",
    label: "Invoices",
    test: (t) => withOpen("invoices?").test(t),
  },
  {
    href: "/customers",
    label: "Customers",
    test: (t) => withOpen("customers?").test(t),
  },
  {
    href: "/employees",
    label: "Employees",
    test: (t) =>
      withOpen("employees?").test(t) ||
      withOpen("employment").test(t) ||
      withOpen("payroll").test(t) ||
      withOpen("pay runs?").test(t),
  },
  {
    href: "/bank/accounts",
    label: "Bank",
    test: (t) =>
      withOpen("bank").test(t) ||
      withOpen("bank accounts?").test(t) ||
      withOpen("banking").test(t),
  },
  {
    href: "/coa",
    label: "Chart of Accounts",
    test: (t) =>
      withOpen("chart of accounts").test(t) ||
      withOpen("coa").test(t) ||
      withOpen("accounts").test(t),
  },
  {
    href: "/journal/new",
    label: "New journal entry",
    test: (t) =>
      /\b(create|make|new)\b.*\bjournal\b/.test(t) ||
      withOpen("new journal").test(t),
  },
  {
    href: "/journal",
    label: "Journal",
    test: (t) =>
      withOpen("journal").test(t) || withOpen("journals?").test(t),
  },
  {
    href: "/transactions",
    label: "Transactions",
    test: (t) => withOpen("transactions?").test(t),
  },
  {
    href: "/reports",
    label: "Reports",
    test: (t) => withOpen("reports?").test(t),
  },
  {
    href: "/reports/profit-loss",
    label: "Profit & loss",
    test: (t) =>
      withOpen("profit and loss").test(t) ||
      withOpen("profit loss").test(t) ||
      withOpen("p and l").test(t) ||
      withOpen("pnl").test(t),
  },
  {
    href: "/reports/balance-sheet",
    label: "Balance sheet",
    test: (t) => withOpen("balance sheet").test(t),
  },
  {
    href: "/reports/bas",
    label: "BAS",
    test: (t) => withOpen("bas").test(t) || withOpen("b a s").test(t),
  },
  {
    href: "/operations/pub",
    label: "Pub Operations",
    test: (t) =>
      withOpen("pub(?: operations?| ops)?").test(t) ||
      withOpen("pub ops").test(t),
  },
  {
    href: "/operations/forestry",
    label: "Forestry Operations",
    test: (t) =>
      withOpen("forestry(?: operations?| ops)?").test(t) ||
      withOpen("forestry ops").test(t),
  },
  {
    href: "/operations",
    label: "Operations",
    test: (t) => withOpen("operations?").test(t),
  },
  {
    href: "/accounting",
    label: "Accounting",
    test: (t) =>
      withOpen("accounting").test(t) ||
      withOpen("accounts hub").test(t) ||
      withOpen("bookkeeping").test(t),
  },
  {
    href: "/security",
    label: "Security",
    test: (t) => withOpen("security").test(t),
  },
  {
    href: "/",
    label: "Home (Alerts)",
    test: (t) =>
      withOpen("home").test(t) ||
      withOpen("alerts?").test(t) ||
      withOpen("ozintel home").test(t),
  },
];

function parseAppendSuffixCommand(t: string): PlatformVoiceAction | null {
  // "add date to invoice number" / "append invoice date to the number"
  if (
    /\b(add|append|put)\b.*\b(date|issue date)\b.*\b(invoice\s+)?numbers?\b/.test(
      t
    ) ||
    /\b(add|append)\b.*\binvoice\s+(date|number)\b.*\b(date|suffix|number)\b/.test(
      t
    ) ||
    /^(add|append)\s+(the\s+)?(invoice\s+)?date(\s+suffix)?(\s+to(\s+the)?\s+invoice\s+numbers?)?$/.test(
      t
    )
  ) {
    return {
      type: "append_invoice_suffix",
      label: "Add date to invoice number",
      useIssueDate: true,
    };
  }
  return null;
}

function parseSelectCustomerCommand(
  t: string
): PlatformVoiceCommand | null {
  // Tolerate speech quirks: "the", "selected", trailing filler
  const normalized = t
    .replace(/\bselected\b/g, "select")
    .replace(/\b(please|now|for me)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // "select customer" / "select the customer" / "choose a customer"
  if (
    /^(select|choose|pick)\s+(the\s+|a\s+|an\s+)?customers?$/.test(
      normalized
    ) ||
    withOpen("select customers?").test(normalized) ||
    withOpen("choose customers?").test(normalized) ||
    withOpen("pick customers?").test(normalized)
  ) {
    return {
      type: "navigate",
      href: "/invoices/new",
      label: "Select customer",
    };
  }

  // "select customer Wagga Rugby" / "select the customer Wagga Rugby"
  const m = normalized.match(
    /^(?:select|choose|pick)\s+(?:the\s+|a\s+|an\s+)?customers?\s+(.+)$/
  );
  if (m) {
    const customerQuery = m[1].trim();
    if (!customerQuery) {
      return {
        type: "navigate",
        href: "/invoices/new",
        label: "Select customer",
      };
    }
    return {
      type: "select_customer",
      customerQuery,
      label: `Select customer ${customerQuery}`,
    };
  }

  return null;
}

function parseEditCommand(t: string): PlatformVoiceAction | null {
  if (
    /^(stop|cancel)\s+(listening|voice|voice\s+commands?|mic|microphone)$/.test(
      t
    ) ||
    /^(stop|cancel)\s+listening$/.test(t) ||
    /^stop\s+voice$/.test(t) ||
    /^hands\s*off$/.test(t)
  ) {
    return {
      type: "stop_listening",
      label: "Stop listening",
    };
  }

  // "go back" / "previous page" — before other go/open rules
  if (
    /^(go\s+)?back$/.test(t) ||
    /^go\s+back(\s+(please|now))?$/.test(t) ||
    /^(previous|prior)\s+(page|screen|step)$/.test(t) ||
    /^back\s+up$/.test(t)
  ) {
    return {
      type: "go_back",
      label: "Go back",
    };
  }

  if (
    /^(scroll|page)\s+down$/.test(t) ||
    /^scroll\s+(the\s+)?(page|screen)\s+down$/.test(t) ||
    /^down\s+(the\s+)?(page|screen)$/.test(t)
  ) {
    return { type: "scroll_down", label: "Scroll down" };
  }
  if (
    /^(scroll|page)\s+up$/.test(t) ||
    /^scroll\s+(the\s+)?(page|screen)\s+up$/.test(t) ||
    /^up\s+(the\s+)?(page|screen)$/.test(t)
  ) {
    return { type: "scroll_up", label: "Scroll up" };
  }

  if (
    /^(send|yes|yeah|yep|confirm|do it|go ahead)$/.test(t) ||
    /^(send|confirm)\s+(it|the\s+email|the\s+invoice)$/.test(t)
  ) {
    return { type: "confirm_send", label: "Send" };
  }
  if (/^(cancel|no|nope|abort|never mind|dont send|don't send)$/.test(t)) {
    return { type: "cancel_send", label: "Cancel send" };
  }

  // "email invoice" / "send invoice"
  if (
    /^(email|mail|send)\s+(the\s+)?(tax\s+)?invoices?$/.test(t) ||
    /^email\s+(the\s+)?customer$/.test(t)
  ) {
    return { type: "email_invoice", label: "Email invoice" };
  }

  // "delete invoice number" — fresh sequential number, not a suffix
  if (
    /^(delete|clear|reset|remove)\s+(the\s+)?(invoice\s+)?numbers?$/.test(t) ||
    /^(delete|clear|reset|remove)\s+(the\s+)?invoice\s+numbers?$/.test(t) ||
    /^new\s+invoice\s+number$/.test(t)
  ) {
    return {
      type: "delete_invoice_number",
      label: "Delete invoice number",
    };
  }

  // "edit invoice number" — must be before plain "edit invoice"
  if (
    /^(edit|change|modify)\s+(the\s+)?invoice\s+numbers?$/.test(t) ||
    /^(edit|change|modify)\s+(the\s+)?numbers?\s+on\s+(the\s+)?invoice$/.test(
      t
    )
  ) {
    return {
      type: "edit_invoice_number",
      label: "Edit invoice number",
    };
  }

  // "edit invoice number dash zero seven…" or a full replacement "two four six"
  const numEdit = t.match(
    /^(?:edit|change|modify)\s+(?:the\s+)?invoice\s+numbers?\s+(.+)$/
  );
  if (numEdit) {
    const spoken = numEdit[1].trim();
    if (/^(the\s+)?date(\s+suffix)?$/.test(spoken)) {
      return {
        type: "edit_invoice_number",
        label: "Add date to invoice number",
        useIssueDate: true,
      };
    }
    const replacement = parseSpokenFullInvoiceNumber(spoken);
    if (replacement) {
      return {
        type: "edit_invoice_number",
        label: `Invoice number ${replacement}`,
        replacement,
      };
    }
    const suffix = parseSpokenNumberSuffix(spoken);
    if (suffix) {
      return {
        type: "edit_invoice_number",
        label: `Edit invoice number ${suffix}`,
        suffix,
      };
    }
    // Could not parse yet — still enter edit mode so they can retry
    return {
      type: "edit_invoice_number",
      label: "Edit invoice number",
    };
  }

  if (
    /^(edit|change|modify)\s+(an?\s+)?invoices$/.test(t) ||
    /^(edit|change|modify)\s+invoices$/.test(t) ||
    withOpen("edit invoices").test(t)
  ) {
    return {
      type: "edit_invoices",
      href: "/invoices?filter=draft",
      label: "Edit invoices (drafts)",
    };
  }
  if (
    /^(edit|change|modify)\s+(an?\s+)?invoice$/.test(t) ||
    /^(edit|change|modify)\s+the\s+(last|latest|current)\s+invoice$/.test(t) ||
    withOpen("edit invoice").test(t)
  ) {
    return {
      type: "edit_invoice",
      label: "Edit latest draft invoice",
    };
  }
  return null;
}

const OPEN_INVOICE_PREFIX =
  /^(?:open|go to|goto|show(?:\s+me)?|launch|take me to|navigate to)\s+(?:the\s+)?/;

function isInvoiceNumberFiller(t: string): boolean {
  return /^(invoice|invoices|inv|number|no)$/.test(t);
}

/**
 * "Open Railway Hotel 246" / "Open Mangoplah Hotel two four five" / "Open invoice 246"
 */
function parseOpenInvoiceCommand(t: string): PlatformVoiceAction | null {
  if (!OPEN_INVOICE_PREFIX.test(t)) return null;
  const rest = t.replace(OPEN_INVOICE_PREFIX, "").trim();
  if (!rest) return null;

  const tokens = rest.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  let i = tokens.length;
  while (i > 0 && isSpokenNumberToken(tokens[i - 1])) i -= 1;
  while (i > 0 && isInvoiceNumberFiller(tokens[i - 1]) && i < tokens.length) {
    i -= 1;
  }

  const numberTokens = tokens.slice(i);
  if (!numberTokens.length) return null;

  const numberQuery = parseSpokenInvoiceDigits(numberTokens.join(" "));
  if (!numberQuery) return null;

  const customerQuery = tokens
    .slice(0, i)
    .join(" ")
    .replace(/^(the\s+)?(invoice|invoices|inv)\s+/i, "")
    .replace(/\s+(the\s+)?(invoice|invoices|inv)$/i, "")
    .trim();

  const label = customerQuery
    ? `Open ${customerQuery} ${numberQuery}`
    : `Open invoice ${numberQuery}`;

  return {
    type: "open_invoice",
    label,
    customerQuery,
    numberQuery,
  };
}

function isLineFieldEdit(rest: string): boolean {
  return (
    /^(edit|change|modify)\s+(the\s+)?descriptions?$/.test(rest) ||
    /^(edit|change|modify)\s+(the\s+)?(qty|quantity|quantities)$/.test(rest) ||
    /^(edit|change|modify)\s+(the\s+)?units?(?:\s+prices?)?$/.test(rest) ||
    /^(edit|change|modify)\s+(the\s+)?unit\s+prices?$/.test(rest) ||
    /^(edit|change|modify)\s+(the\s+)?accounts?$/.test(rest) ||
    /^(edit|change|modify)\s+(the\s+)?(tax|gst)$/.test(rest)
  );
}

function parseTrailingLineIndex(t: string): {
  rest: string;
  lineIndex?: number;
} {
  const withWord = t.match(
    /^(.*?)(?:\s+(?:on\s+|for\s+)?(?:the\s+)?(?:line|item)\s+(\S+))$/
  );
  if (withWord) {
    const n = parseSpokenLineIndex(withWord[2]);
    if (n != null && n > 0) {
      return { rest: withWord[1].trim(), lineIndex: n };
    }
  }

  const parts = t.split(/\s+/);
  if (parts.length >= 2) {
    const head = parts.slice(0, -1).join(" ");
    if (isLineFieldEdit(head)) {
      const n = parseSpokenLineIndex(parts[parts.length - 1]);
      if (n != null && n > 0 && n <= 40) {
        return { rest: head, lineIndex: n };
      }
    }
  }
  return { rest: t };
}

function fieldAction(
  field: InvoiceVoiceField,
  label: string,
  lineIndex?: number
): PlatformVoiceAction {
  return {
    type: "edit_invoice_field",
    field,
    label,
    lineIndex: lineIndex && lineIndex > 0 ? lineIndex : undefined,
  };
}

/**
 * Field edits once an invoice is open.
 */
function parseInvoiceFieldCommand(t: string): PlatformVoiceAction | null {
  if (
    /^(add|new)\s+(a\s+|an\s+|the\s+)?(new\s+)?line(\s+item)?$/.test(t) ||
    /^add\s+(a\s+|an\s+)?new\s+line(\s+item)?$/.test(t) ||
    /^add\s+line\s+item$/.test(t)
  ) {
    return { type: "add_line_item", label: "Add new line item" };
  }

  const { rest, lineIndex } = parseTrailingLineIndex(t);
  const lineHint =
    lineIndex && lineIndex > 0 ? ` line ${lineIndex}` : "";

  if (/^(edit|change|modify)\s+(the\s+)?issue\s+dates?$/.test(rest)) {
    return fieldAction("issueDate", "Edit issue date");
  }
  if (/^(edit|change|modify)\s+(the\s+)?order\s+dates?$/.test(rest)) {
    return fieldAction("orderDate", "Edit order date");
  }
  if (/^(edit|change|modify)\s+(the\s+)?due\s+dates?$/.test(rest)) {
    return fieldAction("dueDate", "Edit due date");
  }
  if (/^(edit|change|modify)\s+(the\s+)?subjects?$/.test(rest)) {
    return fieldAction("subject", "Edit subject");
  }
  if (
    /^(edit|change|modify)\s+(the\s+)?(bank\s+)?(match\s+)?keywords?$/.test(
      rest
    ) ||
    /^(edit|change|modify)\s+(the\s+)?bank\s+match$/.test(rest)
  ) {
    return fieldAction("matchKeyword", "Edit bank match keyword");
  }
  if (
    /^(edit|change|modify)\s+(the\s+)?notes?$/.test(rest) ||
    /^notes$/.test(rest)
  ) {
    return fieldAction("notes", "Edit notes");
  }
  if (/^(edit|change|modify)\s+(the\s+)?descriptions?$/.test(rest)) {
    return fieldAction("description", `Edit description${lineHint}`, lineIndex);
  }
  if (
    /^(edit|change|modify)\s+(the\s+)?(qty|quantity|quantities)$/.test(rest)
  ) {
    return fieldAction("quantity", `Edit quantity${lineHint}`, lineIndex);
  }
  if (
    /^(edit|change|modify)\s+(the\s+)?units?(?:\s+prices?)?$/.test(rest) ||
    /^(edit|change|modify)\s+(the\s+)?unit\s+prices?$/.test(rest)
  ) {
    return fieldAction("unitPrice", `Edit unit${lineHint}`, lineIndex);
  }
  if (/^(edit|change|modify)\s+(the\s+)?accounts?$/.test(rest)) {
    return fieldAction("account", `Edit account${lineHint}`, lineIndex);
  }
  if (
    /^(edit|change|modify)\s+(the\s+)?(tax|gst)$/.test(rest)
  ) {
    return fieldAction("tax", `Edit tax${lineHint}`, lineIndex);
  }
  return null;
}

/**
 * Map a spoken/typed command to navigation or an invoice action.
 */
export function parsePlatformVoiceCommand(
  transcript: string
): PlatformVoiceCommand | null {
  const t = stripFiller(transcript);
  if (!t) return null;

  const append = parseAppendSuffixCommand(t);
  if (append) return append;

  const selectCustomer = parseSelectCustomerCommand(t);
  if (selectCustomer) return selectCustomer;

  const edit = parseEditCommand(t);
  if (edit) return edit;

  const field = parseInvoiceFieldCommand(t);
  if (field) return field;

  const openInvoice = parseOpenInvoiceCommand(t);
  if (openInvoice) return openInvoice;

  for (const rule of RULES) {
    if (rule.test(t)) {
      return { type: "navigate", href: rule.href, label: rule.label };
    }
  }
  return null;
}

/** @deprecated use parsePlatformVoiceCommand */
export function parsePlatformVoiceNav(
  transcript: string
): { href: string; label: string } | null {
  const cmd = parsePlatformVoiceCommand(transcript);
  if (!cmd) return null;
  if (cmd.type === "navigate") return { href: cmd.href, label: cmd.label };
  if (cmd.type === "edit_invoices")
    return { href: cmd.href, label: cmd.label };
  return null;
}

export const PLATFORM_VOICE_EXAMPLES = [
  "Open Accounting",
  "Open Railway Hotel 246",
  "Select customer",
  "Email invoice",
  "Edit issue date",
  "Delete invoice number",
  "Scroll down",
  "Go back",
  "Stop listening",
];

export function invoiceIdFromPath(pathname: string): string | undefined {
  const m = String(pathname || "").match(/^\/invoices\/([^/?#]+)/);
  if (!m || m[1] === "new") return undefined;
  return m[1];
}

export {
  applyInvoiceNumberSuffix,
  invoiceDateSuffixFromDate,
  parseSpokenNumberSuffix,
};
