'use client';

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { ChartSpec } from '@/lib/tools/plot';

const COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#0891b2', '#db2777', '#ea580c', '#4f46e5', '#65a30d',
];

function truncate(v: string, max = 20): string {
  return v.length > max ? v.slice(0, max) + '\u2026' : v;
}

function Histogram({ spec }: { spec: ChartSpec }) {
  const yKey = spec.yKey;
  const values = spec.data.map((d) => Number(d[yKey])).filter((v) => !isNaN(v));
  if (values.length === 0) return <p className="text-sm text-zinc-500 p-4">Sem dados numéricos.</p>;

  const binCount = Math.min(10, Math.ceil(Math.sqrt(values.length)));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binWidth = (max - min) / binCount || 1;

  const bins: { range: string; count: number }[] = [];
  for (let i = 0; i < binCount; i++) {
    const lo = min + i * binWidth;
    const hi = lo + binWidth;
    bins.push({
      range: `${Math.round(lo)}-${Math.round(hi)}`,
      count: values.filter((v) => v >= lo && (i === binCount - 1 ? v <= hi : v < hi)).length,
    });
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={bins} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
        <XAxis dataKey="range" tick={{ fontSize: 11 }} tickFormatter={(v: string) => truncate(v, 10)} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function DualAxisChart({ spec }: { spec: ChartSpec }) {
  const barKeys = spec.yKeys?.length ? spec.yKeys : [spec.yKey];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={spec.data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
        <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} tickFormatter={(v: string) => truncate(v, 12)} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={spec.yLabel ? { value: spec.yLabel, angle: -90, position: 'insideLeft', style: { fontSize: 11 } } : undefined} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} label={spec.lineYLabel ? { value: spec.lineYLabel, angle: 90, position: 'insideRight', style: { fontSize: 11 } } : undefined} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {barKeys.map((key, i) => (
          <Bar key={key} yAxisId="left" dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} name={key} />
        ))}
        {spec.lineYKey && (
          <Line yAxisId="right" type="monotone" dataKey={spec.lineYKey} stroke="#dc2626" strokeWidth={2} dot={{ r: 4 }} name={spec.lineYKey} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ChartCard({ spec }: { spec: ChartSpec }) {
  const yKeys = spec.yKeys?.length ? spec.yKeys : [spec.yKey];
  const { chartType, title, data, xKey, stacked, horizontal, donut } = spec;

  return (
    <div className="my-3 bg-white dark:bg-[#182229] rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
      <div className="px-4 py-2 border-b border-black/5 dark:border-white/5">
        <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</h4>
      </div>
      <div className="px-2 py-3">
        {data.length === 0 ? (
          <p className="text-sm text-zinc-500 p-4 text-center">Sem dados para exibir.</p>
        ) : chartType === 'histogram' ? (
          <Histogram spec={spec} />
        ) : chartType === 'dual_axis' ? (
          <DualAxisChart spec={spec} />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            {/* Bar / Horizontal Bar / Stacked Bar */}
            {chartType === 'bar' && (
              <BarChart
                data={data}
                layout={horizontal ? 'vertical' : 'horizontal'}
                margin={{ top: 5, right: 10, left: horizontal ? 20 : 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                {horizontal ? (
                  <>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey={xKey} tick={{ fontSize: 11 }} width={120} tickFormatter={(v: string) => truncate(v, 16)} />
                  </>
                ) : (
                  <>
                    <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={(v: string) => truncate(v, 12)} />
                    <YAxis tick={{ fontSize: 11 }} />
                  </>
                )}
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {yKeys.map((key, i) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={COLORS[i % COLORS.length]}
                    stackId={stacked ? 'stack' : undefined}
                    radius={stacked ? undefined : [4, 4, 0, 0]}
                    name={key}
                  />
                ))}
              </BarChart>
            )}

            {/* Line */}
            {chartType === 'line' && (
              <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={(v: string) => truncate(v, 12)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {yKeys.map((key, i) => (
                  <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} name={key} />
                ))}
              </LineChart>
            )}

            {/* Area */}
            {chartType === 'area' && (
              <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={(v: string) => truncate(v, 12)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {yKeys.map((key, i) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={COLORS[i % COLORS.length]}
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={0.15}
                    stackId={stacked ? 'stack' : undefined}
                    name={key}
                  />
                ))}
              </AreaChart>
            )}

            {/* Pie / Donut */}
            {chartType === 'pie' && (
              <PieChart>
                <Pie
                  data={data}
                  dataKey={yKeys[0]}
                  nameKey={xKey}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={donut ? 55 : 0}
                  label={donut
                    ? undefined
                    : ({ name, percent }) => `${truncate(name as string, 14)} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={donut ? false : { stroke: 'rgba(0,0,0,0.3)', strokeWidth: 1 }}
                >
                  {data.map((_, i) => (
                    <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            )}

            {/* Scatter */}
            {chartType === 'scatter' && (
              <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11 }} name={spec.xLabel ?? xKey} />
                <YAxis dataKey={yKeys[0]} tick={{ fontSize: 11 }} name={spec.yLabel ?? yKeys[0]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Scatter data={data} fill={COLORS[0]} />
              </ScatterChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
