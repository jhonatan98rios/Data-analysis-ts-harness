import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { getData, getColumns } from '@/lib/data/store';

export function createCorrelationTool(tenantId: string) {
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

      // Extract paired numeric values
      const pairs: [number, number][] = [];
      for (const row of rows) {
        const v1 = Number(row[column1]);
        const v2 = Number(row[column2]);
        if (!isNaN(v1) && !isNaN(v2)) pairs.push([v1, v2]);
      }

      if (pairs.length < 3) {
        return `Poucos pares numéricos (${pairs.length}) para calcular correlação. São necessários ao menos 3.`;
      }

      const n = pairs.length;

      // Pearson correlation
      const sumX = pairs.reduce((s, [x]) => s + x, 0);
      const sumY = pairs.reduce((s, [, y]) => s + y, 0);
      const sumXY = pairs.reduce((s, [x, y]) => s + x * y, 0);
      const sumX2 = pairs.reduce((s, [x]) => s + x * x, 0);
      const sumY2 = pairs.reduce((s, [, y]) => s + y * y, 0);

      const num = n * sumXY - sumX * sumY;
      const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

      const r = den === 0 ? 0 : Math.round((num / den) * 10000) / 10000;

      // Strength interpretation
      const absR = Math.abs(r);
      let strength: string;
      if (absR >= 0.9) strength = 'muito forte';
      else if (absR >= 0.7) strength = 'forte';
      else if (absR >= 0.5) strength = 'moderada';
      else if (absR >= 0.3) strength = 'fraca';
      else strength = 'muito fraca ou inexistente';

      const direction = r > 0 ? 'positiva' : r < 0 ? 'negativa' : 'neutra';

      // Simple summary stats for context
      const xs = pairs.map(([x]) => x);
      const ys = pairs.map(([, y]) => y);

      return JSON.stringify({
        column1,
        column2,
        pairCount: n,
        skippedRows: rows.length - n,
        pearsonR: r,
        strength,
        direction,
        interpretation: `Correlação ${strength} e ${direction} (r = ${r}).`,
        column1Summary: {
          min: Math.round(Math.min(...xs) * 100) / 100,
          max: Math.round(Math.max(...xs) * 100) / 100,
          avg: Math.round((sumX / n) * 100) / 100,
        },
        column2Summary: {
          min: Math.round(Math.min(...ys) * 100) / 100,
          max: Math.round(Math.max(...ys) * 100) / 100,
          avg: Math.round((sumY / n) * 100) / 100,
        },
      });
    },
    {
      name: 'correlation',
      description: `Calcula a correlação de Pearson entre duas colunas numéricas. Retorna o coeficiente r (-1 a 1), a força e direção da correlação, e um resumo estatístico de cada coluna.

⚠️ Use esta ferramenta quando o usuário perguntar:
- "Investir em marketing aumenta as vendas?"
- "Existe relação entre preço e quantidade vendida?"
- "Horas trabalhadas vs produtividade?"
- "Duas variáveis estão relacionadas?"
- Qualquer pergunta sobre relação entre duas métricas.`,
      schema: z.object({
        column1: z.string().describe('Primeira coluna numérica (ex: "gasto_marketing", "preco")'),
        column2: z.string().describe('Segunda coluna numérica (ex: "receita", "quantidade")'),
      }),
    },
  );
}

export function createRatioTool(tenantId: string) {
  return tool(
    async ({
      numerator,
      denominator,
      label,
    }: {
      numerator: string;
      denominator: string;
      label?: string;
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'Nenhum dado carregado. Faça upload de um arquivo primeiro.';
      }

      const cols = getColumns(tenantId);
      for (const c of [numerator, denominator]) {
        if (!cols.includes(c)) {
          return `Coluna "${c}" não encontrada. Colunas disponíveis: ${cols.join(', ')}`;
        }
      }

      const ratios: number[] = [];
      for (const row of rows) {
        const num = Number(row[numerator]);
        const den = Number(row[denominator]);
        if (!isNaN(num) && !isNaN(den) && den !== 0) {
          ratios.push(num / den);
        }
      }

      if (ratios.length === 0) {
        return 'Nenhuma razão válida calculada. Verifique se as colunas têm valores numéricos e o denominador não é zero.';
      }

      ratios.sort((a, b) => a - b);
      const n = ratios.length;
      const sum = ratios.reduce((a, b) => a + b, 0);
      const avg = sum / n;
      const mid = Math.floor(n / 2);
      const median = n % 2 === 0 ? (ratios[mid - 1] + ratios[mid]) / 2 : ratios[mid];

      const name = label ?? `${numerator}/${denominator}`;

      return JSON.stringify({
        ratio: name,
        numerator,
        denominator,
        validPairs: n,
        skippedRows: rows.length - n,
        min: Math.round(ratios[0] * 10000) / 10000,
        max: Math.round(ratios[n - 1] * 10000) / 10000,
        avg: Math.round(avg * 10000) / 10000,
        median: Math.round(median * 10000) / 10000,
      });
    },
    {
      name: 'ratio',
      description: `Calcula a razão entre duas colunas numéricas (coluna1 / coluna2) para cada linha dos dados. Retorna min, max, média e mediana da razão.

Útil para métricas de negócio como margem, ROI, taxa de conversão, ticket médio por cliente, etc.

⚠️ Use esta ferramenta quando o usuário perguntar:
- "Qual a margem de lucro?" (lucro / receita)
- "Qual o ROI da campanha?" (retorno / investimento)
- "Taxa de conversão?" (vendas / visitas)
- "Ticket médio?" (receita / número de pedidos)
- "Custo por lead/aquisição?"
- Qualquer pergunta sobre proporção entre duas métricas.`,
      schema: z.object({
        numerator: z.string().describe('Coluna do numerador (ex: "lucro", "retorno", "vendas")'),
        denominator: z.string().describe('Coluna do denominador (ex: "receita", "investimento", "visitas")'),
        label: z.string().optional().describe('Nome amigável para a razão (ex: "Margem de lucro", "ROI")'),
      }),
    },
  );
}
