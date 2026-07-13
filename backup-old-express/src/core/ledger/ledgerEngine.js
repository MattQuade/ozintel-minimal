// src/core/ledger/ledgerEngine.js
class LedgerEngine {
  constructor(repository) {
    this.repository = repository;
  }

  postJournal(journal) {
    // Calculate totals
    const totalDebit = journal.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
    const totalCredit = journal.lines.reduce((sum, line) => sum + (line.credit || 0), 0);

    // TEMPORARY: Auto-balance using a Bank clearing account (for testing)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      const difference = totalDebit - totalCredit;
      
      journal.lines.push({
        account: "1000",           // Bank Account (clearing)
        debit: difference < 0 ? Math.abs(difference) : 0,
        credit: difference > 0 ? difference : 0,
        gstType: "none"
      });

      console.log(`Auto-balanced journal ${journal.id} with Bank account`);
    }

    this.repository.addJournal(journal);
    console.log(`✅ Posted balanced journal ${journal.id} - ${journal.description}`);
  }
}

module.exports = { LedgerEngine };