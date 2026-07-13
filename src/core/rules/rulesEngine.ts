export interface BankRule {
  id: number;
  name: string;
  matchValue: string;
  accountCode: string;
  accountName: string;
  type: 'Revenue' | 'Expense' | 'Asset' | 'Liability' | 'Equity' | 'Uncategorized';
  autoReconcile: boolean;
}

export interface ClassifiedTransaction {
  original: any;
  rule?: BankRule;
  type: BankRule['type'];
  accountCode: string;
  accountName: string;
  confidence: number;
  needsReview: boolean;
}

export class RulesEngine {
  private rules: BankRule[] = [];

  constructor() {
    this.loadRules();
  }

  private loadRules() {
    try {
      const rulesData = require('../../../src/core/rules/rules.json');
      this.rules = rulesData.rules || [];
      console.log(`✅ Loaded ${this.rules.length} bank rules`);
    } catch (e) {
      console.error("Failed to load rules.json", e);
    }
  }

  classifyTransaction(tx: any): ClassifiedTransaction {
    let description = '';

    // ANZ CSV format: array [Date, Amount, Description, ...]
    if (Array.isArray(tx)) {
      description = String(tx[2] || '').toLowerCase().trim();   // Column 2 = Description
    } 
    // Object format fallback
    else {
      description = String(tx.Description || tx.description || tx[2] || '').toLowerCase().trim();
    }

    for (const rule of this.rules) {
      if (description.includes(rule.matchValue.toLowerCase())) {
        return {
          original: tx,
          rule,
          type: rule.type,
          accountCode: rule.accountCode,
          accountName: rule.accountName,
          confidence: 0.9,
          needsReview: false
        };
      }
    }

    return {
      original: tx,
      type: 'Uncategorized',
      accountCode: '9999',
      accountName: 'Uncategorized',
      confidence: 0.3,
      needsReview: true
    };
  }

  classifyBatch(transactions: any[]): ClassifiedTransaction[] {
    return transactions.map(tx => this.classifyTransaction(tx));
  }
}

export const rulesEngine = new RulesEngine();