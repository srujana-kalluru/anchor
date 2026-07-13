const DB_NAME = 'anchor';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('queue')) {
          d.createObjectStore('queue', { keyPath: 'seq', autoIncrement: true });
        }
        if (!d.objectStoreNames.contains('kv')) {
          d.createObjectStore('kv');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(d => new Promise<T>((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export interface QueuedOp {
  seq?: number;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body: unknown;
}

export const idb = {
  kvGet<T>(key: string): Promise<T | undefined> {
    return tx('kv', 'readonly', s => s.get(key) as IDBRequest<T | undefined>);
  },
  kvSet(key: string, value: unknown): Promise<unknown> {
    return tx('kv', 'readwrite', s => s.put(value, key));
  },
  queuePush(op: QueuedOp): Promise<unknown> {
    return tx('queue', 'readwrite', s => s.add(op));
  },
  queueAll(): Promise<QueuedOp[]> {
    return tx('queue', 'readonly', s => s.getAll() as IDBRequest<QueuedOp[]>);
  },
  queueDelete(seq: number): Promise<unknown> {
    return tx('queue', 'readwrite', s => s.delete(seq));
  },
  queueClear(): Promise<unknown> {
    return tx('queue', 'readwrite', s => s.clear());
  }
};
