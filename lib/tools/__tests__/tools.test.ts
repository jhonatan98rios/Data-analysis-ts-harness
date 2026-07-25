import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { parseAndStore } from '@/lib/data/store';

const FIXTURE_CSV = `data,categoria,Vl_Total,quantidade,filial,vendedor,Status,canal
2024-01-15,Eletrônicos,1500.00,2,SP,Ana,Aprovado,Online
2024-01-20,Eletrônicos,800.00,1,SP,Carlos,Aprovado,Loja
2024-01-25,Móveis,3200.00,3,RJ,Ana,Aprovado,Loja
2024-02-01,Móveis,450.00,1,SP,Carlos,Devolvida,Online
2024-02-10,Roupas,200.00,4,RJ,Ana,Aprovado,Online
2024-02-15,Roupas,150.00,2,RJ,Carlos,Aprovado,Loja
2024-02-20,Eletrônicos,2200.00,1,SP,Ana,Aprovado,Loja
2024-03-01,Eletrônicos,900.00,2,RJ,Carlos,Aprovado,Online
2024-03-10,Móveis,1800.00,2,SP,Ana,Aprovado,Loja
2024-03-15,Roupas,350.00,3,RJ,Ana,Aprovado,Online`;

const TENANT = 'test-tenant';

function p(raw: string): Record<string, unknown> {
  return JSON.parse(raw);
}

beforeEach(() => {
  parseAndStore(TENANT, [
    { name: 'fixture.csv', type: 'text/csv', size: 1000, data: Buffer.from(FIXTURE_CSV).toString('base64') },
  ]);
});

// ─── Profile ────────────────────────────────────────────

describe('data_profile', () => {
  it('profiles all columns', async () => {
    const { createProfileTool } = await import('@/lib/tools/profile');
    const t = createProfileTool(TENANT);
    const raw = await t.invoke({});
    const r = p(raw as string);

    assert.strictEqual(r.rowCount, 10);
    const cols = r.columns as { name: string; type: string; nulls: number }[];
    assert.ok(cols.length >= 7);
    const cat = cols.find((c) => c.name === 'categoria');
    assert.ok(cat);
    assert.strictEqual(cat!.type, 'categorical');
    assert.strictEqual(cat!.nullCount, 0);

    const vl = cols.find((c) => c.name === 'Vl_Total');
    assert.ok(vl);
    assert.strictEqual(vl!.type, 'numeric');
    // @ts-expect-error dynamic
    assert.strictEqual(vl.min, 150);
    // @ts-expect-error dynamic
    assert.strictEqual(vl.max, 3200);
  });
});

// ─── Aggregate ──────────────────────────────────────────

describe('aggregate', () => {
  it('computes sum', async () => {
    const { createAggregateTool } = await import('@/lib/tools/aggregate');
    const t = createAggregateTool(TENANT);
    const r = p(await t.invoke({ column: 'Vl_Total', operation: 'sum' }) as string);
    assert.strictEqual(r.result, 11550);
  });

  it('computes avg', async () => {
    const { createAggregateTool } = await import('@/lib/tools/aggregate');
    const t = createAggregateTool(TENANT);
    const r = p(await t.invoke({ column: 'Vl_Total', operation: 'avg' }) as string);
    assert.strictEqual(r.result, 1155);
  });

  it('computes min/max', async () => {
    const { createAggregateTool } = await import('@/lib/tools/aggregate');
    const t = createAggregateTool(TENANT);
    assert.strictEqual(p(await t.invoke({ column: 'Vl_Total', operation: 'min' }) as string).result, 150);
    assert.strictEqual(p(await t.invoke({ column: 'Vl_Total', operation: 'max' }) as string).result, 3200);
  });

  it('computes count', async () => {
    const { createAggregateTool } = await import('@/lib/tools/aggregate');
    const t = createAggregateTool(TENANT);
    assert.strictEqual(p(await t.invoke({ column: 'Vl_Total', operation: 'count' }) as string).result, 10);
  });

  it('computes median', async () => {
    const { createAggregateTool } = await import('@/lib/tools/aggregate');
    const t = createAggregateTool(TENANT);
    assert.strictEqual(p(await t.invoke({ column: 'Vl_Total', operation: 'median' }) as string).result, 850);
  });

  it('rejects missing column (returns plain text)', async () => {
    const { createAggregateTool } = await import('@/lib/tools/aggregate');
    const t = createAggregateTool(TENANT);
    const raw = await t.invoke({ column: 'nonexistent', operation: 'sum' }) as string;
    assert.ok(raw.includes('não encontrada'));
  });
});

