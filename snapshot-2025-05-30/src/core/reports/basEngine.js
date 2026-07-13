// src/core/reports/basEngine.js
class BasEngine {
  constructor(repository) {
    this.repository = repository;
  }

  async getBasSummary(quarter = null, start = null, end = null) {
    let startDate, endDate, periodLabel;

    if (start && end) {
      startDate = start;
      endDate = end;
      periodLabel = `${start} to ${end}`;
    } else if (quarter && quarter !== "All") {
      switch (quarter) {
        case "2026-Q3":
          startDate = "2026-01-01"; 
          endDate = "2026-03-31"; 
          periodLabel = "January - March 2026 (Q3)";
          break;
        case "2026-Q4":
          startDate = "2026-04-01"; 
          endDate = "2026-06-30"; 
          periodLabel = "April - June 2026 (Q4)";
          break;
        case "2025-Q1":
          startDate = "2025-07-01"; 
          endDate = "2025-09-30"; 
          periodLabel = "July - September 2025 (Q1)";
          break;
        case "2025-Q2":
          startDate = "2025-10-01"; 
          endDate = "2025-12-31"; 
          periodLabel = "October - December 2025 (Q2)";
          break;
        default:
          startDate = "2024-01-01"; 
          endDate = "2027-12-31"; 
          periodLabel = "All Available Data";
      }
    } else {
      startDate = "2024-01-01"; 
      endDate = "2027-12-31"; 
      periodLabel = "All Available Data";
    }

    const postings = this.repository.getPostingsByPeriod(startDate, endDate);

    let gstCollected = 0;
    let gstPaid = 0;
    let paygWithheld = 0;

    postings.forEach(p => {
      const absDebit = Math.abs(p.debit || 0);
      const absCredit = Math.abs(p.credit || 0);

      if (p.gstType === "collected" && absCredit > 0) gstCollected += absCredit / 11;
      if (p.gstType === "paid" && absDebit > 0) gstPaid += absDebit / 11;
      if (p.account === "6000") paygWithheld += absDebit * 0.15;
    });

    const netGst = gstCollected - gstPaid;
    const totalAto = netGst + paygWithheld;

    return {
      quarter: quarter || "Custom Range",
      period: periodLabel,
      gstCollected: Math.round(gstCollected * 100) / 100,
      gstPaid: Math.round(gstPaid * 100) / 100,
      netGst: Math.round(netGst * 100) / 100,
      paygWithheld: Math.round(paygWithheld * 100) / 100,
      totalAtoObligation: Math.round(totalAto * 100) / 100,
      transactionCount: postings.length,
      message: `BAS for ${periodLabel}`
    };
  }
}

module.exports = { BasEngine };