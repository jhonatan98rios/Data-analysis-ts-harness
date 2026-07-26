const INDEX_KEY = 'dah:idx';
const PREFIX = 'dah:s:';

export interface SessionMeta {
  id: string;
  lastUpdate: number;
  preview: string;
}

export interface SessionFile {
  name: string;
  type: string;
  size: number;
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

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function getIndex(): SessionMeta[] {
  return read<SessionMeta[]>(INDEX_KEY, []).sort((a, b) => b.lastUpdate - a.lastUpdate);
}

export function upsertMeta(id: string, preview: string): void {
  const idx = read<SessionMeta[]>(INDEX_KEY, []);
  const now = Date.now();
  const i = idx.findIndex((m) => m.id === id);
  if (i >= 0) {
    idx[i] = { id, lastUpdate: now, preview };
  } else {
    idx.push({ id, lastUpdate: now, preview });
  }
  localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
}

export function loadSession(id: string): SessionData | null {
  return read<SessionData | null>(PREFIX + id, null);
}

export function saveSession(id: string, data: SessionData): void {
  localStorage.setItem(PREFIX + id, JSON.stringify(data));
}

export function deleteSession(id: string): void {
  localStorage.removeItem(PREFIX + id);
  const idx = read<SessionMeta[]>(INDEX_KEY, []);
  localStorage.setItem(INDEX_KEY, JSON.stringify(idx.filter((m) => m.id !== id)));
}

export function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
