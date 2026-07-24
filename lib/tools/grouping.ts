import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { getData, getColumns } from '@/lib/data/store';

export function createValueCountsTool(tenantId: string) {
  return tool(
    async ({ column, limit }: { column: string; limit?: number }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'Nenhum dado carregado. Faça upload de um arquivo primeiro.';
      }

      const cols = getColumns(tenantId);
      if (!cols.includes(column)) {
        return `Coluna "${column}" não encontrada. Colunas disponíveis: ${cols.join(', ')}`;
      }

      const freq = new Map<string, number>();
      let nulls = 0;
      for (const row of rows) {
        const v = row[column];
        if (v === null || v === undefined || v === '') {
          nulls++;
        } else {
          freq.set(String(v), (freq.get(String(v)) ?? 0) + 1);
        }
      }

      const total = rows.length;
      const sorted = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit ?? 20)
        .map(([value, count]) => ({
          value: value.length > 50 ? value.slice(0, 50) + '…' : value,
          count,
          percent: Math.round((count / total) * 10000) / 100,
        }));

      return JSON.stringify({
        column,
        uniqueValues: freq.size,
        nullCount: nulls,
        nullPercent: Math.round((nulls / total) * 10000) / 100,
        values: sorted,
      });
    },
    {
      name: 'value_counts',
      description: `Conta a frequência de cada valor distinto em uma coluna categórica, ordenado do mais frequente ao menos frequente, com percentuais.

⚠️ Use esta ferramenta quando o usuário perguntar:
- "Quais são os produtos/categorias/clientes/regiões mais frequentes?"
- "Qual a distribuição de X?"
- "Quantos pedidos por status/canal/vendedor?"
- Qualquer pergunta sobre ranking ou contagem de categorias.`,
      schema: z.object({
        column: z.string().describe('Nome da coluna categórica para contar frequências'),
        limit: z
          .number()
          .optional()
          .describe('Número máximo de valores a retornar (padrão: 20)'),
      }),
    },
  );
}

const GROUP_OPS = ['sum', 'avg', 'min', 'max', 'count', 'median'] as const;

export function createGroupByTool(tenantId: string) {
  return tool(
    async ({
      groupColumn,
      valueColumn,
      operation,
      limit,
    }: {
      groupColumn: string;
      valueColumn: string;
      operation: (typeof GROUP_OPS)[number];
      limit?: number;
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'Nenhum dado carregado. Faça upload de um arquivo primeiro.';
      }

      const cols = getColumns(tenantId);
      for (const c of [groupColumn, valueColumn]) {
        if (!cols.includes(c)) {
          return `Coluna "${c}" não encontrada. Colunas disponíveis: ${cols.join(', ')}`;
        }
      }

      // Build groups
      const groups = new Map<string, number[]>();
      for (const row of rows) {
        const key = String(row[groupColumn] ?? '(vazio)');
        const val = Number(row[valueColumn]);
        if (isNaN(val)) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(val);
      }

      // Compute operation per group
      const results = [...groups.entries()]
        .map(([key, nums]) => {
          let result: number;
          switch (operation) {
            case 'sum':
              result = nums.reduce((a, b) => a + b, 0);
              break;
            case 'avg':
              result = nums.reduce((a, b) => a + b, 0) / nums.length;
              break;
            case 'min':
              result = Math.min(...nums);
              break;
            case 'max':
              result = Math.max(...nums);
              break;
            case 'count':
              result = nums.length;
              break;
            case 'median': {
              const sorted = [...nums].sort((a, b) => a - b);
              const mid = Math.floor(sorted.length / 2);
              result =
                sorted.length % 2 === 0
                  ? (sorted[mid - 1] + sorted[mid]) / 2
                  : sorted[mid];
              break;
            }
          }
          return {
            [groupColumn]: key.length > 40 ? key.slice(0, 40) + '…' : key,
            [operation]: Math.round(result * 100) / 100,
            count: nums.length,
          };
        })
        .sort((a, b) => (b[operation] as number) - (a[operation] as number))
        .slice(0, limit ?? 20);

      return JSON.stringify({
        groupColumn,
        valueColumn,
        operation,
        totalGroups: groups.size,
        groups: results,
      });
    },
    {
      name: 'group_by',
      description: `Agrupa os dados por uma coluna e calcula uma operação (soma, média, mínimo, máximo, contagem, mediana) sobre outra coluna para cada grupo. Ordenado pelo resultado decrescente.

⚠️ Use esta ferramenta quando o usuário perguntar:
- "Receita/faturamento/lucro por categoria/produto/região/vendedor?"
- "Ticket médio por cliente?"
- "Total de vendas agrupado por mês/filial/canal?"
- Qualquer pergunta de "X por Y" ou "X agrupado por Y".`,
      schema: z.object({
        groupColumn: z
          .string()
          .describe('Coluna para agrupar (ex: "categoria", "região", "vendedor")'),
        valueColumn: z
          .string()
          .describe('Coluna numérica para agregar (ex: "receita", "quantidade")'),
        operation: z
          .enum(GROUP_OPS)
          .describe('Operação: sum, avg, min, max, count, median'),
        limit: z.number().optional().describe('Número máximo de grupos a retornar (padrão: 20)'),
      }),
    },
  );
}
