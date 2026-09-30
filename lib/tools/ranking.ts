import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { getData, getColumns } from '@/lib/data/store';

export function createTopNTool(tenantId: string) {
  return tool(
    async ({
      column,
      n,
      direction,
    }: {
      column: string;
      n?: number;
      direction?: 'top' | 'bottom';
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'No data loaded. Upload a file first.';
      }

      const cols = getColumns(tenantId);
      if (!cols.includes(column)) {
        return `Column "${column}" not found. Available columns: ${cols.join(', ')}`;
      }

      const dir = direction ?? 'top';
      const limit = n ?? 10;

      // Extract numeric values with row context
      const indexed = rows
        .map((row, i) => ({ idx: i, val: Number(row[column]), row }))
        .filter((x) => !isNaN(x.val));

      if (indexed.length === 0) {
        return `Column "${column}" contains no numeric values.`;
      }

      indexed.sort((a, b) => (dir === 'top' ? b.val - a.val : a.val - b.val));
      const top = indexed.slice(0, limit);

      // Include all columns in the result for context
      const resultRows = top.map((x, rank) => {
        const out: Record<string, unknown> = { _rank: dir === 'top' ? rank + 1 : rows.length - rank };
        for (const col of cols) {
          out[col] = x.row[col];
        }
        return out;
      });

      const total = indexed.reduce((sum, x) => sum + x.val, 0);
      const topTotal = top.reduce((sum, x) => sum + x.val, 0);

      return JSON.stringify({
        column,
        direction: dir,
        topN: limit,
        topShare: Math.round((topTotal / (total || 1)) * 10000) / 100,
        rows: resultRows,
      });
    },
    {
      name: 'top_n',
      description: `Returns the N largest (or smallest) values of a column, with the full rows for context. Includes the share (%) of the total that these top N represent.

⚠️ Use this tool when the user asks:
- "Top 10 customers/products/salespeople by revenue/sales?"
- "What are the largest/smallest X?"
- "Who are my best/worst customers?"
- Any ranking question.`,
      schema: z.object({
        column: z.string().describe('Numeric column to sort by'),
        n: z.number().optional().describe('How many items to return (default: 10)'),
        direction: z
          .enum(['top', 'bottom'])
          .optional()
          .describe('"top" for largest, "bottom" for smallest (default: top)'),
      }),
    },
  );
}

const FILTER_OPS = ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_equal', 'less_equal', 'contains'] as const;

export function createFilterTool(tenantId: string) {
  return tool(
    async ({
      column,
      operator,
      value,
    }: {
      column: string;
      operator: (typeof FILTER_OPS)[number];
      value: string;
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'No data loaded. Upload a file first.';
      }

      const cols = getColumns(tenantId);
      if (!cols.includes(column)) {
        return `Column "${column}" not found. Available columns: ${cols.join(', ')}`;
      }

      const matches: Record<string, unknown>[] = [];

      for (const row of rows) {
        const cell = String(row[column] ?? '');
        const cellNum = Number(cell);
        const valNum = Number(value);
        const useNumeric = !isNaN(cellNum) && !isNaN(valNum);

        let match = false;
        switch (operator) {
          case 'equals':
            match = useNumeric ? cellNum === valNum : cell.toLowerCase() === value.toLowerCase();
            break;
          case 'not_equals':
            match = useNumeric ? cellNum !== valNum : cell.toLowerCase() !== value.toLowerCase();
            break;
          case 'greater_than':
            match = useNumeric && cellNum > valNum;
            break;
          case 'less_than':
            match = useNumeric && cellNum < valNum;
            break;
          case 'greater_equal':
            match = useNumeric && cellNum >= valNum;
            break;
          case 'less_equal':
            match = useNumeric && cellNum <= valNum;
            break;
          case 'contains':
            match = cell.toLowerCase().includes(value.toLowerCase());
            break;
        }
        if (match) matches.push(row);
      }

      // Show first 10 matches
      const sample = matches.slice(0, 10).map((row) => {
        const out: Record<string, unknown> = {};
        for (const col of cols) out[col] = row[col];
        return out;
      });

      return JSON.stringify({
        filter: `${column} ${operator} "${value}"`,
        matchCount: matches.length,
        totalRows: rows.length,
        matchPercent: Math.round((matches.length / rows.length) * 10000) / 100,
        sample,
        sampleTruncated: matches.length > 10,
      });
    },
    {
      name: 'filter',
      description: `Filters the data rows by a condition on a column. Returns how many rows match and a sample of up to 10 results.

Available operators:
- equals / not_equals: exact comparison (text or number)
- greater_than / less_than / greater_equal / less_equal: numeric comparison
- contains: the text contains the value (case-insensitive)

⚠️ Use this tool when the user asks:
- "Which sales were canceled?"
- "Customers who bought more than $1000?"
- "Orders from the state of SP?"
- "How much does X% of the total represent?" (combine with the count from the result)
- Any question with a filter or segmentation.`,
      schema: z.object({
        column: z.string().describe('Column to apply the filter to'),
        operator: z
          .enum(FILTER_OPS)
          .describe('Operator: equals, not_equals, greater_than, less_than, greater_equal, less_equal, contains'),
        value: z.string().describe('Value to compare against'),
      }),
    },
  );
}

