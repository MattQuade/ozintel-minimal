import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const ledgerPath = path.join(dataDir, 'ledger.json');

export interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'Revenue' | 'Expense' | 'Asset' | 'Liability' | 'Equity';
  accountCode: string;
  accountName: string;
  source: string;
  timestamp: string;
}

class LedgerEngine {
  private entries: LedgerEntry[] = [];

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(ledgerPath)) {
        this.entries = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
      }
    } catch (e) {
      console.log("No ledger data");
    }
  }

  private save() {
    try {
      fs.writeFileSync(ledgerPath, JSON.stringify(this.entries, null, 2));
    } catch (e) {
      console.error("Save failed", e);
    }
  }

  addEntries(newEntries: any[]) {
    const mapped = newEntries
      .filter(item => item.type !== 'Uncategorized')
      .map((item, index) => {
        const row = item.original;
        return {
          id: `LE${Date.now()}-${index}`,
          date: row[0] || new Date().toISOString().split('T')[0],
          description: row[2] || 'Imported Transaction',
          amount: Math.abs(parseFloat(row[1] || '0')),
          type: item.type,
          accountCode: item.accountCode,
          accountName: item.accountName,
          source: 'bank-import',
          timestamp: new Date().toISOString()
        };
      });

    this.entries = [...this.entries, ...mapped];
    this.save();
    return mapped.length;
  }

  getSummary() {
    const revenue = this.entries
      .filter(e => e.type === 'Revenue')
      .reduce((sum, e) => sum + e.amount, 0);

    const expenses = this.entries
      .filter(e => e.type === 'Expense')
      .reduce((sum, e) => sum + e.amount, 0);

    return {
      totalRevenue: revenue,
      totalExpenses: expenses,
      netProfit: revenue - expenses,
      totalEntries: this.entries.length
    };
  }
}

// Export a single instance
export const ledgerEngine = new LedgerEngine();