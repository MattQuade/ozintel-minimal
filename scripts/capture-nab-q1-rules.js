const fs = require("fs");

const RULES_PATH = "src/core/rules/rules.json";
const LIVE_RULES_PATH = "data/accounting/rules.json";
const LEDGER_PATH = "data/q1-classification-backup/prod-ledger.json";

const data = JSON.parse(fs.readFileSync(RULES_PATH, "utf8"));
const rules = data.rules;
const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));

function inQ1(d) {
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return false;
  const x = new Date(t);
  return x >= new Date("2025-07-01") && x <= new Date("2025-09-30");
}

const CC_PATTERNS = [
  {
    re: /CC RPYMNT|INTERNET PAYMENT CC/i,
    label: "CC Payment Transfers",
    vals: ["CC RPYMNT", "INTERNET PAYMENT CC"],
  },
  { re: /METCASH/i, label: "Metcash Trading", vals: ["METCASH"] },
  {
    re: /SOUTH WEST CATERING/i,
    label: "South West Catering",
    vals: ["SOUTH WEST CATERING"],
  },
  { re: /PEARL STURT/i, label: "Pearl Sturt Hwy Fuel", vals: ["PEARL STURT"] },
  {
    re: /SDRO|INFRNGMNT/i,
    label: "SDRO Infringement",
    vals: ["SDRO", "INFRNGMNT"],
  },
  { re: /CARINYA/i, label: "Carinya Christian School", vals: ["CARINYA"] },
  {
    re: /MISTER MINIT/i,
    label: "Mister Minit",
    vals: ["MISTER MINIT", "Mister Minit"],
  },
  { re: /NRMA/i, label: "NRMA Insurance", vals: ["NRMA"] },
  {
    re: /MACQUARIE UNIVERSITY/i,
    label: "Macquarie University",
    vals: ["MACQUARIE UNIVERSITY"],
  },
  {
    re: /TALLIMBA/i,
    label: "Tallimba P and C",
    vals: ["TALLIMBA P AND C", "TALLIMBA"],
  },
  {
    re: /ACT ENDODONTICS/i,
    label: "ACT Endodontics",
    vals: ["ACT ENDODONTICS"],
  },
  { re: /GO DENTAL/i, label: "Go Dental", vals: ["GO DENTAL"] },
  { re: /DR ANDREW/i, label: "Dr Andrew Redgment", vals: ["DR ANDREW"] },
  { re: /RIVERINA ORAL/i, label: "Riverina Oral", vals: ["RIVERINA ORAL"] },
  { re: /BIG\s?W|BIGW/i, label: "BIG W", vals: ["BIGW", "BIG W"] },
  { re: /ACT CABS/i, label: "ACT Cabs", vals: ["ACT CABS"] },
  { re: /LOCKHART CAFE/i, label: "Lockhart Cafe", vals: ["LOCKHART CAFE"] },
  { re: /JARDINES/i, label: "Jardines Cafe", vals: ["Jardines", "JARDINES"] },
  { re: /BIRDY BAR/i, label: "Birdy Bar", vals: ["Birdy Bar", "BIRDY BAR"] },
  { re: /BOX OFFICE/i, label: "Box Office", vals: ["BOX OFFICE"] },
  { re: /STARS ON ICE/i, label: "Stars on Ice", vals: ["STARS ON ICE"] },
  { re: /NAB INTNL/i, label: "NAB Intl Tran Fee", vals: ["NAB INTNL"] },
  {
    re: /FACEBK|FB\.ME\/ADS|FACEBOOK/i,
    label: "FACEBK Ads",
    vals: ["FACEBK", "fb.me/ads", "FACEBOOK"],
  },
  { re: /FERNDALE/i, label: "Ferndale Distributors", vals: ["FERNDALE", "Ferndale"] },
  { re: /WOOLWORTHS/i, label: "Woolworths", vals: ["WOOLWORTHS"] },
  { re: /\bCUB\b|CUB PTY/i, label: "CUB", vals: ["CUB"] },
  { re: /DAN MURPHY/i, label: "Dan Murphys", vals: ["DAN MURPHY"] },
  { re: /SPOTIFY/i, label: "Spotify", vals: ["SPOTIFY", "Spotify"] },
  {
    re: /INS PREMIUM|MLC NCCC/i,
    label: "MLC Insurance",
    vals: ["INS PREMIUM", "MLC NCCC"],
  },
  {
    re: /INTEREST ON PURCHASE/i,
    label: "Interest on Purchases",
    vals: ["INTEREST ON PURCHASE"],
  },
  { re: /SUPAGAS/i, label: "SupaGas", vals: ["SUPAGAS", "Supagas"] },
];

