export interface BankRule {
  id: number;
  name: string;
  matchValue: string;
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
}

export interface ClassifiedTransaction {
  original: unknown;
  rule?: BankRule | string;
  type: BankRule["type"];
  accountCode: string;
  accountName: string;
  confidence: number;
  needsReview: boolean;
}

export function classifyTransaction(
  tx: unknown,
  rules: BankRule[]
): ClassifiedTransaction {
  let description = "";

  if (Array.isArray(tx)) {
    description = String(tx[2] || "").toLowerCase().trim();
  } else if (tx && typeof tx === "object") {
    const row = tx as Record<string, unknown>;
    description = String(
      row.Description || row.description || ""
    )
      .toLowerCase()
      .trim();
  }

  for (const rule of rules) {
    if (description.includes(String(rule.matchValue || "").toLowerCase())) {
      return {
        original: tx,
        rule,
        type: rule.type,
        accountCode: rule.accountCode,
        accountName: rule.accountName,
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
    confidence: 0.3,
    needsReview: true,
  };
}

export function classifyBatch(
  transactions: unknown[],
  rules: BankRule[]
): ClassifiedTransaction[] {
  return transactions.map((tx) => classifyTransaction(tx, rules));
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
