import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { getData, getColumns } from '@/lib/data/store';

export function createCountByGroupTool(tenantId: string) {
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

      // Build cross-tab: { col1value: { col2value: count } }
      const matrix = new Map<string, Map<string, number>>();
      const col2Totals = new Map<string, number>();

      for (const row of rows) {
        const v1 = String(row[column1] ?? '(empty)');
        const v2 = String(row[column2] ?? '(empty)');

        if (!matrix.has(v1)) matrix.set(v1, new Map());
        const inner = matrix.get(v1)!;
        inner.set(v2, (inner.get(v2) ?? 0) + 1);

        col2Totals.set(v2, (col2Totals.get(v2) ?? 0) + 1);
      }

      // Gather all unique col2 values (sorted by frequency desc), limit to top 15
      const allCol2 = [...col2Totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([v]) => v);

      // Build rows: one per col1 value
      const table = [...matrix.entries()]
        .map(([v1, inner]) => {
          let rowTotal = 0;
          const cells: Record<string, number> = {};
          for (const v2 of allCol2) {
            const count = inner.get(v2) ?? 0;
            cells[v2] = count;
            rowTotal += count;
          }
          return {
            [column1]: v1.length > 30 ? v1.slice(0, 30) + '…' : v1,
            total: rowTotal,
            ...cells,
          };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 20);

      // Column totals row
      const colTotalsRow: Record<string, string | number> = { [column1]: 'TOTAL' };
      let grandTotal = 0;
      for (const v2 of allCol2) {
        const t = col2Totals.get(v2) ?? 0;
        colTotalsRow[v2] = t;
        grandTotal += t;
      }
      colTotalsRow.total = grandTotal;

      return JSON.stringify({
        column1,
        column2,
        totalRows: rows.length,
        column2Values: allCol2.length,
        column2ValuesTruncated: col2Totals.size > 15,
        rows: table,
        totals: colTotalsRow,
      });
    },
    {
      name: 'count_by_group',
      description: `Cross-tabulation: counts the frequency of each combination between two categorical columns. Returns a matrix where each row is a value of column1 and each column is a value of column2, with totals.

⚠️ Use this tool when the user asks:
- "How many returns per category and per branch?"
- "What is the purchase profile by region and product?"
- "Cross-tabulation between status and sales channel?"
- "Distribution of X by Y?"
- Any question that crosses two categorical variables.`,
      schema: z.object({
        column1: z.string().describe('First categorical column (matrix rows)'),
        column2: z.string().describe('Second categorical column (matrix columns)'),
      }),
    },
  );
}

const DESCRIBE_OPS = ['sum', 'avg', 'count', 'min', 'max', 'median'] as const;