function matchPattern(desc) {
  for (const p of CC_PATTERNS) {
    if (p.re.test(String(desc || ""))) return p;
  }
  return null;
}

const ccRows = ledger.filter(
  (e) =>
    String(e.bankAccountId) === "1" &&
    inQ1(e.date) &&
    e.accountCode &&
    e.accountCode !== "9999"
);

const groups = {};
for (const e of ccRows) {
  const p = matchPattern(e.description);
  if (!p) continue;
  const amount = Number(e.amount) || 0;
  let direction = amount > 0 ? "receive" : amount < 0 ? "spend" : "any";
  if (p.label === "CC Payment Transfers") direction = "receive";
  const key = [p.label, String(e.accountCode), direction].join("|");
  if (!groups[key]) {
    groups[key] = {
      label: p.label,
      vals: [...p.vals],
      accountCode: String(e.accountCode),
      accountName: String(e.accountName || ""),
      type: String(e.type || "Expense"),
      direction,
      noGST: !!e.noGST,
      count: 0,
    };
  }
  groups[key].count++;
  if (e.noGST) groups[key].noGST = true;
}

const best = {};
for (const g of Object.values(groups)) {
  const k = g.label + "|" + g.direction;
  if (!best[k] || g.count > best[k].count) best[k] = g;
}
const candidates = Object.values(best);

let maxId = Math.max(...rules.map((r) => Number(r.id) || 0));
let added = 0;
let updated = 0;
const notes = [];
const anzBefore = rules.filter((r) => r.bankAccountId === "3").length;

function existingVals(r) {
  return [r.matchValue, ...(r.matchValues || [])]
    .map((v) => String(v || "").toLowerCase())
    .filter(Boolean);
}

function findRule(bankId, vals, direction) {
  return rules.find((r) => {
    if (String(r.bankAccountId) !== String(bankId)) return false;
    const rDir = r.direction || "any";
    if (direction !== "any" && rDir !== "any" && rDir !== direction) {
      return false;
    }
    const existing = existingVals(r);
    return vals.some((v) => {
      const lv = String(v).toLowerCase();
      return existing.some((e) => e === lv || e.includes(lv) || lv.includes(e));
    });
  });
}

function strengthen(rule, vals) {
  const primary = rule.matchValue || vals[0];
  const set = new Set(
    [primary, ...(rule.matchValues || []), ...vals].filter(Boolean)
  );
  set.delete(primary);
  rule.matchValue = primary;
  if (set.size) rule.matchValues = [...set];
  else delete rule.matchValues;
  rule.matchField = "any";
  rule.matchType = "contains";
}

for (const g of candidates) {
  const existing = findRule("2010", g.vals, g.direction);
  if (existing) {
    strengthen(existing, g.vals);
    existing.accountCode = g.accountCode;
    existing.accountName = g.accountName;
    existing.type = g.type;
    existing.direction = g.direction;
    existing.bankAccountId = "2010";
    if (g.noGST) existing.noGST = true;
    else if (existing.noGST && !g.noGST) {
      // keep existing noGST if classification didn't set it
    }
    updated++;
    notes.push(
      `updated 2010: ${existing.name || g.label} → ${g.accountCode} (${g.count})`
    );
  } else {
    maxId += 1;
    const primary = g.vals[0];
    const extras = g.vals.slice(1);
    const rule = {
      id: maxId,
      name: g.label,
      matchValue: primary,
      matchField: "any",
      matchType: "contains",
      accountCode: g.accountCode,
      accountName: g.accountName,
      type: g.type,
      bankAccountId: "2010",
      direction: g.direction,
    };
    if (extras.length) rule.matchValues = extras;
    if (g.noGST) rule.noGST = true;
    rules.push(rule);
    added++;
    notes.push(`added 2010: ${g.label} → ${g.accountCode} (${g.count})`);
  }
}

