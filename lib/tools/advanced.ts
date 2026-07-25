import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { getData, getColumns } from '@/lib/data/store';

export function createCountByGroupTool(tenantId: string) {
  return tool(
    async ({
      column1,
      column2,
    }: {
      column1: string;
      column2: string;
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'Nenhum dado carregado. Faça upload de um arquivo primeiro.';
      }

      const cols = getColumns(tenantId);
      for (const c of [column1, column2]) {
        if (!cols.includes(c)) {
          return `Coluna "${c}" não encontrada. Colunas disponíveis: ${cols.join(', ')}`;
        }
      }

      // Build cross-tab: { col1value: { col2value: count } }
      const matrix = new Map<string, Map<string, number>>();
      const col2Totals = new Map<string, number>();

      for (const row of rows) {
        const v1 = String(row[column1] ?? '(vazio)');
        const v2 = String(row[column2] ?? '(vazio)');

        if (!matrix.has(v1)) matrix.set(v1, new Map());
        const inner = matrix.get(v1)!;
        inner.set(v2, (inner.get(v2) ?? 0) + 1);

        col2Totals.set(v2, (col2Totals.get(v2) ?? 0) + 1);
      }

      // Gather all unique col2 values (sorted by frequency desc), limit to top 15
      const allCol2 = [...col2Totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([v]) => v);

      // Build rows: one per col1 value
      const table = [...matrix.entries()]
        .map(([v1, inner]) => {
          let rowTotal = 0;
          const cells: Record<string, number> = {};
          for (const v2 of allCol2) {
            const count = inner.get(v2) ?? 0;
            cells[v2] = count;
            rowTotal += count;
          }
          return {
            [column1]: v1.length > 30 ? v1.slice(0, 30) + '…' : v1,
            total: rowTotal,
            ...cells,
          };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 20);

      // Column totals row
      const colTotalsRow: Record<string, string | number> = { [column1]: 'TOTAL' };
      let grandTotal = 0;
      for (const v2 of allCol2) {
        const t = col2Totals.get(v2) ?? 0;
        colTotalsRow[v2] = t;
        grandTotal += t;
      }
      colTotalsRow.total = grandTotal;

      return JSON.stringify({
        column1,
        column2,
        totalRows: rows.length,
        column2Values: allCol2.length,
        column2ValuesTruncated: col2Totals.size > 15,
        rows: table,
        totals: colTotalsRow,
      });
    },
    {
      name: 'count_by_group',
      description: `Tabulação cruzada: conta a frequência de cada combinação entre duas colunas categóricas. Retorna uma matriz onde cada linha é um valor da coluna1 e cada coluna é um valor da coluna2, com os totais.

⚠️ Use esta ferramenta quando o usuário perguntar:
- "Quantas devoluções por categoria e por filial?"
- "Qual o perfil de compra por região e por produto?"
- "Cruzamento entre status e canal de venda?"
- "Distribuição de X por Y?"
- Qualquer pergunta que cruze duas variáveis categóricas.`,
      schema: z.object({
        column1: z.string().describe('Primeira coluna categórica (linhas da matriz)'),
        column2: z.string().describe('Segunda coluna categórica (colunas da matriz)'),
      }),
    },
  );
}

const DESCRIBE_OPS = ['sum', 'avg', 'count', 'min', 'max', 'median'] as const;

export function createDescribeConditionalTool(tenantId: string) {
  return tool(
    async ({
      targetColumn,
      conditionColumn,
      conditionValue,
      operations,
    }: {
      targetColumn: string;
      conditionColumn: string;
      conditionValue: string;
      operations: (typeof DESCRIBE_OPS)[number][];
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'Nenhum dado carregado. Faça upload de um arquivo primeiro.';
      }

      const cols = getColumns(tenantId);
      for (const c of [targetColumn, conditionColumn]) {
        if (!cols.includes(c)) {
          return `Coluna "${c}" não encontrada. Colunas disponíveis: ${cols.join(', ')}`;
        }
      }

      // Filter rows where conditionColumn == conditionValue, collect targetColumn numeric values
      const nums: number[] = [];
      for (const row of rows) {
        const cond = String(row[conditionColumn] ?? '');
        if (cond !== conditionValue) continue;
        const val = Number(row[targetColumn]);
        if (!isNaN(val)) nums.push(val);
      }

      if (nums.length === 0) {
        return `Nenhuma linha encontrada com ${conditionColumn}="${conditionValue}" que tenha valores numéricos em "${targetColumn}".`;
      }

      const stats: Record<string, number> = {};
      for (const op of operations) {
        let result: number;
        switch (op) {
          case 'sum':
            result = nums.reduce((a, b) => a + b, 0);
            break;
          case 'avg':
            result = nums.reduce((a, b) => a + b, 0) / nums.length;
            break;
          case 'count':
            result = nums.length;
            break;
          case 'min':
            result = Math.min(...nums);
            break;
          case 'max':
            result = Math.max(...nums);
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
        stats[op] = Math.round(result * 100) / 100;
      }

      return JSON.stringify({
        filter: `${conditionColumn}="${conditionValue}"`,
        targetColumn,
        matchedRows: nums.length,
        totalRows: rows.length,
        matchPercent: Math.round((nums.length / rows.length) * 10000) / 100,
        stats,
      });
    },
    {
      name: 'describe_conditional',
      description: `Calcula estatísticas (soma, média, contagem, min, max, mediana) de uma coluna numérica, mas SOMENTE para as linhas onde outra coluna atende a uma condição específica.

É como um filter + aggregate em uma única chamada — mais rápido e econômico.

⚠️ Use esta ferramenta quando o usuário perguntar:
- "Qual o total/média de devoluções?"
- "Quanto foi vendido apenas dos produtos da categoria X?"
- "Ticket médio só dos clientes de SP?"
- "Valor máximo de venda apenas no canal online?"
- Qualquer estatística numérica filtrada por uma condição.`,
      schema: z.object({
        targetColumn: z
          .string()
          .describe('Coluna numérica para calcular estatísticas (ex: "Vl_Total", "receita")'),
        conditionColumn: z
          .string()
          .describe('Coluna para aplicar a condição (ex: "Status", "Categoria")'),
        conditionValue: z
          .string()
          .describe('Valor exato da condição (ex: "Devolvida", "Eletrônicos")'),
        operations: z
          .array(z.enum(DESCRIBE_OPS))
          .describe('Lista de operações: sum, avg, count, min, max, median'),
      }),
    },
  );
}

const PIVOT_OPS = ['sum', 'avg', 'count'] as const;

export function createPivotTool(tenantId: string) {
  return tool(
    async ({
      rowColumn,
      columnColumn,
      valueColumn,
      operation,
    }: {
      rowColumn: string;
      columnColumn: string;
      valueColumn: string;
      operation: (typeof PIVOT_OPS)[number];
    }) => {
      const rows = getData(tenantId);
      if (!rows?.length) return 'Nenhum dado carregado.';

      const cols = getColumns(tenantId);
      for (const c of [rowColumn, columnColumn, valueColumn]) {
        if (!cols.includes(c)) {
          return `Coluna "${c}" não encontrada. Disponíveis: ${cols.join(', ')}`;
        }
      }

      // Build: { rowValue: { colValue: number[] } }
      const matrix = new Map<string, Map<string, number[]>>();
      const allColValues = new Set<string>();

      for (const row of rows) {
        const rv = String(row[rowColumn] ?? '(vazio)');
        const cv = String(row[columnColumn] ?? '(vazio)');
        const val = Number(row[valueColumn]);
        if (isNaN(val)) continue;

        allColValues.add(cv);
        if (!matrix.has(rv)) matrix.set(rv, new Map());
        const inner = matrix.get(rv)!;
        if (!inner.has(cv)) inner.set(cv, []);
        inner.get(cv)!.push(val);
      }

      // Sort column values for consistency
      const colValues = [...allColValues].sort();

      // Compute operation per cell, produce pivot rows
      const data = [...matrix.entries()]
        .map(([rv, inner]) => {
          const out: Record<string, unknown> = { [rowColumn]: rv };
          for (const cv of colValues) {
            const nums = inner.get(cv) ?? [];
            let result: number;
            switch (operation) {
              case 'sum':
                result = nums.reduce((a, b) => a + b, 0);
                break;
              case 'avg':
                result = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
                break;
              case 'count':
                result = nums.length;
                break;
            }
            out[cv] = Math.round(result * 100) / 100;
          }
          return out;
        })
        .slice(0, 30); // ponytail: cap rows

      return JSON.stringify({
        pivot: `${rowColumn} × ${columnColumn}`,
        operation,
        rowColumn,
        columnColumn,
        valueColumn,
        columns: colValues.slice(0, 15),
        columnsTruncated: colValues.length > 15,
        data,
        _hint: 'Use plot com chartType="bar", xKey=<rowColumn>, yKeys=<columns>, stacked=false para barras agrupadas. Use stacked=true para empilhadas.',
      });
    },
    {
      name: 'pivot',
      description: `Tabela dinâmica (pivot table): cruza duas colunas categóricas e agrega uma terceira coluna numérica. O resultado é perfeito para gráficos de barras agrupadas ou empilhadas.

Exemplo: pivot(rowColumn="data", columnColumn="categoria", valueColumn="Vl_Total", operation="sum")
→ Retorna dados no formato: [{data: "2024-01", Eletrônicos: 45000, Móveis: 32000}, ...]

⚠️ Use esta ferramenta quando o usuário perguntar:
- "Vendas por categoria agrupadas por mês/data/região?"
- "Comparação de X por Y ao longo do tempo?"
- "Tabela cruzada de..."
- "Quero ver o valor por categoria, quebrado por filial/data/vendedor"
- Antes de gerar gráficos de barras agrupadas: PRIMEIRO chame pivot, DEPOIS chame plot com os dados retornados.`,
      schema: z.object({
        rowColumn: z
          .string()
          .describe('Coluna para as LINHAS da tabela — normalmente a dimensão temporal (ex: "data", "mes") ou agrupamento principal (ex: "filial")'),
        columnColumn: z
          .string()
          .describe('Coluna para as COLUNAS da tabela — as categorias que viram séries no gráfico (ex: "categoria", "produto", "vendedor")'),
        valueColumn: z
          .string()
          .describe('Coluna numérica para agregar (ex: "Vl_Total", "receita", "quantidade")'),
        operation: z
          .enum(PIVOT_OPS)
          .describe('Operação: sum (total), avg (média), count (contagem)'),
      }),
    },
  );
}
