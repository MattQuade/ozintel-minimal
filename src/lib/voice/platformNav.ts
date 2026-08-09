/**
 * Platform voice commands: navigation + invoice actions.
 */

import {
  applyInvoiceNumberSuffix,
  invoiceDateSuffixFromDate,
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

  // "add dash zero seven … to invoice number"
  const m = t.match(
    /\b(?:add|append|put)\s+(.+?)\s+to\s+(?:the\s+)?invoice\s+numbers?\b/
  );
  if (m) {
    const spoken = m[1].trim();
    // If they said "date" alone in the capture, use issue date
    if (/^(the\s+)?date(\s+suffix)?$/.test(spoken)) {
      return {
        type: "append_invoice_suffix",
        label: "Add date to invoice number",
        useIssueDate: true,
      };
    }
    const suffix = parseSpokenNumberSuffix(spoken);
    if (!suffix) return null;
    return {
      type: "append_invoice_suffix",
      label: `Add ${suffix} to invoice number`,
      suffix,
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

  // "edit invoice number dash zero seven zero nine dash twenty six"
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
  "Select customer",
  "Edit invoice number",
  "Go back",
  "Stop listening",
];

export {
  applyInvoiceNumberSuffix,
  invoiceDateSuffixFromDate,
  parseSpokenNumberSuffix,
};
