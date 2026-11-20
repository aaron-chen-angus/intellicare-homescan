/**
 * db.js - small IndexedDB wrapper. Everything stays on this device.
 * Stores: shots (keyPath shot_id, includes the JPEG blob), analyses (keyPath shot_id).
 */
const DB_NAME = 'intellicare-homescan';
const VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('shots')) db.createObjectStore('shots', { keyPath: 'shot_id' });
      if (!db.objectStoreNames.contains('analyses')) db.createObjectStore('analyses', { keyPath: 'shot_id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const put = (store, value) => tx(store, 'readwrite', (s) => s.put(value));
export const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
export const getAll = (store) => tx(store, 'readonly', (s) => s.getAll());
export const clear = (store) => tx(store, 'readwrite', (s) => s.clear());