// ─── Grouping ───────────────────────────────────────────

describe('value_counts', () => {
  it('counts frequencies', async () => {
    const { createValueCountsTool } = await import('@/lib/tools/grouping');
    const t = createValueCountsTool(TENANT);
    const r = p(await t.invoke({ column: 'categoria' }) as string);

    assert.strictEqual(r.column, 'categoria');
    const vals = r.values as { value: string; count: number; percent: number }[];
    assert.strictEqual(vals.length, 3);
    const eletro = vals.find((v) => v.value === 'Eletrônicos');
    assert.ok(eletro);
    assert.strictEqual(eletro!.count, 4);
  });
});

describe('group_by', () => {
  it('groups and sums', async () => {
    const { createGroupByTool } = await import('@/lib/tools/grouping');
    const t = createGroupByTool(TENANT);
    const r = p(await t.invoke({ groupColumn: 'categoria', valueColumn: 'Vl_Total', operation: 'sum' }) as string);

    const groups = r.groups as Record<string, unknown>[];
    assert.strictEqual(groups.length, 3);
    const eletro = groups.find((g) => g.categoria === 'Eletrônicos');
    assert.ok(eletro);
    assert.strictEqual(eletro!.sum, 5400);
  });

  it('groups and averages', async () => {
    const { createGroupByTool } = await import('@/lib/tools/grouping');
    const t = createGroupByTool(TENANT);
    const r = p(await t.invoke({ groupColumn: 'categoria', valueColumn: 'Vl_Total', operation: 'avg' }) as string);
    const eletro = (r.groups as Record<string, unknown>[]).find((g) => g.categoria === 'Eletrônicos');
    assert.strictEqual(eletro!.avg, 1350);
  });
});

// ─── Ranking ────────────────────────────────────────────

describe('top_n', () => {
  it('returns top 3', async () => {
    const { createTopNTool } = await import('@/lib/tools/ranking');
    const t = createTopNTool(TENANT);
    const r = p(await t.invoke({ column: 'Vl_Total', n: 3, direction: 'top' }) as string);
    const rows = r.rows as Record<string, unknown>[];
    assert.strictEqual(rows.length, 3);
    assert.strictEqual(Number(rows[0].Vl_Total), 3200);
    assert.strictEqual(Number(rows[1].Vl_Total), 2200);
    assert.strictEqual(Number(rows[2].Vl_Total), 1800);
  });

  it('returns bottom 2', async () => {
    const { createTopNTool } = await import('@/lib/tools/ranking');
    const t = createTopNTool(TENANT);
    const r = p(await t.invoke({ column: 'Vl_Total', n: 2, direction: 'bottom' }) as string);
    const rows = r.rows as Record<string, unknown>[];
    assert.strictEqual(Number(rows[0].Vl_Total), 150);
    assert.strictEqual(Number(rows[1].Vl_Total), 200);
  });
});

describe('filter', () => {
  it('filters by equals', async () => {
    const { createFilterTool } = await import('@/lib/tools/ranking');
    const t = createFilterTool(TENANT);
    const r = p(await t.invoke({ column: 'Status', operator: 'equals', value: 'Devolvida' }) as string);
    assert.strictEqual(r.matchCount, 1);
    const sample = r.sample as Record<string, unknown>[];
    assert.strictEqual(sample[0].categoria, 'Móveis');
  });

  it('filters by greater_than', async () => {
    const { createFilterTool } = await import('@/lib/tools/ranking');
    const t = createFilterTool(TENANT);
    const r = p(await t.invoke({ column: 'Vl_Total', operator: 'greater_than', value: '2000' }) as string);
    assert.strictEqual(r.matchCount, 2);
  });
});

