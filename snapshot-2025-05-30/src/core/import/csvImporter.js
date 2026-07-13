// src/core/import/csvImporter.js
const { v4: uuid } = require("uuid");

class CsvImporter {
  constructor(ledgerEngine) {
    this.ledgerEngine = ledgerEngine;
  }

  async import(csvText, filename = "unknown.csv") {
    try {
      const bankType = this.detectBank(filename);
      const rows = this.parseCsv(csvText);

      console.log(`Detected ${bankType} | Processing ${rows.length} transactions`);

      let collected = 0, paid = 0;

      for (const row of rows) {
        const rule = this.getClassificationRule(row.description);
        const amount = Math.abs(row.amount);
        const isExpense = row.amount < 0;

        if (rule.gstType === "collected") collected++;
        if (rule.gstType === "paid") paid++;

        const journal = {
          id: uuid(),
          date: row.date,
          type: "bank-import",
          description: row.description,
          autoReverse: false,
          lines: [{
            account: rule.account,
            debit: isExpense ? amount : 0,
            credit: isExpense ? 0 : amount,
            gstType: rule.gstType
          }]
        };

        this.ledgerEngine.postJournal(journal);
      }

      console.log(`GST Collected: ${collected} | GST Paid: ${paid}`);

      return {
        success: true,
        imported: rows.length,
        bank: bankType,
        gstCollectedCount: collected,
        gstPaidCount: paid,
        message: `Imported ${rows.length} transactions`
      };
    } catch (err) {
      console.error(err);
      throw new Error("Import failed: " + err.message);
    }
  }

  detectBank(filename) {
    const n = filename.toUpperCase();
    if (n.includes("ANZ")) return "ANZ";
    if (n.includes("NAB")) return "NAB";
    return "UNKNOWN";
  }

  parseCsv(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim().replace(/"/g, ""));
      if (cols.length < 2) continue;

      const amount = parseFloat(cols[1] || "0");
      if (isNaN(amount)) continue;

      rows.push({
        date: cols[0],
        amount: amount,
        description: (cols[2] || cols[3] || cols[4] || "").trim()
      });
    }
    return rows;
  }

  getClassificationRule(desc) {
    const u = (desc || "").toUpperCase();

    // Stronger Sales rules (GST Collected)
    if (u.includes("TYRO") || u.includes("WORLDLINE") || u.includes("EFTPOS") || 
        u.includes("STRIPE") || u.includes("PAYMENT FROM")) {
      return { account: "4100", gstType: "collected" };
    }

    // Stronger Purchase rules (GST Paid)
    if (u.includes("DAN MURPHY") || u.includes("CUB") || u.includes("WOOLWORTHS") || 
        u.includes("BIG W") || u.includes("BUNNINGS") || u.includes("COLES") || 
        u.includes("FERNDALE") || u.includes("SUPPLIER") || u.includes("PAYMENT TO")) {
      return { account: "5100", gstType: "paid" };
    }

    // Wages
    if (u.includes("WAGES") || u.includes("PAYROLL") || u.includes("MATT AURELIE") || 
        u.includes("KATARINA") || u.includes("NAVEEN") || u.includes("STEVEN")) {
      return { account: "6000", gstType: "none" };
    }

    return { account: "9999", gstType: "none" };
  }
}

module.exports = { CsvImporter };