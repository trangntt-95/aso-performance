'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CountryRollup } from './aggregate';
import { formatNumber } from '@/lib/utils/format';

const PALETTE = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#eef2ff', '#f5f3ff'];

interface Props {
  data: CountryRollup[];
  height?: number;
  onCountryClick?: (country: string) => void;
}

function tickFmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function TopCountriesChart({ data, height = 280, onCountryClick }: Props) {
  const clickable = Boolean(onCountryClick);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: '#64748b' }}
            stroke="#cbd5e1"
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFmt}
          />
          <YAxis
            type="category"
            dataKey="country"
            tick={{ fontSize: 11, fill: '#475569' }}
            stroke="#cbd5e1"
            tickLine={false}
            axisLine={false}
            width={88}
          />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(v) => formatNumber(typeof v === 'number' ? v : Number(v))}
          />
          <Bar
            dataKey="users"
            name="Users"
            radius={[0, 6, 6, 0]}
            maxBarSize={20}
            cursor={clickable ? 'pointer' : undefined}
            onClick={(payload) => {
              const c = (payload as unknown as { payload?: { country?: string } })?.payload?.country;
              if (c && onCountryClick) onCountryClick(c);
            }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
