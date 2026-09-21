/** POST a receipt file with retries so a flaky origin still registers the save. */

export const CLIENT_UPLOAD_ID_FIELD = "clientUploadId";

const ATTEMPTS = 3;
const TIMEOUT_MS = 40_000;

type ReceiptPayload = {
  id?: string;
  caption?: string;
  url?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 522 ||
    status === 524
  );
}

function newUploadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `up_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function postReceiptUpload(args: {
  file: File;
  caption?: string;
  ledgerEntryId?: string;
  clientUploadId?: string;
}): Promise<{ id: string; receipt: ReceiptPayload }> {
  const clientUploadId = args.clientUploadId || newUploadId();
  let lastError = "Save failed";

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const form = new FormData();
    form.append("file", args.file);
    form.append(CLIENT_UPLOAD_ID_FIELD, clientUploadId);
    if (args.caption) form.append("caption", args.caption);
    if (args.ledgerEntryId) form.append("ledgerEntryId", args.ledgerEntryId);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("/api/ledger/receipts", {
        method: "POST",
        body: form,
        credentials: "include",
        cache: "no-store",
        signal: ac.signal,
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        receipt?: ReceiptPayload;
      };

      if (res.ok && data.success) {
        const id = String(data.receipt?.id || "");
        if (!id) throw new Error("No receipt id returned");
        return { id, receipt: data.receipt || { id } };
      }

      lastError = data.error || `Save failed (${res.status})`;
      if (res.status >= 400 && res.status < 500 && !isRetryableStatus(res.status)) {
        throw new Error(lastError);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError" && err.name !== "TypeError") {
        throw err;
      }
      lastError =
        err instanceof Error && err.name === "AbortError"
          ? "Save timed out"
          : "Network error";
    } finally {
      clearTimeout(timer);
    }

    if (attempt < ATTEMPTS - 1) await sleep(400 * (attempt + 1));
  }

  throw new Error(lastError);
}