describe('pareto', () => {
  it('computes 80/20', async () => {
    const { createParetoTool } = await import('@/lib/tools/ranking');
    const t = createParetoTool(TENANT);
    const r = p(await t.invoke({ categoryColumn: 'categoria', valueColumn: 'Vl_Total' }) as string);
    assert.strictEqual(r.grandTotal, 11550);
    const items = r.items as Record<string, unknown>[];
    assert.strictEqual(items.length, 3);
    assert.ok((items[0].cumulativePercent as number) <= 100);
  });
});

// ─── Timeseries ─────────────────────────────────────────

describe('trend', () => {
  it('period-over-period growth', async () => {
    const { createTrendTool } = await import('@/lib/tools/timeseries');
    const t = createTrendTool(TENANT);
    const r = p(await t.invoke({ dateColumn: 'data', valueColumn: 'Vl_Total', operation: 'sum' }) as string);

    const data = r.data as Record<string, unknown>[];
    assert.ok(data.length > 0);
    // trend groups by exact date value; 2024-01-15 = 1500 (single row)
    const first = data[0] as Record<string, unknown>;
    assert.ok(first);
    assert.strictEqual(first.value, 1500);
  });
});

describe('compare_periods', () => {
  it('compares two periods', async () => {
    const { createComparePeriodsTool } = await import('@/lib/tools/timeseries');
    const t = createComparePeriodsTool(TENANT);
    const r = p(await t.invoke({
      dateColumn: 'data',
      valueColumn: 'Vl_Total',
      period1Start: '2024-01-01',
      period1End: '2024-01-31',
      period2Start: '2024-02-01',
      period2End: '2024-02-28',
      period1Label: 'Janeiro',
      period2Label: 'Fevereiro',
      operation: 'sum',
    }) as string);
    assert.ok(r.period1);
    assert.ok(r.period2);
    assert.ok(typeof r.change.percent === 'number');
  });
});

// ─── Relation ───────────────────────────────────────────

describe('correlation', () => {
  it('computes Pearson r', async () => {
    const { createCorrelationTool } = await import('@/lib/tools/relation');
    const t = createCorrelationTool(TENANT);
    const r = p(await t.invoke({ column1: 'Vl_Total', column2: 'quantidade' }) as string);
    assert.strictEqual(typeof r.pearsonR, 'number');
    assert.ok((r.pearsonR as number) > -1.1 && (r.pearsonR as number) < 1.1);
    assert.strictEqual(typeof r.interpretation, 'string');
  });
});

describe('ratio', () => {
  it('computes ratio stats', async () => {
    const { createRatioTool } = await import('@/lib/tools/relation');
    const t = createRatioTool(TENANT);
    const r = p(await t.invoke({ numerator: 'Vl_Total', denominator: 'quantidade' }) as string);
    assert.strictEqual(typeof r.avg, 'number');
    assert.ok((r.validPairs as number) > 0);
  });
});

// ─── Advanced ───────────────────────────────────────────

describe('count_by_group', () => {
  it('cross-tabulation', async () => {
    const { createCountByGroupTool } = await import('@/lib/tools/advanced');
    const t = createCountByGroupTool(TENANT);
    const r = p(await t.invoke({ column1: 'categoria', column2: 'Status' }) as string);
    assert.ok(r.rows);
    const totals = r.totals as Record<string, unknown>;
    // totals row has column1 set to 'TOTAL'
    assert.strictEqual(totals.categoria, 'TOTAL');
  });
});

describe('describe_conditional', () => {
  it('aggregates with condition', async () => {
    const { createDescribeConditionalTool } = await import('@/lib/tools/advanced');
    const t = createDescribeConditionalTool(TENANT);
    const r = p(await t.invoke({
      targetColumn: 'Vl_Total',
      conditionColumn: 'canal',
      conditionValue: 'Online',
      operations: ['sum', 'avg', 'count'],
    }) as string);
    assert.strictEqual(r.matchedRows, 5);
    const stats = r.stats as Record<string, number>;
    assert.strictEqual(stats.sum, 3400);
    assert.strictEqual(stats.avg, 680);
    assert.strictEqual(stats.count, 5);
  });
});

