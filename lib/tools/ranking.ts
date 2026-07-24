import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { getData, getColumns } from '@/lib/data/store';

export function createTopNTool(tenantId: string) {
  return tool(
    async ({
      column,
      n,
      direction,
    }: {
      column: string;
      n?: number;
      direction?: 'top' | 'bottom';
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'Nenhum dado carregado. Faça upload de um arquivo primeiro.';
      }

      const cols = getColumns(tenantId);
      if (!cols.includes(column)) {
        return `Coluna "${column}" não encontrada. Colunas disponíveis: ${cols.join(', ')}`;
      }

      const dir = direction ?? 'top';
      const limit = n ?? 10;

      // Extract numeric values with row context
      const indexed = rows
        .map((row, i) => ({ idx: i, val: Number(row[column]), row }))
        .filter((x) => !isNaN(x.val));

      if (indexed.length === 0) {
        return `Coluna "${column}" não contém valores numéricos.`;
      }

      indexed.sort((a, b) => (dir === 'top' ? b.val - a.val : a.val - b.val));
      const top = indexed.slice(0, limit);

      // Include all columns in the result for context
      const resultRows = top.map((x, rank) => {
        const out: Record<string, unknown> = { _rank: dir === 'top' ? rank + 1 : rows.length - rank };
        for (const col of cols) {
          out[col] = x.row[col];
        }
        return out;
      });

      const total = indexed.reduce((sum, x) => sum + x.val, 0);
      const topTotal = top.reduce((sum, x) => sum + x.val, 0);

      return JSON.stringify({
        column,
        direction: dir,
        topN: limit,
        topShare: Math.round((topTotal / (total || 1)) * 10000) / 100,
        rows: resultRows,
      });
    },
    {
      name: 'top_n',
      description: `Retorna os N maiores (ou menores) valores de uma coluna, com as linhas completas para contexto. Inclui o share (%) do total que esses top N representam.

⚠️ Use esta ferramenta quando o usuário perguntar:
- "Top 10 clientes/produtos/vendedores por receita/vendas?"
- "Quais são os maiores/menores X?"
- "Quem são meus melhores/piores clientes?"
- Qualquer pergunta de ranking.`,
      schema: z.object({
        column: z.string().describe('Coluna numérica para ordenar'),
        n: z.number().optional().describe('Quantos itens retornar (padrão: 10)'),
        direction: z
          .enum(['top', 'bottom'])
          .optional()
          .describe('"top" para maiores, "bottom" para menores (padrão: top)'),
      }),
    },
  );
}

const FILTER_OPS = ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_equal', 'less_equal', 'contains'] as const;

export function createFilterTool(tenantId: string) {
  return tool(
    async ({
      column,
      operator,
      value,
    }: {
      column: string;
      operator: (typeof FILTER_OPS)[number];
      value: string;
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'Nenhum dado carregado. Faça upload de um arquivo primeiro.';
      }

      const cols = getColumns(tenantId);
      if (!cols.includes(column)) {
        return `Coluna "${column}" não encontrada. Colunas disponíveis: ${cols.join(', ')}`;
      }

      const matches: Record<string, unknown>[] = [];

      for (const row of rows) {
        const cell = String(row[column] ?? '');
        const cellNum = Number(cell);
        const valNum = Number(value);
        const useNumeric = !isNaN(cellNum) && !isNaN(valNum);

        let match = false;
        switch (operator) {
          case 'equals':
            match = useNumeric ? cellNum === valNum : cell.toLowerCase() === value.toLowerCase();
            break;
          case 'not_equals':
            match = useNumeric ? cellNum !== valNum : cell.toLowerCase() !== value.toLowerCase();
            break;
          case 'greater_than':
            match = useNumeric && cellNum > valNum;
            break;
          case 'less_than':
            match = useNumeric && cellNum < valNum;
            break;
          case 'greater_equal':
            match = useNumeric && cellNum >= valNum;
            break;
          case 'less_equal':
            match = useNumeric && cellNum <= valNum;
            break;
          case 'contains':
            match = cell.toLowerCase().includes(value.toLowerCase());
            break;
        }
        if (match) matches.push(row);
      }

      // Show first 10 matches
      const sample = matches.slice(0, 10).map((row) => {
        const out: Record<string, unknown> = {};
        for (const col of cols) out[col] = row[col];
        return out;
      });

      return JSON.stringify({
        filter: `${column} ${operator} "${value}"`,
        matchCount: matches.length,
        totalRows: rows.length,
        matchPercent: Math.round((matches.length / rows.length) * 10000) / 100,
        sample,
        sampleTruncated: matches.length > 10,
      });
    },
    {
      name: 'filter',
      description: `Filtra as linhas dos dados por uma condição em uma coluna. Retorna quantas linhas correspondem e uma amostra de até 10 resultados.

Operadores disponíveis:
- equals / not_equals: comparação exata (texto ou número)
- greater_than / less_than / greater_equal / less_equal: comparação numérica
- contains: o texto contém o valor (case-insensitive)

⚠️ Use esta ferramenta quando o usuário perguntar:
- "Quais vendas foram canceladas?"
- "Clientes que compraram mais de R$1000?"
- "Pedidos do estado de SP?"
- "Quanto representa X% do total?" (combine com o count do resultado)
- Qualquer pergunta com filtro ou segmentação.`,
      schema: z.object({
        column: z.string().describe('Coluna para aplicar o filtro'),
        operator: z
          .enum(FILTER_OPS)
          .describe('Operador: equals, not_equals, greater_than, less_than, greater_equal, less_equal, contains'),
        value: z.string().describe('Valor para comparar'),
      }),
    },
  );
}

