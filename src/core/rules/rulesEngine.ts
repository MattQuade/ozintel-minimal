export interface BankRule {
  id: number;
  name: string;
  matchValue: string;
  /** Extra OR match strings (Xero "or N other conditions") */
  matchValues?: string[];
  matchField?: "description" | "any" | "payee" | "reference";
  matchType?: "contains" | "equals";
  /** When set, only applies when importing that bank account. */
  bankAccountId?: string;
  /**
   * Xero spend / receive / transfer money.
   * receive = money in (amount > 0); spend/transfer = money out (amount < 0).
   * Omit or "any" to match either direction.
   */
  direction?: "receive" | "spend" | "transfer" | "any";
  accountCode: string;
  accountName: string;
  type:
    | "Revenue"
    | "Expense"
    | "Asset"
    | "Liability"
    | "Equity"
    | "Uncategorized"
    | string;
  autoReconcile?: boolean;
  noGST?: boolean;
}

/** Rules with no bankAccountId apply to every account; scoped rules only to their bank. */
export function rulesForBankAccount(
  rules: BankRule[],
  bankAccountId?: string
): BankRule[] {
  if (!bankAccountId) return rules;
  return rules.filter(
    (r) => !r.bankAccountId || r.bankAccountId === bankAccountId
  );
}

export interface ClassifiedTransaction {
  original: unknown;
  rule?: BankRule | string;
  type: BankRule["type"];
  accountCode: string;
  accountName: string;
  noGST?: boolean;
  confidence: number;
  needsReview: boolean;
}

function extractAmount(tx: unknown): number {
  if (Array.isArray(tx)) {
    const n = parseFloat(String(tx[1] ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  if (tx && typeof tx === "object") {
    const row = tx as Record<string, unknown>;
    const n = parseFloat(
      String(row.Amount ?? row.amount ?? row.Credit ?? row.Debit ?? "0").replace(
        /,/g,
        ""
      )
    );
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function extractSearchText(tx: unknown): string {
  if (Array.isArray(tx)) {
    // ANZ/NAB style: [date, amount, description, ...optional]
    return tx
      .slice(2)
      .map((v) => String(v || ""))
      .join(" ")
      .toLowerCase()
      .trim();
  }
  if (tx && typeof tx === "object") {
    const row = tx as Record<string, unknown>;
    return [
      row.Description,
      row.description,
      row.Payee,
      row.payee,
      row.Reference,
      row.reference,
      row.Narration,
      row.narration,
    ]
      .map((v) => String(v || ""))
      .join(" ")
      .toLowerCase()
      .trim();
  }
  return "";
}

function ruleMatches(rule: BankRule, text: string, amount: number): boolean {
  const dir = rule.direction || "any";
  if (dir === "receive" && !(amount > 0)) return false;
  if (dir === "spend" && !(amount < 0)) return false;
  // Transfers appear as out on the source account and in on the destination.
  if (dir === "transfer" && amount === 0) return false;

  const values = [rule.matchValue, ...(rule.matchValues || [])]
    .map((v) => String(v || "").toLowerCase().trim())
    .filter(Boolean);
  if (values.length === 0 || !text) return false;

  const mode = rule.matchType || "contains";
  if (mode === "equals") {
    return values.some((v) => text === v);
  }
  return values.some((v) => text.includes(v));
}

export function classifyTransaction(
  tx: unknown,
  rules: BankRule[]
): ClassifiedTransaction {
  const text = extractSearchText(tx);
  const amount = extractAmount(tx);

  for (const rule of rules) {
    if (ruleMatches(rule, text, amount)) {
      return {
        original: tx,
        rule,
        type: rule.type,
        accountCode: rule.accountCode,
        accountName: rule.accountName,
        noGST: Boolean(rule.noGST),
        confidence: 0.9,
        needsReview: false,
      };
    }
  }

  return {
    original: tx,
    type: "Uncategorized",
    accountCode: "9999",
    accountName: "Uncategorized",
    noGST: false,
    confidence: 0.3,
    needsReview: true,
  };
}

export function classifyBatch(
  transactions: unknown[],
  rules: BankRule[],
  bankAccountId?: string
): ClassifiedTransaction[] {
  const scoped = rulesForBankAccount(rules, bankAccountId);
  return transactions.map((tx) => classifyTransaction(tx, scoped));
}

/** @deprecated Prefer classifyBatch(transactions, rules) with rules from /api/rules */
export class RulesEngine {
  private rules: BankRule[] = [];

  setRules(rules: BankRule[]) {
    this.rules = rules;
  }

  classifyTransaction(tx: unknown): ClassifiedTransaction {
    return classifyTransaction(tx, this.rules);
  }

  classifyBatch(transactions: unknown[]): ClassifiedTransaction[] {
    return classifyBatch(transactions, this.rules);
  }
}

export const rulesEngine = new RulesEngine();
