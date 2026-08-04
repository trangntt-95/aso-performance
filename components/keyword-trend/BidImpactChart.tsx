'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ImpactPoint } from '@/lib/market/noteImpact';

// Paid-share over time for one keyword, with a marker at the note date so you
// can eyeball whether the bid change (noted then) pulled paid share up.

function fmtTick(ts: number | string): string {
  const n = typeof ts === 'number' ? ts : Number(ts);
  if (!Number.isFinite(n)) return '';
  return new Date(n).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function BidImpactChart({ points, noteAt }: { points: ImpactPoint[]; noteAt: number }) {
  const data = points
    .filter((p) => p.paidShare != null)
    .map((p) => ({ ts: p.t, share: Math.round((p.paidShare as number) * 1000) / 10 }));

  if (data.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center text-xs text-slate-400">
        Chưa đủ dữ liệu paid share để vẽ.
      </div>
    );
  }

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="ts"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tickFormatter={fmtTick}
            tick={{ fontSize: 10, fill: '#64748b' }}
            stroke="#cbd5e1"
            minTickGap={28}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            stroke="#cbd5e1"
            unit="%"
            domain={[0, 'auto']}
          />
          <Tooltip
            labelFormatter={(l) => fmtTick(l as number)}
            formatter={(v) => [`${v}%`, 'Paid share']}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <ReferenceLine
            x={noteAt}
            stroke="#f59e0b"
            strokeDasharray="4 3"
            label={{ value: 'note', fontSize: 10, fill: '#b45309', position: 'top' }}
          />
          <Line
            type="monotone"
            dataKey="share"
            stroke="#0891b2"
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
            name="Paid share"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