export function createParetoTool(tenantId: string) {
  return tool(
    async ({
      categoryColumn,
      valueColumn,
    }: {
      categoryColumn: string;
      valueColumn: string;
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'Nenhum dado carregado. Faça upload de um arquivo primeiro.';
      }

      const cols = getColumns(tenantId);
      for (const c of [categoryColumn, valueColumn]) {
        if (!cols.includes(c)) {
          return `Coluna "${c}" não encontrada. Colunas disponíveis: ${cols.join(', ')}`;
        }
      }

      // Sum values by category
      const groupSums = new Map<string, number>();
      for (const row of rows) {
        const key = String(row[categoryColumn] ?? '(vazio)');
        const val = Number(row[valueColumn]);
        if (isNaN(val)) continue;
        groupSums.set(key, (groupSums.get(key) ?? 0) + val);
      }

      const sorted = [...groupSums.entries()].sort((a, b) => b[1] - a[1]);
      const grandTotal = sorted.reduce((sum, [, v]) => sum + v, 0);

      let cumulative = 0;
      let cutoff = -1;
      const items = sorted.map(([name, total], i) => {
        cumulative += total;
        const cumPct = Math.round((cumulative / grandTotal) * 10000) / 100;
        if (cutoff === -1 && cumPct >= 80) cutoff = i + 1;
        return {
          rank: i + 1,
          [categoryColumn]: name.length > 40 ? name.slice(0, 40) + '…' : name,
          total: Math.round(total * 100) / 100,
          percent: Math.round((total / grandTotal) * 10000) / 100,
          cumulativePercent: cumPct,
        };
      });

      return JSON.stringify({
        categoryColumn,
        valueColumn,
        totalCategories: items.length,
        grandTotal: Math.round(grandTotal * 100) / 100,
        pareto80Cutoff: cutoff,
        pareto80Percent: items.length > 0
          ? Math.round((cutoff / items.length) * 10000) / 100
          : 0,
        items: items.slice(0, 30), // top 30 for readability
      });
    },
    {
      name: 'pareto',
      description: `Análise de Pareto (80/20): calcula a contribuição de cada categoria para o total e a contribuição acumulada. Identifica quantas categorias representam 80% do total.

⚠️ Use esta ferramenta quando o usuário perguntar:
- "Quais produtos/categorias mais contribuem para a receita?"
- "Onde devo focar meus esforços?"
- "Análise 80/20 dos meus dados."
- "Quais clientes representam a maior parte do faturamento?"
- Qualquer pergunta sobre concentração ou distribuição de contribuição.`,
      schema: z.object({
        categoryColumn: z
          .string()
          .describe('Coluna de categoria (ex: "produto", "cliente", "região")'),
        valueColumn: z
          .string()
          .describe('Coluna numérica para somar (ex: "receita", "lucro", "custo")'),
      }),
    },
  );
}
