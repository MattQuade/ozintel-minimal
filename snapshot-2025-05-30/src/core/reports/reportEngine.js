// src/core/reports/reportEngine.js
class ReportEngine {
  constructor(ledgerRepo) {
    this.ledgerRepo = ledgerRepo;
  }

  async getProfitAndLoss() {
    const postings = this.ledgerRepo.getAllPostings();

    const balances = {};

    postings.forEach(tx => {
      const code = tx.account;
      if (!code) return;

      if (!balances[code]) balances[code] = 0;

      if (tx.credit) balances[code] += Number(tx.credit);
      if (tx.debit)  balances[code] -= Number(tx.debit);
    });

    let totalIncome = 0;
    let totalCOGS = 0;
    let totalExpenses = 0;

    Object.entries(balances).forEach(([code, balance]) => {
      const abs = Math.abs(balance);

      if (code.startsWith("41") || code.startsWith("42") || code.startsWith("43") || 
          code.startsWith("44") || code.startsWith("45")) {
        totalIncome += abs;           // Sales & Revenue
      }
      else if (code.startsWith("50") || code.startsWith("501")) {
        totalCOGS += abs;             // Cost of Goods Sold
      }
      else if (code.startsWith("6")) {
        totalExpenses += abs;         // Operating Expenses
      }
    });

    const grossProfit = totalIncome - totalCOGS;
    const netProfit = grossProfit - totalExpenses;

    return {
      totalIncome: parseFloat(totalIncome.toFixed(2)),
      totalCOGS: parseFloat(totalCOGS.toFixed(2)),
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
      netProfit: parseFloat(netProfit.toFixed(2))
    };
  }
}

module.exports = { ReportEngine };