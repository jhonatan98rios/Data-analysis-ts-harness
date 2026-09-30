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
        return JSON.stringify({ summary: '❌ No data provided for the chart.', chart: null });
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
          summary: `❌ Missing key(s): ${missing.join(', ')}. Available: ${keys.join(', ')}`,
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
        bar: stacked ? 'stacked bars' : horizontal ? 'horizontal bars' : 'bars',
        line: 'line',
        pie: donut ? 'donut' : 'pie',
        scatter: 'scatter',
        area: 'area',
        histogram: 'histogram',
        dual_axis: 'dual axis (bar + line)',
      };

      return JSON.stringify({
        summary: `📊 ${typeLabel[chartType] || chartType} chart "${title}" generated with ${data.length} points.`,
        chart,
      });
    },
    {
      name: 'plot',
      description: `Generates a chart from data already computed by other tools. It does NOT compute data — it only receives results and creates visualizations.

## Chart types
- bar: comparison between categories (e.g. sales by product)
  - Use \`horizontal: true\` when category names are long
  - Use \`stacked: true\` with \`yKeys: ["revenue", "cost"]\` to split each bar into segments
- line: time evolution (e.g. sales over months)
- pie: proportions (e.g. market share). Use \`donut: true\` for a donut chart
- area: trend with filled area (e.g. cumulative growth)
  - Use \`stacked: true\` with multiple yKeys for stacked areas
- scatter: relationship between two variables (e.g. price vs quantity)
- histogram: frequency distribution (e.g. average ticket ranges)
- dual_axis: overlaid bars + line with two Y axes. E.g. bars = monthly revenue, line = % growth.
  - \`yKey\`: column for the bars, \`lineYKey\`: column for the line

## Variations (optional parameters)
- \`stacked: true\`: stack multiple Y series (bar and area)
- \`horizontal: true\`: horizontal bars (bar)
- \`donut: true\`: donut chart instead of pie (pie)
- \`yKeys: ["col1", "col2"]\`: multiple series on the same axis
- \`lineYKey\`: column for the line in the dual_axis chart
- \`lineYLabel\`: Y-axis label for the line in dual_axis

## Rules
1. For grouped bar charts (e.g. sales by category in each month), FIRST call the \`pivot\` tool to cross the two dimensions. THEN call \`plot\` passing the returned \`data\` and \`yKeys\` with the pivot column names.
2. For simple single-dimension charts, use group_by, pareto, trend, etc. and pass the result as \`data\`.
3. NEVER invent data — pass exactly what the previous tool returned.
4. For line/area, the data must be ordered by time.

⚠️ Use this tool when the user asks for ANY visualization or chart. After numeric analyses, OFFER to generate the chart.`,
      schema: z.object({
        chartType: z
          .enum(CHART_TYPES)
          .describe('Type: bar, line, pie, scatter, area, histogram, dual_axis'),
        title: z.string().describe('Title (e.g. "Sales by Category")'),
        xKey: z.string().describe('Key for the X axis (e.g. "category", "period")'),
        yKey: z.string().describe('Main key for the Y axis (e.g. "sum", "total")'),
        yKeys: z
          .array(z.string())
          .optional()
          .describe('Multiple Y series (e.g. ["revenue", "cost"]). Use with stacked: true to stack.'),
        data: z
          .array(z.record(z.string(), z.unknown()))
          .describe('Array of objects — use EXACTLY the result of another tool (group_by.groups, pareto.items, trend.data)'),
        xLabel: z.string().optional().describe('X-axis label'),
        yLabel: z.string().optional().describe('Y-axis label'),
        stacked: z.boolean().optional().describe('Stack series (bar, area)'),
        horizontal: z.boolean().optional().describe('Horizontal bars (bar)'),
        donut: z.boolean().optional().describe('Donut chart (pie)'),
        lineYKey: z.string().optional().describe('Key for the line in dual_axis (e.g. "growth")'),
        lineYLabel: z.string().optional().describe('Y-axis label for the line in dual_axis'),
      }),
    },
  );
}
