import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { getData, getColumns } from '@/lib/data/store';

const OPS = ['sum', 'avg', 'min', 'max', 'count', 'median', 'stddev'] as const;
type Op = (typeof OPS)[number];

function toNumbers(rows: Record<string, unknown>[], col: string): number[] {
  return rows
    .map((r) => Number(r[col]))
    .filter((n) => !isNaN(n));
}

function compute(nums: number[], op: Op): number {
  switch (op) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0);
    case 'avg':
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    case 'min':
      return nums.length ? Math.min(...nums) : 0;
    case 'max':
      return nums.length ? Math.max(...nums) : 0;
    case 'count':
      return nums.length;
    case 'median': {
      if (!nums.length) return 0;
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }
    case 'stddev': {
      if (nums.length < 2) return 0;
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance =
        nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1);
      return Math.sqrt(variance);
    }
  }
}

export function createAggregateTool(tenantId: string) {
  return tool(
    async ({ column, operation }: { column: string; operation: Op }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'No data loaded. Upload a file first.';
      }

      const cols = getColumns(tenantId);
      if (!cols.includes(column)) {
        return `Column "${column}" not found. Available columns: ${cols.join(', ')}`;
      }

      const nums = toNumbers(rows, column);

      if (nums.length === 0) {
        return `Column "${column}" contains no numeric values (${rows.length} rows analyzed).`;
      }

      const result = compute(nums, operation);
      const rounded = Number.isInteger(result) ? result : Math.round(result * 100) / 100;

      return JSON.stringify({
        operation,
        column,
        result: rounded,
        numericCount: nums.length,
        totalRows: rows.length,
        nonNumeric: rows.length - nums.length,
      });
    },
    {
      name: 'aggregate',
      description: `Executes an aggregation operation on a numeric column of the loaded data.

⚠️ Use this tool for ANY question about: sum, total, average, mean ticket, minimum, maximum, median, standard deviation, count, highest value, lowest value, revenue, cost, quantity... IN SHORT, ANY question that involves a number derived from the data.

Available operations: sum (total), avg (average), min, max, count (count of numeric values), median, stddev (standard deviation).

NEVER invent or estimate values. ALWAYS call this tool.`,
      schema: z.object({
        column: z
          .string()
          .describe('Name of the numeric column to aggregate'),
        operation: z
          .enum(OPS)
          .describe(
            'Operation: sum (total), avg (average), min (minimum), max (maximum), count (how many numeric values), median, stddev (standard deviation)',
          ),
      }),
    },
  );
}
