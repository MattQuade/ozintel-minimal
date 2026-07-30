import { readLedger, type LedgerEntry } from "@/lib/accounting/store";

class LedgerEngine {
  async getSummary() {
    try {
      const entries: LedgerEntry[] = await readLedger();
      const revenue = entries
        .filter((e) => e.type === "Revenue")
        .reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0);

      const expenses = entries
        .filter((e) => e.type === "Expense")
        .reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0);

      return {
        totalRevenue: revenue,
        totalExpenses: expenses,
        netProfit: revenue - expenses,
        totalEntries: entries.length,
      };
    } catch {
      return {
        totalRevenue: 0,
        totalExpenses: 0,
        netProfit: 0,
        totalEntries: 0,
      };
    }
  }
}

export const ledgerEngine = new LedgerEngine();
