import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { getData, getColumns } from '@/lib/data/store';

export function createAggregateSumTool(tenantId: string) {
  return tool(
    async ({ column }: { column: string }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'Nenhum dado carregado. Faça upload de um arquivo primeiro.';
      }

      const cols = getColumns(tenantId);
      if (!cols.includes(column)) {
        return `Coluna "${column}" não encontrada. Colunas disponíveis: ${cols.join(', ')}`;
      }

      const sum = rows.reduce((acc, row) => {
        const val = Number(row[column]);
        return acc + (isNaN(val) ? 0 : val);
      }, 0);

      return JSON.stringify({ column, sum, count: rows.length });
    },
    {
      name: 'aggregate_sum',
      description: `Soma os valores de uma coluna numérica nos dados carregados.
Use esta ferramenta quando o usuário perguntar sobre soma, total, ou agregação de uma coluna.
Colunas disponíveis: ${getColumns(tenantId).join(', ') || '(faça upload primeiro)'}`,
      schema: z.object({
        column: z.string().describe('Nome da coluna para somar os valores'),
      }),
    },
  );
}
