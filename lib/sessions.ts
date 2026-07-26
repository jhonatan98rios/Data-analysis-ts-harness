const DB = 'dah';
const STORE = 'sessions';
const INDEX_KEY = '__index__';

export interface SessionMeta {
  id: string;
  lastUpdate: number;
  preview: string;
}

export interface SessionFile {
  name: string;
  type: string;
  size: number;
  data: string;
}

// ponytail: mirrors ChartSpec shape so persisted charts pass type-check
// without importing server-side plot module into client-only session storage
export interface SessionChart {
  id: string;
  chartType: string;
  title: string;
  xKey: string;
  yKey: string;
  yKeys?: string[];
  data: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface SessionMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  time: string;
  file?: SessionFile;
  charts?: SessionChart[];
}

export interface SessionData {
  messages: SessionMessage[];
}

// ── IndexedDB helpers ──────────────────────────────────────────────────────
// ponytail: single DB, single store, lazy init — scale with more stores if needed

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function get<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE, 'readonly');
    const req = txn.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE, 'readwrite');
    const req = txn.objectStore(STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function del(key: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE, 'readwrite');
    const req = txn.objectStore(STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

const MAX_SESSIONS = 50;

export async function getIndex(): Promise<SessionMeta[]> {
  const idx = await get<SessionMeta[]>(INDEX_KEY);
  return (idx ?? []).sort((a, b) => b.lastUpdate - a.lastUpdate);
}

export async function upsertMeta(id: string, preview: string): Promise<void> {
  const idx = (await get<SessionMeta[]>(INDEX_KEY)) ?? [];
  const now = Date.now();
  const i = idx.findIndex((m) => m.id === id);
  if (i >= 0) {
    idx[i] = { id, lastUpdate: now, preview };
  } else {
    // cap: evict least-recently-used session when at limit
    if (idx.length >= MAX_SESSIONS) {
      const oldest = idx.reduce((a, b) => (a.lastUpdate < b.lastUpdate ? a : b));
      await del(oldest.id);
      const oi = idx.findIndex((m) => m.id === oldest.id);
      if (oi >= 0) idx.splice(oi, 1);
    }
    idx.push({ id, lastUpdate: now, preview });
  }
  await put(INDEX_KEY, idx);
}

export async function loadSession(id: string): Promise<SessionData | null> {
  const data = await get<SessionData>(id);
  return data ?? null;
}

export async function saveSession(id: string, data: SessionData): Promise<void> {
  await put(id, data);
}

export async function deleteSession(id: string): Promise<void> {
  await del(id);
  const idx = (await get<SessionMeta[]>(INDEX_KEY)) ?? [];
  await put(INDEX_KEY, idx.filter((m) => m.id !== id));
}

export function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
