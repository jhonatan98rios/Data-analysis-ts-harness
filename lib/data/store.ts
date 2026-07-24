// ponytail: in-memory store, resets on restart. Add persistence if needed.
const stores = new Map<string, Record<string, unknown>[]>();

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  data: string; // base64
}

function simpleCSVParse(text: string): Record<string, unknown>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row;
  });
}

export function parseAndStore(tenantId: string, files: UploadedFile[]): void {
  for (const f of files) {
    const text = Buffer.from(f.data, 'base64').toString('utf-8');
    let rows: Record<string, unknown>[];
    if (f.name.endsWith('.json')) {
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed : [parsed as Record<string, unknown>];
    } else {
      // ponytail: CSV only, add xlsx/parquet parsing when needed
      rows = simpleCSVParse(text);
    }
    if (rows.length > 0) {
      stores.set(tenantId, rows);
    }
  }
}

export function getData(tenantId: string): Record<string, unknown>[] | undefined {
  return stores.get(tenantId);
}

export function getColumns(tenantId: string): string[] {
  const rows = stores.get(tenantId);
  if (!rows || rows.length === 0) return [];
  return Object.keys(rows[0]);
}
