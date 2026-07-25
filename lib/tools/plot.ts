import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const CHART_TYPES = ['bar', 'line', 'pie', 'scatter', 'area', 'histogram'] as const;

export interface ChartSpec {
  id: string;
  chartType: (typeof CHART_TYPES)[number];
  title: string;
  xKey: string;
  yKey: string;
  yKeys?: string[];
  data: Record<string, unknown>[];
  xLabel?: string;
  yLabel?: string;
}

export function createPlotTool() {
  return tool(
    async ({
      chartType,
      title,
      xKey,
      yKey,
      yKeys,
      data,
      xLabel,
      yLabel,
    }: {
      chartType: (typeof CHART_TYPES)[number];
      title: string;
      xKey: string;
      yKey: string;
      yKeys?: string[];
      data: Record<string, unknown>[];
      xLabel?: string;
      yLabel?: string;
    }) => {
      // Validate we have data
      if (!data?.length) {
        return JSON.stringify({
          summary: '❌ Nenhum dado fornecido para o gráfico.',
          chart: null,
        });
      }

      // Validate keys exist in data
      const keys = Object.keys(data[0]);
      const missing: string[] = [];
      if (!keys.includes(xKey)) missing.push(`xKey="${xKey}"`);
      const keys_y = yKeys?.length ? yKeys : [yKey];
      for (const yk of keys_y) {
        if (!keys.includes(yk)) missing.push(`yKey="${yk}"`);
      }
      if (missing.length > 0) {
        return JSON.stringify({
          summary: `❌ Chave(s) não encontrada(s) nos dados: ${missing.join(', ')}. Chaves disponíveis: ${keys.join(', ')}`,
          chart: null,
        });
      }

      const chart: ChartSpec = {
        id: `chart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        chartType,
        title,
        xKey,
        yKey,
        yKeys,
        data: data.slice(0, 50), // ponytail: cap at 50 data points for readability
        xLabel,
        yLabel,
      };

      const typeLabel: Record<string, string> = {
        bar: 'barras',
        line: 'linha',
        pie: 'pizza',
        scatter: 'dispersão',
        area: 'área',
        histogram: 'histograma',
      };

      return JSON.stringify({
        summary: `📊 Gráfico de ${typeLabel[chartType] || chartType} "${title}" gerado com ${data.length} pontos.`,
        chart,
      });
    },
    {
      name: 'plot',
      description: `Gera um gráfico a partir de dados já calculados por outras ferramentas. Esta ferramenta NÃO calcula dados — apenas recebe o resultado de tool calls anteriores e cria a visualização.

Tipos de gráfico disponíveis:
- bar: comparação entre categorias (ex: vendas por produto, receita por filial)
- line: evolução temporal (ex: vendas ao longo dos meses)
- pie: proporção/proporções (ex: share de mercado por categoria)
- scatter: relação entre duas variáveis (ex: preço vs quantidade)
- area: tendência com área preenchida (ex: crescimento acumulado)
- histogram: distribuição de frequência (ex: faixas de ticket médio)

⚠️ Regras de uso:
1. PRIMEIRO obtenha os dados com group_by, aggregate, pareto, value_counts, etc.
2. DEPOIS chame plot passando o resultado como \`data\`.
3. NUNCA invente dados — passe exatamente o que a tool anterior retornou.
4. Para gráficos de linha/área, os dados devem estar ordenados por tempo.

⚠️ Gatilhos — use esta ferramenta quando o usuário pedir:
- "Faça um gráfico de..."
- "Mostre em gráfico..."
- "Visualize..."
- "Gráfico de barras/pizza/linha..."
- "Plote..."
- Após qualquer análise numérica, ofereça gerar o gráfico.`,
      schema: z.object({
        chartType: z
          .enum(CHART_TYPES)
          .describe('Tipo de gráfico: bar, line, pie, scatter, area, histogram'),
        title: z.string().describe('Título do gráfico (ex: "Vendas por Categoria")'),
        xKey: z.string().describe('Nome da chave no objeto de dados para o eixo X (ex: "categoria", "period")'),
        yKey: z.string().describe('Nome da chave no objeto de dados para o eixo Y (ex: "sum", "total", "count")'),
        yKeys: z
          .array(z.string())
          .optional()
          .describe('Array de chaves para múltiplas séries Y (ex: ["receita", "custo"]) — opcional, use para gráficos com mais de uma linha/barra'),
        data: z
          .array(z.record(z.string(), z.unknown()))
          .describe('Array de objetos com os dados. Use EXATAMENTE o resultado retornado por outra tool (ex: group_by.groups, pareto.items, trend.data)'),
        xLabel: z.string().optional().describe('Rótulo do eixo X (opcional)'),
        yLabel: z.string().optional().describe('Rótulo do eixo Y (opcional)'),
      }),
    },
  );
}
