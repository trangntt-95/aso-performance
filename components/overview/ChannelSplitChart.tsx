'use client';

import {
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChannelSplitPoint } from './aggregate';
import { formatNumber } from '@/lib/utils/format';

interface Props {
  data: ChannelSplitPoint[];
  metric: 'users' | 'getapp';
  height?: number;
}

const ORG = '#059669';
const PAID = '#b45309';

interface EnrichedPoint extends ChannelSplitPoint {
  _total: number;
  _orgAbs: number;
  _paidAbs: number;
  orgPct: number;
  paidPct: number;
}

export function ChannelSplitChart({ data, metric, height = 260 }: Props) {
  const orgKey = metric === 'users' ? 'organicUsers' : 'organicGetApp';
  const paidKey = metric === 'users' ? 'paidUsers' : 'paidGetApp';

  const enriched: EnrichedPoint[] = data.map((d) => {
    const org = d[orgKey];
    const paid = d[paidKey];
    const total = org + paid;
    return {
      ...d,
      _total: total,
      _orgAbs: org,
      _paidAbs: paid,
      orgPct: total > 0 ? (org / total) * 100 : 0,
      paidPct: total > 0 ? (paid / total) * 100 : 0,
    };
  });

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={enriched} margin={{ top: 20, right: 16, bottom: 4, left: -4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="window"
            tick={{ fontSize: 11, fill: '#64748b' }}
            stroke="#cbd5e1"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 10, fill: '#64748b' }}
            stroke="#cbd5e1"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(value, name, item) => {
              const p = item?.payload as EnrichedPoint | undefined;
              if (!p) return [`${(value as number).toFixed(1)}%`, name];
              const pct = value as number;
              const abs = name === 'Organic %' ? p._orgAbs : p._paidAbs;
              return [`${pct.toFixed(1)}% · ${formatNumber(abs)}`, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" />
          <Line
            type="monotone"
            dataKey="orgPct"
            name="Organic %"
            stroke={ORG}
            strokeWidth={2.5}
            dot={{ r: 4, fill: ORG, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          >
            <LabelList
              dataKey="orgPct"
              position="top"
              fill={ORG}
              fontSize={11}
              fontWeight={600}
              formatter={(v) => (typeof v === 'number' ? `${v.toFixed(0)}%` : '')}
            />
          </Line>
          <Line
            type="monotone"
            dataKey="paidPct"
            name="Paid %"
            stroke={PAID}
            strokeWidth={2.5}
            dot={{ r: 4, fill: PAID, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          >
            <LabelList
              dataKey="paidPct"
              position="bottom"
              fill={PAID}
              fontSize={11}
              fontWeight={600}
              formatter={(v) => (typeof v === 'number' ? `${v.toFixed(0)}%` : '')}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
