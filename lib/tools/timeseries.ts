import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { getData, getColumns } from '@/lib/data/store';

export function createComparePeriodsTool(tenantId: string) {
  return tool(
    async ({
      dateColumn,
      valueColumn,
      period1Label,
      period1Start,
      period1End,
      period2Label,
      period2Start,
      period2End,
      operation,
    }: {
      dateColumn: string;
      valueColumn: string;
      period1Label: string;
      period1Start: string;
      period1End: string;
      period2Label: string;
      period2Start: string;
      period2End: string;
      operation?: 'sum' | 'avg';
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'No data loaded. Upload a file first.';
      }

      const cols = getColumns(tenantId);
      for (const c of [dateColumn, valueColumn]) {
        if (!cols.includes(c)) {
          return `Column "${c}" not found. Available columns: ${cols.join(', ')}`;
        }
      }

      const op = operation ?? 'sum';

      function inPeriod(row: Record<string, unknown>, start: string, end: string): boolean {
        const cell = String(row[dateColumn] ?? '').trim();
        // Try to extract a comparable substring — works for ISO dates, DD/MM/YYYY, etc.
        const clean = cell.replace(/[^0-9]/g, '');
        const s = start.replace(/[^0-9]/g, '');
        const e = end.replace(/[^0-9]/g, '');
        return clean >= s && clean <= e;
      }

      function aggregate(inRows: Record<string, unknown>[]): { total: number; count: number } {
        const nums: number[] = [];
        for (const row of inRows) {
          const v = Number(row[valueColumn]);
          if (!isNaN(v)) nums.push(v);
        }
        const total = nums.reduce((a, b) => a + b, 0);
        return { total, count: nums.length };
      }

      const p1Rows = rows.filter((r) => inPeriod(r, period1Start, period1End));
      const p2Rows = rows.filter((r) => inPeriod(r, period2Start, period2End));

      const p1 = aggregate(p1Rows);
      const p2 = aggregate(p2Rows);

      const p1Val = op === 'avg' && p1.count > 0 ? p1.total / p1.count : p1.total;
      const p2Val = op === 'avg' && p2.count > 0 ? p2.total / p2.count : p2.total;

      const change = p2Val - p1Val;
      const changePct = p1Val !== 0 ? Math.round((change / Math.abs(p1Val)) * 10000) / 100 : 0;

      return JSON.stringify({
        dateColumn,
        valueColumn,
        operation: op,
        period1: {
          label: period1Label,
          rows: p1Rows.length,
          value: Math.round(p1Val * 100) / 100,
        },
        period2: {
          label: period2Label,
          rows: p2Rows.length,
          value: Math.round(p2Val * 100) / 100,
        },
        change: {
          absolute: Math.round(change * 100) / 100,
          percent: changePct,
          direction: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'no_change',
        },
      });
    },
    {
      name: 'compare_periods',
      description: `Compares two time slices of the data: computes the aggregate value (sum or average) in each period and the absolute and percentage change between them.

Periods are defined by start and end dates. Use any date format that appears in the data (e.g. "2024-01-01", "01/01/2024", "20240101").

⚠️ Use this tool when the user asks:
- "This month's sales vs last month?"
- "Comparison of January vs February?"
- "Revenue this quarter vs the previous quarter?"
- "Did it grow or fall compared to period X?"
- Any comparison between two periods.`,
      schema: z.object({
        dateColumn: z.string().describe('Column with dates (e.g. "date", "month", "day")'),
        valueColumn: z.string().describe('Numeric column to compare (e.g. "revenue", "sales")'),
        period1Label: z.string().describe('Label for the first period (e.g. "January", "Last month")'),
        period1Start: z.string().describe('Start date of period 1 (e.g. "2024-01-01", "01/01/2024")'),
        period1End: z.string().describe('End date of period 1'),
        period2Label: z.string().describe('Label for the second period (e.g. "February", "This month")'),
        period2Start: z.string().describe('Start date of period 2'),
        period2End: z.string().describe('End date of period 2'),
        operation: z
          .enum(['sum', 'avg'])
          .optional()
          .describe('"sum" for total, "avg" for average (default: sum)'),
      }),
    },
  );
}

export function createTrendTool(tenantId: string) {
  return tool(
    async ({
      dateColumn,
      valueColumn,
      operation,
    }: {
      dateColumn: string;
      valueColumn: string;
      operation?: 'sum' | 'avg';
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'No data loaded. Upload a file first.';
      }

      const cols = getColumns(tenantId);
      for (const c of [dateColumn, valueColumn]) {
        if (!cols.includes(c)) {
          return `Column "${c}" not found. Available columns: ${cols.join(', ')}`;
        }
      }

      const op = operation ?? 'sum';

      // Group by the raw date value (ponytail: no complex date parsing)
      const periods = new Map<string, number[]>();
      for (const row of rows) {
        const period = String(row[dateColumn] ?? '(empty)').trim();
        const val = Number(row[valueColumn]);
        if (isNaN(val)) continue;
        if (!periods.has(period)) periods.set(period, []);
        periods.get(period)!.push(val);
      }

      // Sort periods: try numeric sort first (for YYYYMM, YYYY-MM, etc.), fallback to string
      const sorted = [...periods.keys()].sort((a, b) => {
        const aNum = a.replace(/[^0-9]/g, '');
        const bNum = b.replace(/[^0-9]/g, '');
        if (aNum && bNum && aNum.length === bNum.length) {
          return aNum.localeCompare(bNum);
        }
        return a.localeCompare(b);
      });

      const data = sorted.map((period, i) => {
        const nums = periods.get(period)!;
        const total = nums.reduce((s, v) => s + v, 0);
        const value = op === 'avg' ? total / nums.length : total;
        let growthPct: number | null = null;
        if (i > 0) {
          const prevNums = periods.get(sorted[i - 1])!;
          const prevTotal = prevNums.reduce((s, v) => s + v, 0);
          const prev = op === 'avg' ? prevTotal / prevNums.length : prevTotal;
          growthPct = prev !== 0 ? Math.round(((value - prev) / Math.abs(prev)) * 10000) / 100 : null;
        }
        return {
          period,
          value: Math.round(value * 100) / 100,
          count: nums.length,
          growthFromPrevious: growthPct,
        };
      });

      // Overall growth: first vs last
      const first = data[0]?.value ?? 0;
      const last = data[data.length - 1]?.value ?? 0;
      const totalGrowth = first !== 0 ? Math.round(((last - first) / Math.abs(first)) * 10000) / 100 : 0;

      return JSON.stringify({
        dateColumn,
        valueColumn,
        operation: op,
        totalPeriods: data.length,
        totalGrowthPercent: totalGrowth,
        data,
      });
    },
    {
      name: 'trend',
      description: `Computes the trend over time: groups by period (using the date column values as they appear in the data), computes the aggregate value per period, and calculates period-over-period growth and total growth (first vs last period).

⚠️ Use this tool when the user asks:
- "Are sales growing?"
- "What is the revenue/profit/cost trend?"
- "Month-over-month evolution?"
- "Is it improving or worsening over time?"
- Any question about time evolution.`,
      schema: z.object({
        dateColumn: z.string().describe('Column with periods (e.g. "date", "month", "year")'),
        valueColumn: z.string().describe('Numeric column to analyze the trend of (e.g. "revenue", "sales")'),
        operation: z
          .enum(['sum', 'avg'])
          .optional()
          .describe('"sum" for total, "avg" for average (default: sum)'),
      }),
    },
  );
}
