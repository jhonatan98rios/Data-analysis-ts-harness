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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { ChartSpec } from '@/lib/tools/plot';

// ponytail: reusable palette, add more colors if needed
const COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#0891b2', '#db2777', '#ea580c', '#4f46e5', '#65a30d',
];

function truncateLabel(label: string, max = 20): string {
  return label.length > max ? label.slice(0, max) + '…' : label;
}

function Histogram({ spec }: { spec: ChartSpec }) {
  // Build histogram bins from data
  const xKey = spec.xKey;
  const yKey = Array.isArray(spec.yKey) ? spec.yKey[0] : spec.yKey;
  const values = spec.data
    .map((d) => Number(d[yKey]))
    .filter((v) => !isNaN(v));

  if (values.length === 0) return <p className="text-sm text-zinc-500 p-4">Sem dados numéricos.</p>;

  const binCount = Math.min(10, Math.ceil(Math.sqrt(values.length)));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binWidth = (max - min) / binCount || 1;

  const bins: { range: string; count: number }[] = [];
  for (let i = 0; i < binCount; i++) {
    const lo = min + i * binWidth;
    const hi = lo + binWidth;
    const count = values.filter((v) => v >= lo && (i === binCount - 1 ? v <= hi : v < hi)).length;
    bins.push({
      range: `${Math.round(lo)}-${Math.round(hi)}`,
      count,
    });
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={bins} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
        <XAxis dataKey="range" tick={{ fontSize: 11 }} tickFormatter={(v: string) => truncateLabel(v, 10)} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChartCard({ spec }: { spec: ChartSpec }) {
  const yKeys = spec.yKeys?.length ? spec.yKeys : [spec.yKey];
  const { chartType, title, data, xKey } = spec;

  return (
    <div className="my-3 bg-white dark:bg-[#182229] rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
      <div className="px-4 py-2 border-b border-black/5 dark:border-white/5">
        <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</h4>
      </div>
      <div className="px-2 py-3">
        {/* Fallback: too few data points */}
        {data.length === 0 ? (
          <p className="text-sm text-zinc-500 p-4 text-center">Sem dados para exibir.</p>
        ) : chartType === 'histogram' ? (
          <Histogram spec={spec} />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            {/* Bar — agnóstico de orientação */}
            {chartType === 'bar' ? (
              <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={(v: string) => truncateLabel(v, 12)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {yKeys.map((key, i) => (
                  <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} name={key} />
                ))}
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={(v: string) => truncateLabel(v, 12)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {yKeys.map((key, i) => (
                  <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} name={key} />
                ))}
              </LineChart>
            ) : chartType === 'area' ? (
              <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={(v: string) => truncateLabel(v, 12)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {yKeys.map((key, i) => (
                  <Area key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.15} name={key} />
                ))}
              </AreaChart>
            ) : chartType === 'pie' ? (
              <PieChart>
                <Pie
                  data={data}
                  dataKey={yKeys[0]}
                  nameKey={xKey}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${truncateLabel(name as string, 14)} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={{ stroke: 'rgba(0,0,0,0.3)', strokeWidth: 1 }}
                >
                  {data.map((_, i) => (
                    <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            ) : chartType === 'scatter' ? (
              <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11 }} name={spec.xLabel ?? xKey} />
                <YAxis dataKey={yKeys[0]} tick={{ fontSize: 11 }} name={spec.yLabel ?? yKeys[0]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Scatter data={data} fill={COLORS[0]} />
              </ScatterChart>
            ) : (
              <p className="text-sm text-zinc-500 p-4 text-center">Tipo de gráfico não suportado: {chartType}</p>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