// NAB Biz (#4091 / 2020): prod ledger has no true NAB Biz rows (id "2" is ANZ dup).
// Only add clear recurring gaps from the known NAB #4091 paste / prior analysis.
const BIZ_GAPS = [
  {
    label: "Starlink Internet",
    vals: ["STARLINK", "STARLINK INTERNET"],
    accountCode: "1462",
    accountName: "Telephone & Fax",
    type: "Expense",
    direction: "spend",
  },
  {
    label: "Matt Quade - Funds Intro",
    vals: [
      "Matt Quade",
      "MR MATTHEW JOHN QUAD",
      "MATTHEW JOHN QUAD",
      "Transfer bw bus. acc",
    ],
    accountCode: "3565/04",
    accountName: "Loan - Matt Quade",
    type: "Liability",
    direction: "receive",
    noGST: true,
    strengthenOnly: true,
  },
  {
    label: "TF Between Bus Accounts (NAB)",
    vals: [
      "TF bw Bus Accts",
      "TF bw bus. accounts",
      "bw Bus Accts",
      "bw bus. accounts",
      "MQTF bw",
      "LAS ANZ",
    ],
    accountCode: "3",
    accountName: "ANZ Business Account",
    type: "Asset",
    direction: "any",
    noGST: true,
  },
  {
    label: "Weekly Wages",
    vals: ["WAGES", "THI AI LE TRAN", "THI MY THI HUYNH"],
    accountCode: "1965",
    accountName: "Salaries & Wages",
    type: "Expense",
    direction: "spend",
    noGST: true,
    strengthenOnly: true,
  },
  {
    label: "NAB ATM Deposit",
    vals: ["NABATM DEP", "NABATM"],
    accountCode: "0107",
    accountName: "Sales - Bar",
    type: "Revenue",
    direction: "receive",
    strengthenOnly: true,
  },
];

for (const g of BIZ_GAPS) {
  const existing = findRule("2020", g.vals, g.direction);
  if (existing) {
    strengthen(existing, g.vals);
    // Do not overwrite account coding on strengthenOnly — only widen match text
    if (!g.strengthenOnly) {
      existing.accountCode = g.accountCode;
      existing.accountName = g.accountName;
      existing.type = g.type;
      existing.direction = g.direction;
    }
    existing.bankAccountId = "2020";
    if (g.noGST) existing.noGST = true;
    existing.matchField = "any";
    updated++;
    notes.push(`updated 2020: ${existing.name || g.label}`);
  } else if (!g.strengthenOnly) {
    maxId += 1;
    const primary = g.vals[0];
    const extras = g.vals.slice(1);
    const rule = {
      id: maxId,
      name: g.label,
      matchValue: primary,
      matchField: "any",
      matchType: "contains",
      accountCode: g.accountCode,
      accountName: g.accountName,
      type: g.type,
      bankAccountId: "2020",
      direction: g.direction,
    };
    if (extras.length) rule.matchValues = extras;
    if (g.noGST) rule.noGST = true;
    rules.push(rule);
    added++;
    notes.push(`added 2020: ${g.label} → ${g.accountCode}`);
  } else {
    notes.push(`skip missing strengthenOnly 2020: ${g.label}`);
  }
}

const missingBank = rules.filter((r) => !r.bankAccountId);
if (missingBank.length) {
  console.error("ERROR rules missing bankAccountId", missingBank.length);
  process.exit(1);
}

const anzAfter = rules.filter((r) => r.bankAccountId === "3").length;
if (anzAfter !== anzBefore) {
  console.error("ERROR ANZ rule count changed", anzBefore, "->", anzAfter);
  process.exit(1);
}

data.rules = rules;
const out = JSON.stringify(data, null, 2) + "\n";
fs.writeFileSync(RULES_PATH, out);
fs.writeFileSync(LIVE_RULES_PATH, out);

const byBank = {};
for (const r of rules) {
  byBank[r.bankAccountId] = (byBank[r.bankAccountId] || 0) + 1;
}

console.log(
  JSON.stringify(
    {
      added,
      updated,
      total: rules.length,
      byBank,
      anzBefore,
      anzAfter,
      ccRows: ccRows.length,
      ccCandidates: candidates.length,
      notes,
    },
    null,
    2
  )
);
