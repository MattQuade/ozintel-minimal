/**
 * Closed list of shops we capture receipts from.
 * OCR may only suggest these aliases; the confirm UI always offers this list.
 * Bank matching uses `bankTerms` against the statement description.
 */

export type ApprovedMerchant = {
  alias: string;
  label: string;
  /** Phrases that appear on the bank line. */
  bankTerms: string[];
  /** Letter-only needles to find in OCR (garbled logos included). */
  ocrKeys: string[];
  /** Extra typed aliases that mean the same shop (woolworths → ww). */
  alsoAliases?: string[];
};

export const APPROVED_RECEIPT_MERCHANTS: ApprovedMerchant[] = [
  {
    alias: "ww",
    label: "Woolworths",
    bankTerms: ["woolworths", "woolies"],
    ocrKeys: [
      "woolworths",
      "woolworth",
      "woolies",
      "woolwor",
      "woolkor",
      "freshfoodpeople",
    ],
    alsoAliases: ["woolworths", "woolies"],
  },
  {
    alias: "aldi",
    label: "Aldi",
    bankTerms: ["aldi"],
    ocrKeys: ["aldi", "aldstores", "altstores"],
  },
  {
    alias: "coles",
    label: "Coles",
    bankTerms: ["coles"],
    ocrKeys: ["coles"],
  },
  {
    alias: "danmurphys",
    label: "Dan Murphys",
    bankTerms: ["dan murphy", "dan murphys"],
    ocrKeys: ["danmurphys", "danmurphy", "danmurph"],
  },
  {
    alias: "reddy",
    label: "Reddy Express",
    bankTerms: ["reddy", "reddy express"],
    ocrKeys: ["reddyexpress", "reddy"],
  },
  {
    alias: "bws",
    label: "BWS",
    bankTerms: ["bws"],
    ocrKeys: ["bws"],
  },
  {
    alias: "iga",
    label: "IGA",
    bankTerms: ["iga"],
    ocrKeys: ["iga"],
  },
  {
    alias: "ampol",
    label: "Ampol",
    bankTerms: ["ampol", "caltex"],
    ocrKeys: ["ampol", "anpol", "caltex"],
    alsoAliases: ["caltex"],
  },
  {
    alias: "bp",
    label: "BP",
    bankTerms: ["bp"],
    ocrKeys: ["bp"],
  },
  {
    alias: "shell",
    label: "Shell",
    bankTerms: ["shell"],
    ocrKeys: ["shell"],
  },
  {
    alias: "pe",
    label: "Pearl Energy",
    bankTerms: ["pearl", "pearl energy"],
    ocrKeys: ["pearlenergy", "pearl"],
    alsoAliases: ["pearl"],
  },
  {
    alias: "united",
    label: "United",
    bankTerms: ["united"],
    ocrKeys: ["unitedpetroleum", "united"],
  },
  {
    alias: "7eleven",
    label: "7-Eleven",
    bankTerms: ["7-eleven", "7 eleven"],
    ocrKeys: ["7eleven", "seveneleven"],
  },
  {
    alias: "bunnings",
    label: "Bunnings",
    bankTerms: ["bunnings"],
    ocrKeys: ["bunnings"],
  },
  {
    alias: "officeworks",
    label: "Officeworks",
    bankTerms: ["officeworks"],
    ocrKeys: ["officeworks"],
  },
  {
    alias: "ferndale",
    label: "Ferndale",
    bankTerms: ["ferndale"],
    ocrKeys: ["ferndale"],
  },
  {
    alias: "linen",
    label: "Linen",
    bankTerms: ["linen"],
    ocrKeys: ["linen"],
  },
];

export function approvedMerchantByAlias(
  alias: string
): ApprovedMerchant | undefined {
  const key = String(alias || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!key) return undefined;
  return APPROVED_RECEIPT_MERCHANTS.find(
    (m) => m.alias === key || (m.alsoAliases || []).includes(key)
  );
}

/** Bank-line match phrases keyed by every typed alias we accept. */
export function approvedAliasBankTerms(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of APPROVED_RECEIPT_MERCHANTS) {
    out[m.alias] = m.bankTerms;
    for (const extra of m.alsoAliases || []) {
      out[extra] = m.bankTerms;
    }
  }
  return out;
}
