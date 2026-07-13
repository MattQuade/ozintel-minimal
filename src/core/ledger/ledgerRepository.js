// src/core/ledger/ledgerRepository.js
const fs = require("fs");
const path = require("path");

class LedgerRepository {
  constructor() {
    this.postings = [];
    this.filePath = path.join(__dirname, "../../../data/ledger.json");
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.postings = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
        console.log(`Loaded ${this.postings.length} existing postings`);
      }
    } catch (e) {
      console.log("Starting with empty ledger");
      this.postings = [];
    }
  }

  saveToDisk() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.postings, null, 2));
    } catch (e) {
      console.error("Failed to save ledger:", e);
    }
  }

  addJournal(journal) {
    for (const line of journal.lines) {
      this.postings.push({
        id: journal.id,
        date: journal.date,
        account: line.account,
        debit: line.debit || 0,
        credit: line.credit || 0,
        gstType: line.gstType || "none",
        description: journal.description
      });
    }
    this.saveToDisk();
  }

  getPostingsByPeriod(startDate, endDate) {
    return this.postings;   // Return everything for now
  }

  getAllPostings() {
    return this.postings;
  }

  // ====================== NEW: CLEAR ALL ======================
  clearAll() {
    this.postings = [];
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
      console.log("🗑️ Ledger completely cleared");
    } catch (e) {
      console.error("Error deleting ledger file:", e);
    }
    this.saveToDisk(); // Create empty file
  }
}

module.exports = { LedgerRepository };