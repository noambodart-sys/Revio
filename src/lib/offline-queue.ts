/**
 * File d'attente hors-ligne (IndexedDB) pour les achats encodés à la caisse sans internet.
 * Chaque achat porte une clé d'idempotence : le rejouer plusieurs fois ne crédite qu'une fois.
 */
import { api, ApiError, NetworkError } from "./api";

export interface QueuedPurchase {
  idempotencyKey: string;
  customerId: string;
  customerLabel: string;
  amountCents: number;
  kioskSessionId: string | null;
  occurredAt: string;
}

const DB = "fidelite-offline";
const STORE = "purchases";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "idempotencyKey" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const enqueuePurchase = (p: QueuedPurchase) => tx("readwrite", (s) => s.put(p));
export const listQueued = () => tx<QueuedPurchase[]>("readonly", (s) => s.getAll());
const remove = (key: string) => tx("readwrite", (s) => s.delete(key));

/** Envoie les achats en attente. Retourne le nombre restant et les erreurs définitives. */
export async function flushQueue(): Promise<{ remaining: number; failed: { item: QueuedPurchase; message: string }[] }> {
  const items = await listQueued();
  const failed: { item: QueuedPurchase; message: string }[] = [];
  for (const item of items) {
    try {
      await api("/api/v1/pos/purchases", {
        body: { customerId: item.customerId, amountCents: item.amountCents, idempotencyKey: item.idempotencyKey, occurredAt: item.occurredAt, kioskSessionId: null },
      });
      await remove(item.idempotencyKey);
    } catch (e) {
      if (e instanceof NetworkError || (e instanceof ApiError && (e.status >= 500 || e.status === 401 || e.status === 429))) break; // réessayer plus tard
      failed.push({ item, message: e instanceof Error ? e.message : "Erreur" });
      await remove(item.idempotencyKey);
    }
  }
  return { remaining: (await listQueued()).length, failed };
}

export const newIdempotencyKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
