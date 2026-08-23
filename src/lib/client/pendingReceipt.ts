/** Holds the camera file across Home → /receipts/capture (same JS session). */

let pending: File | null = null;

export function setPendingReceipt(file: File): void {
  pending = file;
}

export function getPendingReceipt(): File | null {
  return pending;
}

export function clearPendingReceipt(): void {
  pending = null;
}