export function createParetoTool(tenantId: string) {
  return tool(
    async ({
      categoryColumn,
      valueColumn,
    }: {
      categoryColumn: string;
      valueColumn: string;
    }) => {
      const rows = getData(tenantId);
      if (!rows || rows.length === 0) {
        return 'No data loaded. Upload a file first.';
      }

      const cols = getColumns(tenantId);
      for (const c of [categoryColumn, valueColumn]) {
        if (!cols.includes(c)) {
          return `Column "${c}" not found. Available columns: ${cols.join(', ')}`;
        }
      }

      // Sum values by category
      const groupSums = new Map<string, number>();
      for (const row of rows) {
        const key = String(row[categoryColumn] ?? '(empty)');
        const val = Number(row[valueColumn]);
        if (isNaN(val)) continue;
        groupSums.set(key, (groupSums.get(key) ?? 0) + val);
      }

      const sorted = [...groupSums.entries()].sort((a, b) => b[1] - a[1]);
      const grandTotal = sorted.reduce((sum, [, v]) => sum + v, 0);

      let cumulative = 0;
      let cutoff = -1;
      const items = sorted.map(([name, total], i) => {
        cumulative += total;
        const cumPct = Math.round((cumulative / grandTotal) * 10000) / 100;
        if (cutoff === -1 && cumPct >= 80) cutoff = i + 1;
        return {
          rank: i + 1,
          [categoryColumn]: name.length > 40 ? name.slice(0, 40) + '…' : name,
          total: Math.round(total * 100) / 100,
          percent: Math.round((total / grandTotal) * 10000) / 100,
          cumulativePercent: cumPct,
        };
      });

      return JSON.stringify({
        categoryColumn,
        valueColumn,
        totalCategories: items.length,
        grandTotal: Math.round(grandTotal * 100) / 100,
        pareto80Cutoff: cutoff,
        pareto80Percent: items.length > 0
          ? Math.round((cutoff / items.length) * 10000) / 100
          : 0,
        items: items.slice(0, 30), // top 30 for readability
      });
    },
    {
      name: 'pareto',
      description: `Pareto analysis (80/20): computes each category's contribution to the total and the cumulative contribution. Identifies how many categories account for 80% of the total.

⚠️ Use this tool when the user asks:
- "Which products/categories contribute most to revenue?"
- "Where should I focus my efforts?"
- "80/20 analysis of my data."
- "Which customers account for most of the revenue?"
- Any question about concentration or contribution distribution.`,
      schema: z.object({
        categoryColumn: z
          .string()
          .describe('Category column (e.g. "product", "customer", "region")'),
        valueColumn: z
          .string()
          .describe('Numeric column to sum (e.g. "revenue", "profit", "cost")'),
      }),
    },
  );
}
