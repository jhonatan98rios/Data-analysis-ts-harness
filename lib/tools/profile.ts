import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getData, getColumns } from '@/lib/data/store';

interface ColumnProfile {
  name: string;
  type: 'numeric' | 'categorical' | 'mixed' | 'empty';
  totalCount: number;
  nonNullCount: number;
  nullCount: number;
  nullPercent: number;
  uniqueCount: number;
  // only populated for numeric columns
  min?: number;
  max?: number;
  avg?: number;
  median?: number;
  // only populated for categorical columns
  topValues?: { value: string; count: number; percent: number }[];
}

function isNumeric(v: unknown): boolean {
  if (typeof v === 'number') return !isNaN(v);
  if (typeof v === 'string') return v.trim() !== '' && !isNaN(Number(v.trim()));
  return false;
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return isNaN(v) ? null : v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return isNaN(n) ? null : n;
  }
  return null;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function profileColumn(
  rows: Record<string, unknown>[],
  col: string,
): ColumnProfile {
  const total = rows.length;
  const values: unknown[] = [];
  let nulls = 0;

  for (const row of rows) {
    const v = row[col];
    if (v === null || v === undefined || v === '') {
      nulls++;
    } else {
      values.push(v);
    }
  }

  const unique = new Set(values.map((v) => String(v)));
  const nonNull = values.length;

  // Classify type: if >=70% are numeric → numeric, else categorical
  const numCount = values.filter(isNumeric).length;
  const colType: ColumnProfile['type'] =
    values.length === 0
      ? 'empty'
      : numCount / values.length >= 0.7
        ? 'numeric'
        : 'categorical';

  const base: ColumnProfile = {
    name: col,
    type: colType,
    totalCount: total,
    nonNullCount: nonNull,
    nullCount: nulls,
    nullPercent: Math.round((nulls / total) * 10000) / 100,
    uniqueCount: unique.size,
  };

  if (colType === 'numeric') {
    const nums = values.map(toNum).filter((n) => n !== null) as number[];
    if (nums.length > 0) {
      base.min = Math.min(...nums);
      base.max = Math.max(...nums);
      base.avg = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
      base.median = Math.round(median(nums) * 100) / 100;
    }
  } else if (colType === 'categorical') {
    const freq = new Map<string, number>();
    for (const v of values) freq.set(String(v), (freq.get(String(v)) ?? 0) + 1);
    base.topValues = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({
        value: value.length > 40 ? value.slice(0, 40) + '…' : value,
        count,
        percent: Math.round((count / nonNull) * 10000) / 100,
      }));
  }

  return base;
}

export function createProfileTool(tenantId: string) {
  return tool(
    async () => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'Nenhum dado carregado. Faça upload de um arquivo primeiro.';
      }

      const cols = getColumns(tenantId);
      const profiles = cols.map((col) => profileColumn(rows, col));

      const summary = {
        fileName: tenantId,
        rowCount: rows.length,
        columnCount: cols.length,
        columns: profiles,
      };

      return JSON.stringify(summary);
    },
    {
      name: 'data_profile',
      description: `Gera um perfil completo dos dados carregados: número de linhas, colunas, tipos, % de nulos, valores únicos, e para colunas numéricas: min, max, média, mediana. Para colunas categóricas: top 5 valores mais frequentes.

⚠️ Use esta ferramenta OBRIGATORIAMENTE:
1. Após o upload de qualquer arquivo — ANTES de responder qualquer pergunta sobre os dados.
2. Quando o usuário perguntar "o que tem nesse arquivo?", "quais colunas?", "me mostre os dados", "como estão estruturados os dados?", ou qualquer variante de "explore os dados".
3. Quando você precisar saber os nomes das colunas disponíveis para usar outras ferramentas.

NUNCA presuma os nomes das colunas. SEMPRE confira com data_profile primeiro.`,
      schema: z.object({}),
    },
  );
}
