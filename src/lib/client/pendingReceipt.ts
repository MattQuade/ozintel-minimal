/**
 * Persist the camera photo across Home → /receipts/capture.
 * In-memory alone is unreliable on iPhone PWA (module remount / navigation).
 */

const DB_NAME = "ozintel-pending-receipt";
const STORE = "files";
const KEY = "current";

type StoredReceipt = {
  name: string;
  type: string;
  lastModified: number;
  buffer: ArrayBuffer;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

export async function setPendingReceipt(file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  const record: StoredReceipt = {
    name: file.name || "receipt.jpg",
    type: file.type || "image/jpeg",
    lastModified: file.lastModified || Date.now(),
    buffer,
  };
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"));
      tx.objectStore(STORE).put(record, KEY);
    });
  } finally {
    db.close();
  }
}

export async function getPendingReceipt(): Promise<File | null> {
  const db = await openDb();
  try {
    const record = await new Promise<StoredReceipt | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as StoredReceipt | undefined);
      req.onerror = () => reject(req.error || new Error("IndexedDB read failed"));
    });
    if (!record?.buffer) return null;
    return new File([record.buffer], record.name || "receipt.jpg", {
      type: record.type || "image/jpeg",
      lastModified: record.lastModified || Date.now(),
    });
  } finally {
    db.close();
  }
}

export async function clearPendingReceipt(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB clear failed"));
      tx.objectStore(STORE).delete(KEY);
    });
  } finally {
    db.close();
  }
}
