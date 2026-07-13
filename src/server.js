// src/server.js
const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");

const { LedgerRepository } = require("./core/ledger/ledgerRepository");
const { LedgerEngine } = require("./core/ledger/ledgerEngine");
const { CsvImporter } = require("./core/import/csvImporter");
const { BasEngine } = require("./core/reports/basEngine");
const { ReportEngine } = require("./core/reports/reportEngine");   // ← New

const app = express();
const port = 3000;

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

const upload = multer({ storage: multer.memoryStorage() });

const ledgerRepo = new LedgerRepository();
const ledgerEngine = new LedgerEngine(ledgerRepo);
const csvImporter = new CsvImporter(ledgerEngine);
const basEngine = new BasEngine(ledgerRepo);
const reportEngine = new ReportEngine(ledgerRepo);   // ← New

console.log("🚀 Grok Pub Accounting with UI + Ledger loaded");

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Import Bank CSV
app.post("/import/csv", upload.single("csvFile"), async (req, res) => {
  try {
    const csvText = req.file ? req.file.buffer.toString("utf-8") : req.body.csvText;
    const filename = req.file ? req.file.originalname : (req.body.filename || "unknown.csv");

    const result = await csvImporter.import(csvText, filename);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Import failed" });
  }
});

// NEW - Backend Profit & Loss Calculator
app.get("/reports/profit-loss", async (req, res) => {
  try {
    const report = await reportEngine.getProfitAndLoss();
    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate Profit & Loss report" });
  }
});

// Ledger View (for Transactions tab)
app.get("/reports/ledger", (req, res) => {
  try {
    const postings = ledgerRepo.getAllPostings();
    const sorted = postings.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    res.json(sorted);
  } catch (err) {
    console.error("Ledger error:", err);
    res.status(400).json({ error: err.message || "Failed to load ledger" });
  }
});

// Clear All
app.post("/clear-all", (req, res) => {
  try {
    ledgerRepo.clearAll();
    res.json({ success: true, message: "All transactions cleared" });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear ledger" });
  }
});

app.listen(port, () => {
  console.log(`✅ Grok Pub Accounting running on http://localhost:${port}`);
});