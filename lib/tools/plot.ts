import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const CHART_TYPES = ['bar', 'line', 'pie', 'scatter', 'area', 'histogram', 'dual_axis'] as const;

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
  // Variations
  stacked?: boolean;
  horizontal?: boolean;
  donut?: boolean;
  // dual_axis: bar + line overlay
  lineYKey?: string;
  lineYLabel?: string;
}

export function createPlotTool() {
  return tool(
    async (params: {
      chartType: (typeof CHART_TYPES)[number];
      title: string;
      xKey: string;
      yKey: string;
      yKeys?: string[];
      data: Record<string, unknown>[];
      xLabel?: string;
      yLabel?: string;
      stacked?: boolean;
      horizontal?: boolean;
      donut?: boolean;
      lineYKey?: string;
      lineYLabel?: string;
    }) => {
      const {
        chartType, title, xKey, yKey, yKeys, data,
        xLabel, yLabel, stacked, horizontal, donut,
        lineYKey, lineYLabel,
      } = params;

      if (!data?.length) {
        return JSON.stringify({ summary: '❌ Nenhum dado fornecido para o gráfico.', chart: null });
      }

      // Validate keys
      const keys = Object.keys(data[0]);
      const missing: string[] = [];
      if (!keys.includes(xKey)) missing.push(`xKey="${xKey}"`);
      const keys_y = yKeys?.length ? yKeys : [yKey];
      for (const yk of keys_y) {
        if (!keys.includes(yk)) missing.push(`yKey="${yk}"`);
      }
      if (lineYKey && !keys.includes(lineYKey)) missing.push(`lineYKey="${lineYKey}"`);
      if (missing.length > 0) {
        return JSON.stringify({
          summary: `❌ Chave(s) não encontrada(s): ${missing.join(', ')}. Disponíveis: ${keys.join(', ')}`,
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
        data: data.slice(0, 50),
        xLabel,
        yLabel,
        stacked,
        horizontal,
        donut,
        lineYKey,
        lineYLabel,
      };

      const typeLabel: Record<string, string> = {
        bar: stacked ? 'barras empilhadas' : horizontal ? 'barras horizontais' : 'barras',
        line: 'linha',
        pie: donut ? 'rosca (donut)' : 'pizza',
        scatter: 'dispersão',
        area: 'área',
        histogram: 'histograma',
        dual_axis: 'eixo duplo (barra + linha)',
      };

      return JSON.stringify({
        summary: `📊 Gráfico de ${typeLabel[chartType] || chartType} "${title}" gerado com ${data.length} pontos.`,
        chart,
      });
    },
    {
      name: 'plot',
      description: `Gera um gráfico a partir de dados já calculados por outras ferramentas. NÃO calcula dados — apenas recebe resultados e cria visualizações.

## Tipos de gráfico
- bar: comparação entre categorias (ex: vendas por produto)
  - Use \`horizontal: true\` quando os nomes das categorias forem longos
  - Use \`stacked: true\` com \`yKeys: ["receita", "custo"]\` para quebrar cada barra em segmentos
- line: evolução temporal (ex: vendas ao longo dos meses)
- pie: proporções (ex: share de mercado). Use \`donut: true\` para gráfico de rosca
- area: tendência com área preenchida (ex: crescimento acumulado)
  - Use \`stacked: true\` com múltiplos yKeys para áreas empilhadas
- scatter: relação entre duas variáveis (ex: preço vs quantidade)
- histogram: distribuição de frequência (ex: faixas de ticket médio)
- dual_axis: barras + linha sobrepostas com dois eixos Y. Ex: barras = receita mensal, linha = % de crescimento.
  - \`yKey\`: coluna para as barras, \`lineYKey\`: coluna para a linha

## Variações (parâmetros opcionais)
- \`stacked: true\`: empilha múltiplas séries Y (bar e area)
- \`horizontal: true\`: barras horizontais (bar)
- \`donut: true\`: gráfico de rosca em vez de pizza (pie)
- \`yKeys: ["col1", "col2"]\`: múltiplas séries no mesmo eixo
- \`lineYKey\`: coluna para a linha no gráfico dual_axis
- \`lineYLabel\`: rótulo do eixo Y da linha no dual_axis

## Regras
1. Para gráficos de barras agrupadas (ex: vendas por categoria em cada mês), PRIMEIRO chame a tool \`pivot\` para cruzar as duas dimensões. DEPOIS chame \`plot\` passando o \`data\` retornado e \`yKeys\` com os nomes das colunas do pivot.
2. Para gráficos simples de uma dimensão, use group_by, pareto, trend, etc. e passe o resultado como \`data\`.
3. NUNCA invente dados — passe exatamente o que a tool anterior retornou.
4. Para line/area, os dados devem estar ordenados por tempo.

⚠️ Use esta ferramenta quando o usuário pedir QUALQUER visualização ou gráfico. Após análises numéricas, OFEREÇA gerar o gráfico.`,
      schema: z.object({
        chartType: z
          .enum(CHART_TYPES)
          .describe('Tipo: bar, line, pie, scatter, area, histogram, dual_axis'),
        title: z.string().describe('Título (ex: "Vendas por Categoria")'),
        xKey: z.string().describe('Chave para eixo X (ex: "categoria", "period")'),
        yKey: z.string().describe('Chave principal para eixo Y (ex: "sum", "total")'),
        yKeys: z
          .array(z.string())
          .optional()
          .describe('Múltiplas séries Y (ex: ["receita", "custo"]). Use com stacked: true para empilhar.'),
        data: z
          .array(z.record(z.string(), z.unknown()))
          .describe('Array de objetos — use EXATAMENTE o resultado de outra tool (group_by.groups, pareto.items, trend.data)'),
        xLabel: z.string().optional().describe('Rótulo eixo X'),
        yLabel: z.string().optional().describe('Rótulo eixo Y'),
        stacked: z.boolean().optional().describe('Empilhar séries (bar, area)'),
        horizontal: z.boolean().optional().describe('Barras horizontais (bar)'),
        donut: z.boolean().optional().describe('Gráfico de rosca (pie)'),
        lineYKey: z.string().optional().describe('Chave para linha no dual_axis (ex: "crescimento")'),
        lineYLabel: z.string().optional().describe('Rótulo do eixo Y da linha no dual_axis'),
      }),
    },
  );
}
