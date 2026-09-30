import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { getData, getColumns } from '@/lib/data/store';

export function createValueCountsTool(tenantId: string) {
  return tool(
    async ({ column, limit }: { column: string; limit?: number }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'No data loaded. Upload a file first.';
      }

      const cols = getColumns(tenantId);
      if (!cols.includes(column)) {
        return `Column "${column}" not found. Available columns: ${cols.join(', ')}`;
      }

      const freq = new Map<string, number>();
      let nulls = 0;
      for (const row of rows) {
        const v = row[column];
        if (v === null || v === undefined || v === '') {
          nulls++;
        } else {
          freq.set(String(v), (freq.get(String(v)) ?? 0) + 1);
        }
      }

      const total = rows.length;
      const sorted = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit ?? 20)
        .map(([value, count]) => ({
          value: value.length > 50 ? value.slice(0, 50) + '…' : value,
          count,
          percent: Math.round((count / total) * 10000) / 100,
        }));

      return JSON.stringify({
        column,
        uniqueValues: freq.size,
        nullCount: nulls,
        nullPercent: Math.round((nulls / total) * 10000) / 100,
        values: sorted,
      });
    },
    {
      name: 'value_counts',
      description: `Counts the frequency of each distinct value in a categorical column, ordered from most to least frequent, with percentages.

⚠️ Use this tool when the user asks:
- "What are the most frequent products/categories/customers/regions?"
- "What is the distribution of X?"
- "How many orders per status/channel/salesperson?"
- Any question about ranking or counting categories.`,
      schema: z.object({
        column: z.string().describe('Name of the categorical column to count frequencies for'),
        limit: z
          .number()
          .optional()
          .describe('Maximum number of values to return (default: 20)'),
      }),
    },
  );
}

const GROUP_OPS = ['sum', 'avg', 'min', 'max', 'count', 'median'] as const;

export function createGroupByTool(tenantId: string) {
  return tool(
    async ({
      groupColumn,
      valueColumn,
      operation,
      limit,
    }: {
      groupColumn: string;
      valueColumn: string;
      operation: (typeof GROUP_OPS)[number];
      limit?: number;
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'No data loaded. Upload a file first.';
      }

      const cols = getColumns(tenantId);
      for (const c of [groupColumn, valueColumn]) {
        if (!cols.includes(c)) {
          return `Column "${c}" not found. Available columns: ${cols.join(', ')}`;
        }
      }

      // Build groups
      const groups = new Map<string, number[]>();
      for (const row of rows) {
        const key = String(row[groupColumn] ?? '(empty)');
        const val = Number(row[valueColumn]);
        if (isNaN(val)) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(val);
      }

      // Compute operation per group
      const results = [...groups.entries()]
        .map(([key, nums]) => {
          let result: number;
          switch (operation) {
            case 'sum':
              result = nums.reduce((a, b) => a + b, 0);
              break;
            case 'avg':
              result = nums.reduce((a, b) => a + b, 0) / nums.length;
              break;
            case 'min':
              result = Math.min(...nums);
              break;
            case 'max':
              result = Math.max(...nums);
              break;
            case 'count':
              result = nums.length;
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
          return {
            [groupColumn]: key.length > 40 ? key.slice(0, 40) + '…' : key,
            [operation]: Math.round(result * 100) / 100,
            count: nums.length,
          };
        })
        .sort((a, b) => (b[operation] as number) - (a[operation] as number))
        .slice(0, limit ?? 20);

      return JSON.stringify({
        groupColumn,
        valueColumn,
        operation,
        totalGroups: groups.size,
        groups: results,
      });
    },
    {
      name: 'group_by',
      description: `Groups the data by a column and computes an operation (sum, average, minimum, maximum, count, median) on another column for each group. Ordered by descending result.

⚠️ Use this tool when the user asks:
- "Revenue/profit by category/product/region/salesperson?"
- "Average ticket per customer?"
- "Total sales grouped by month/branch/channel?"
- Any "X by Y" or "X grouped by Y" question.`,
      schema: z.object({
        groupColumn: z
          .string()
          .describe('Column to group by (e.g. "category", "region", "salesperson")'),
        valueColumn: z
          .string()
          .describe('Numeric column to aggregate (e.g. "revenue", "quantity")'),
        operation: z
          .enum(GROUP_OPS)
          .describe('Operation: sum, avg, min, max, count, median'),
        limit: z.number().optional().describe('Maximum number of groups to return (default: 20)'),
      }),
    },
  );
}
