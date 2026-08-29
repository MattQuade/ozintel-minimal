import {
  attachReceiptToEntry,
  listUnmatchedCaptionedReceipts,
} from "@/lib/accounting/receipts";
import { pickUniqueCaptionMatches } from "@/lib/accounting/receiptCaption";
import { approvedAliasBankTermsFrom } from "@/lib/accounting/approvedMerchants";
import { readMerchants } from "@/lib/accounting/merchants";
import type { LedgerEntry } from "@/lib/accounting/store";

/**
 * Link inbox photos (caption ww 79.13) onto newly saved bank-import lines.
 * Skips ambiguous duplicates. Does not attach to non-import journal rows.
 */
export async function attachInboxReceiptsToBankImportEntries(
  savedEntries: LedgerEntry[]
): Promise<LedgerEntry[]> {
  const importEntries = savedEntries.filter(
    (e) => String(e.source || "") === "bank-import"
  );
  if (importEntries.length === 0) return savedEntries;

  const inbox = await listUnmatchedCaptionedReceipts();
  if (inbox.length === 0) return savedEntries;

  const merchants = await readMerchants();
  const matches = pickUniqueCaptionMatches(
    inbox,
    importEntries,
    approvedAliasBankTermsFrom(merchants)
  );
  if (matches.length === 0) return savedEntries;

  const attachedIds = new Map<string, string[]>();
  for (const match of matches) {
    await attachReceiptToEntry(match.receiptId, match.entryId);
    const ids = attachedIds.get(match.entryId) || [];
    ids.push(match.receiptId);
    attachedIds.set(match.entryId, ids);
  }

  return savedEntries.map((entry) => {
    const extra = attachedIds.get(entry.id);
    if (!extra || extra.length === 0) return entry;
    const existing = Array.isArray(entry.receiptIds) ? entry.receiptIds : [];
    const receiptIds = [...existing];
    for (const id of extra) {
      if (!receiptIds.includes(id)) receiptIds.push(id);
    }
    return { ...entry, receiptIds };
  });
}
