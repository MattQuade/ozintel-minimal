/**
 * Home / hub voice navigation — open modules across OzIntel.
 * Order matters: more specific commands first.
 */

export type PlatformVoiceNav = {
  href: string;
  label: string;
};

type NavRule = {
  href: string;
  label: string;
  /** Match against normalised transcript (lowercase, collapsed). */
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

/** Optional open/go/show prefix. */
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

/**
 * Map a spoken/typed command to an in-app route.
 * Returns null when nothing matches.
 */
export function parsePlatformVoiceNav(
  transcript: string
): PlatformVoiceNav | null {
  const t = stripFiller(transcript);
  if (!t) return null;

  for (const rule of RULES) {
    if (rule.test(t)) {
      return { href: rule.href, label: rule.label };
    }
  }
  return null;
}

export const PLATFORM_VOICE_EXAMPLES = [
  "Open Accounting",
  "Open Invoices",
  "Create new invoice",
  "Open Customers",
  "Open Employees",
  "Open Pub Ops",
  "Open Forestry",
];
