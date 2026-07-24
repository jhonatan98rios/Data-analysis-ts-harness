import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { getData, getColumns } from '@/lib/data/store';

const OPS = ['sum', 'avg', 'min', 'max', 'count', 'median', 'stddev'] as const;
type Op = (typeof OPS)[number];

function toNumbers(rows: Record<string, unknown>[], col: string): number[] {
  return rows
    .map((r) => Number(r[col]))
    .filter((n) => !isNaN(n));
}

function compute(nums: number[], op: Op): number {
  switch (op) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0);
    case 'avg':
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    case 'min':
      return nums.length ? Math.min(...nums) : 0;
    case 'max':
      return nums.length ? Math.max(...nums) : 0;
    case 'count':
      return nums.length;
    case 'median': {
      if (!nums.length) return 0;
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }
    case 'stddev': {
      if (nums.length < 2) return 0;
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance =
        nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1);
      return Math.sqrt(variance);
    }
  }
}

export function createAggregateTool(tenantId: string) {
  return tool(
    async ({ column, operation }: { column: string; operation: Op }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'Nenhum dado carregado. Faça upload de um arquivo primeiro.';
      }

      const cols = getColumns(tenantId);
      if (!cols.includes(column)) {
        return `Coluna "${column}" não encontrada. Colunas disponíveis: ${cols.join(', ')}`;
      }

      const nums = toNumbers(rows, column);

      if (nums.length === 0) {
        return `Coluna "${column}" não contém valores numéricos (${rows.length} linhas analisadas).`;
      }

      const result = compute(nums, operation);
      const rounded = Number.isInteger(result) ? result : Math.round(result * 100) / 100;

      return JSON.stringify({
        operation,
        column,
        result: rounded,
        numericCount: nums.length,
        totalRows: rows.length,
        nonNumeric: rows.length - nums.length,
      });
    },
    {
      name: 'aggregate',
      description: `Executa uma operação de agregação sobre uma coluna numérica dos dados carregados.

⚠️ Use esta ferramenta para QUALQUER pergunta sobre: soma, total, média, ticket médio, mínimo, máximo, mediana, desvio padrão, contagem, valor mais alto, valor mais baixo, faturamento, receita, custo, quantidade... ENFIM, QUALQUER pergunta que envolva um número derivado dos dados.

Operações disponíveis: sum (soma/total), avg (média), min, max, count (contagem de valores numéricos), median (mediana), stddev (desvio padrão).

NUNCA invente ou estime valores. SEMPRE chame esta ferramenta.`,
      schema: z.object({
        column: z
          .string()
          .describe('Nome da coluna numérica a agregar'),
        operation: z
          .enum(OPS)
          .describe(
            'Operação: sum (soma/total), avg (média), min (mínimo), max (máximo), count (quantos valores numéricos), median (mediana), stddev (desvio padrão)',
          ),
      }),
    },
  );
}
