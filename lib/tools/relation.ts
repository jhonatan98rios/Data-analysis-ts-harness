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
        return 'No data loaded. Upload a file first.';
      }

      const cols = getColumns(tenantId);
      for (const c of [column1, column2]) {
        if (!cols.includes(c)) {
          return `Column "${c}" not found. Available columns: ${cols.join(', ')}`;
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
        return `Too few numeric pairs (${pairs.length}) to compute correlation. At least 3 are required.`;
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
      if (absR >= 0.9) strength = 'very strong';
      else if (absR >= 0.7) strength = 'strong';
      else if (absR >= 0.5) strength = 'moderate';
      else if (absR >= 0.3) strength = 'weak';
      else strength = 'very weak or nonexistent';

      const direction = r > 0 ? 'positive' : r < 0 ? 'negative' : 'neutral';

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
        interpretation: `Correlation is ${strength} and ${direction} (r = ${r}).`,
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
      description: `Computes the Pearson correlation between two numeric columns. Returns the coefficient r (-1 to 1), the correlation strength and direction, and a statistical summary of each column.

⚠️ Use this tool when the user asks:
- "Does investing in marketing increase sales?"
- "Is there a relationship between price and quantity sold?"
- "Hours worked vs productivity?"
- "Are two variables related?"
- Any question about the relationship between two metrics.`,
      schema: z.object({
        column1: z.string().describe('First numeric column (e.g. "marketing_spend", "price")'),
        column2: z.string().describe('Second numeric column (e.g. "revenue", "quantity")'),
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
        return 'No data loaded. Upload a file first.';
      }

      const cols = getColumns(tenantId);
      for (const c of [numerator, denominator]) {
        if (!cols.includes(c)) {
          return `Column "${c}" not found. Available columns: ${cols.join(', ')}`;
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
        return 'No valid ratio computed. Check that the columns have numeric values and the denominator is not zero.';
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
      description: `Computes the ratio between two numeric columns (column1 / column2) for each data row. Returns the min, max, average and median of the ratio.

Useful for business metrics such as margin, ROI, conversion rate, average ticket per customer, etc.

⚠️ Use this tool when the user asks:
- "What is the profit margin?" (profit / revenue)
- "What is the campaign ROI?" (return / investment)
- "Conversion rate?" (sales / visits)
- "Average ticket?" (revenue / number of orders)
- "Cost per lead/acquisition?"
- Any question about a proportion between two metrics.`,
      schema: z.object({
        numerator: z.string().describe('Numerator column (e.g. "profit", "return", "sales")'),
        denominator: z.string().describe('Denominator column (e.g. "revenue", "investment", "visits")'),
        label: z.string().optional().describe('Friendly name for the ratio (e.g. "Profit margin", "ROI")'),
      }),
    },
  );
}
