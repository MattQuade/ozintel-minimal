/** Persist the camera photo so an Android PWA remount does not lose it. */

const DB_NAME = "ozintel-receipt-capture";
const STORE = "pending";
const KEY = "file";

let memory: File | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function setPendingReceipt(file: File): void {
  memory = file;
  void (async () => {
    try {
      const buf = await file.arrayBuffer();
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).put(
          {
            name: file.name,
            type: file.type || "image/jpeg",
            lastModified: file.lastModified,
            savedAt: Date.now(),
            buf,
          },
          KEY
        );
      });
      db.close();
    } catch {
      // memory still holds the file for this session
    }
  })();
}

export function getPendingReceipt(): File | null {
  return memory;
}

export async function loadPendingReceipt(): Promise<File | null> {
  if (memory) return memory;
  try {
    const db = await openDb();
    const rec = await new Promise<{
      name: string;
      type: string;
      lastModified: number;
      savedAt?: number;
      buf: ArrayBuffer;
    } | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!rec?.buf) return null;
    if (rec.savedAt && Date.now() - rec.savedAt > 10 * 60 * 1000) return null;
    memory = new File([rec.buf], rec.name || "receipt.jpg", {
      type: rec.type || "image/jpeg",
      lastModified: rec.lastModified || Date.now(),
    });
    return memory;
  } catch {
    return null;
  }
}

export function clearPendingReceipt(): void {
  memory = null;
  void (async () => {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).delete(KEY);
      });
      db.close();
    } catch {
      // ignore
    }
  })();
}