export function createDescribeConditionalTool(tenantId: string) {
  return tool(
    async ({
      targetColumn,
      conditionColumn,
      conditionValue,
      operations,
    }: {
      targetColumn: string;
      conditionColumn: string;
      conditionValue: string;
      operations: (typeof DESCRIBE_OPS)[number][];
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'No data loaded. Upload a file first.';
      }

      const cols = getColumns(tenantId);
      for (const c of [targetColumn, conditionColumn]) {
        if (!cols.includes(c)) {
          return `Column "${c}" not found. Available columns: ${cols.join(', ')}`;
        }
      }

      // Filter rows where conditionColumn == conditionValue, collect targetColumn numeric values
      const nums: number[] = [];
      for (const row of rows) {
        const cond = String(row[conditionColumn] ?? '');
        if (cond !== conditionValue) continue;
        const val = Number(row[targetColumn]);
        if (!isNaN(val)) nums.push(val);
      }

      if (nums.length === 0) {
        return `No rows found with ${conditionColumn}="${conditionValue}" that have numeric values in "${targetColumn}".`;
      }

      const stats: Record<string, number> = {};
      for (const op of operations) {
        let result: number;
        switch (op) {
          case 'sum':
            result = nums.reduce((a, b) => a + b, 0);
            break;
          case 'avg':
            result = nums.reduce((a, b) => a + b, 0) / nums.length;
            break;
          case 'count':
            result = nums.length;
            break;
          case 'min':
            result = Math.min(...nums);
            break;
          case 'max':
            result = Math.max(...nums);
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
        stats[op] = Math.round(result * 100) / 100;
      }

      return JSON.stringify({
        filter: `${conditionColumn}="${conditionValue}"`,
        targetColumn,
        matchedRows: nums.length,
        totalRows: rows.length,
        matchPercent: Math.round((nums.length / rows.length) * 10000) / 100,
        stats,
      });
    },
    {
      name: 'describe_conditional',
      description: `Computes statistics (sum, average, count, min, max, median) of a numeric column, but ONLY for the rows where another column meets a specific condition.

It is like a filter + aggregate in a single call — faster and more economical.

⚠️ Use this tool when the user asks:
- "What is the total/average of returns?"
- "How much was sold only from category X products?"
- "Average ticket for customers from SP only?"
- "Maximum sale value only in the online channel?"
- Any numeric statistic filtered by a condition.`,
      schema: z.object({
        targetColumn: z
          .string()
          .describe('Numeric column to compute statistics for (e.g. "total", "revenue")'),
        conditionColumn: z
          .string()
          .describe('Column to apply the condition to (e.g. "status", "category")'),
        conditionValue: z
          .string()
          .describe('Exact value of the condition (e.g. "Returned", "Electronics")'),
        operations: z
          .array(z.enum(DESCRIBE_OPS))
          .describe('List of operations: sum, avg, count, min, max, median'),
      }),
    },
  );
}

const PIVOT_OPS = ['sum', 'avg', 'count'] as const;

export function createPivotTool(tenantId: string) {
  return tool(
    async ({
      rowColumn,
      columnColumn,
      valueColumn,
      operation,
    }: {
      rowColumn: string;
      columnColumn: string;
      valueColumn: string;
      operation: (typeof PIVOT_OPS)[number];
    }) => {
      const rows = getData(tenantId);
      if (!rows?.length) return 'No data loaded.';

      const cols = getColumns(tenantId);
      for (const c of [rowColumn, columnColumn, valueColumn]) {
        if (!cols.includes(c)) {
          return `Column "${c}" not found. Available: ${cols.join(', ')}`;
        }
      }

      // Build: { rowValue: { colValue: number[] } }
      const matrix = new Map<string, Map<string, number[]>>();
      const allColValues = new Set<string>();

      for (const row of rows) {
        const rv = String(row[rowColumn] ?? '(empty)');
        const cv = String(row[columnColumn] ?? '(empty)');
        const val = Number(row[valueColumn]);
        if (isNaN(val)) continue;

        allColValues.add(cv);
        if (!matrix.has(rv)) matrix.set(rv, new Map());
        const inner = matrix.get(rv)!;
        if (!inner.has(cv)) inner.set(cv, []);
        inner.get(cv)!.push(val);
      }

      // Sort column values for consistency
      const colValues = [...allColValues].sort();

      // Compute operation per cell, produce pivot rows
      const data = [...matrix.entries()]
        .map(([rv, inner]) => {
          const out: Record<string, unknown> = { [rowColumn]: rv };
          for (const cv of colValues) {
            const nums = inner.get(cv) ?? [];
            let result: number;
            switch (operation) {
              case 'sum':
                result = nums.reduce((a, b) => a + b, 0);
                break;
              case 'avg':
                result = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
                break;
              case 'count':
                result = nums.length;
                break;
            }
            out[cv] = Math.round(result * 100) / 100;
          }
          return out;
        })
        .slice(0, 30); // ponytail: cap rows

      return JSON.stringify({
        pivot: `${rowColumn} × ${columnColumn}`,
        operation,
        rowColumn,
        columnColumn,
        valueColumn,
        columns: colValues.slice(0, 15),
        columnsTruncated: colValues.length > 15,
        data,
        _hint: 'Use plot with chartType="bar", xKey=<rowColumn>, yKeys=<columns>, stacked=false for grouped bars. Use stacked=true for stacked bars.',
      });
    },
    {
      name: 'pivot',
      description: `Pivot table: crosses two categorical columns and aggregates a third numeric column. The result is perfect for grouped or stacked bar charts.

Example: pivot(rowColumn="date", columnColumn="category", valueColumn="revenue", operation="sum")
→ Returns data in the format: [{date: "2024-01", Electronics: 45000, Furniture: 32000}, ...]

⚠️ Use this tool when the user asks:
- "Sales by category grouped by month/date/region?"
- "Comparison of X by Y over time?"
- "Cross-tabulation of..."
- "I want to see the value by category, broken down by branch/date/salesperson"
- Before generating grouped bar charts: FIRST call pivot, THEN call plot with the returned data.`,
      schema: z.object({
        rowColumn: z
          .string()
          .describe('Column for the table ROWS — usually the temporal dimension (e.g. "date", "month") or main grouping (e.g. "branch")'),
        columnColumn: z
          .string()
          .describe('Column for the table COLUMNS — the categories that become series in the chart (e.g. "category", "product", "salesperson")'),
        valueColumn: z
          .string()
          .describe('Numeric column to aggregate (e.g. "total", "revenue", "quantity")'),
        operation: z
          .enum(PIVOT_OPS)
          .describe('Operation: sum (total), avg (average), count (count)'),
      }),
    },
  );
}