describe('pivot', () => {
  it('pivots two dims with sum', async () => {
    const { createPivotTool } = await import('@/lib/tools/advanced');
    const t = createPivotTool(TENANT);
    const r = p(await t.invoke({
      rowColumn: 'filial', columnColumn: 'categoria', valueColumn: 'Vl_Total', operation: 'sum',
    }) as string);

    const cols = r.columns as string[];
    assert.ok(cols.includes('Eletrônicos'));
    const data = r.data as Record<string, unknown>[];
    assert.strictEqual(data.length, 2);
    const sp = data.find((d) => d.filial === 'SP') as Record<string, number>;
    assert.strictEqual(sp.Eletrônicos, 4500);
    assert.strictEqual(sp.Móveis, 2250);
  });

  it('pivots with avg', async () => {
    const { createPivotTool } = await import('@/lib/tools/advanced');
    const t = createPivotTool(TENANT);
    const r = p(await t.invoke({
      rowColumn: 'filial', columnColumn: 'categoria', valueColumn: 'Vl_Total', operation: 'avg',
    }) as string);
    const sp = (r.data as Record<string, unknown>[]).find((d) => d.filial === 'SP') as Record<string, number>;
    assert.strictEqual(sp.Eletrônicos, 1500);
  });
});

// ─── Plot ───────────────────────────────────────────────

describe('plot', () => {
  it('validates and returns chart spec', async () => {
    const { createPlotTool } = await import('@/lib/tools/plot');
    const t = createPlotTool();
    const r = p(await t.invoke({
      chartType: 'bar', title: 'Test', xKey: 'categoria', yKey: 'sum',
      data: [{ categoria: 'Eletrônicos', sum: 5400 }, { categoria: 'Móveis', sum: 5450 }],
    }) as string);

    const chart = r.chart as Record<string, unknown>;
    assert.strictEqual(chart.chartType, 'bar');
    assert.strictEqual((chart.data as unknown[]).length, 2);
    assert.ok((r.summary as string).includes('📊'));
  });

  it('rejects invalid keys', async () => {
    const { createPlotTool } = await import('@/lib/tools/plot');
    const t = createPlotTool();
    const r = p(await t.invoke({
      chartType: 'bar', title: 'Bad', xKey: 'nonexistent', yKey: 'wrong',
      data: [{ x: 1, y: 2 }],
    }) as string);
    assert.strictEqual(r.chart, null);
    assert.ok((r.summary as string).includes('❌'));
  });

  it('rejects empty data', async () => {
    const { createPlotTool } = await import('@/lib/tools/plot');
    const t = createPlotTool();
    const r = p(await t.invoke({ chartType: 'bar', title: 'E', xKey: 'x', yKey: 'y', data: [] }) as string);
    assert.strictEqual(r.chart, null);
  });

  it('dual_axis with lineYKey', async () => {
    const { createPlotTool } = await import('@/lib/tools/plot');
    const t = createPlotTool();
    const r = p(await t.invoke({
      chartType: 'dual_axis', title: 'D', xKey: 'm', yKey: 'r', lineYKey: 'c',
      data: [{ m: 'Jan', r: 1000, c: 10 }],
    }) as string);
    assert.ok(r.chart);
    assert.ok((r.summary as string).includes('eixo duplo'));
  });

  it('stacked bar', async () => {
    const { createPlotTool } = await import('@/lib/tools/plot');
    const t = createPlotTool();
    const r = p(await t.invoke({
      chartType: 'bar', title: 'S', xKey: 'm', yKey: 'r', yKeys: ['r', 'c'], stacked: true,
      data: [{ m: 'Jan', r: 1000, c: 600 }],
    }) as string);
    assert.strictEqual((r.chart as Record<string, unknown>).stacked, true);
  });

  it('donut', async () => {
    const { createPlotTool } = await import('@/lib/tools/plot');
    const t = createPlotTool();
    const r = p(await t.invoke({
      chartType: 'pie', title: 'D', xKey: 'c', yKey: 'v', donut: true,
      data: [{ c: 'A', v: 60 }, { c: 'B', v: 40 }],
    }) as string);
    assert.ok((r.summary as string).includes('rosca'));
  });

  it('horizontal bar', async () => {
    const { createPlotTool } = await import('@/lib/tools/plot');
    const t = createPlotTool();
    const r = p(await t.invoke({
      chartType: 'bar', title: 'H', xKey: 'c', yKey: 'v', horizontal: true,
      data: [{ c: 'Long', v: 100 }],
    }) as string);
    assert.strictEqual((r.chart as Record<string, unknown>).horizontal, true);
  });
});
