'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
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

function tickFmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function pctOf(value: number, total: number): string {
  if (!total || total <= 0) return '';
  const pct = (value / total) * 100;
  if (pct < 6) return '';
  return `${pct.toFixed(0)}%`;
}

export function ChannelSplitChart({ data, metric, height = 240 }: Props) {
  const orgKey = metric === 'users' ? 'organicUsers' : 'organicGetApp';
  const paidKey = metric === 'users' ? 'paidUsers' : 'paidGetApp';

  const enriched = data.map((d) => {
    const org = d[orgKey];
    const paid = d[paidKey];
    const total = org + paid;
    return {
      ...d,
      _total: total,
      _orgPct: pctOf(org, total),
      _paidPct: pctOf(paid, total),
    };
  });

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={enriched} margin={{ top: 12, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="window"
            tick={{ fontSize: 11, fill: '#64748b' }}
            stroke="#cbd5e1"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            stroke="#cbd5e1"
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFmt}
          />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(v, name, item) => {
              const num = typeof v === 'number' ? v : Number(v);
              const total = (item?.payload as { _total?: number } | undefined)?._total ?? 0;
              const pct = total > 0 ? ((num / total) * 100).toFixed(1) : '0';
              return [`${formatNumber(num)} (${pct}%)`, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" />
          <Bar dataKey={orgKey} stackId="a" fill={ORG} name="Organic" radius={[0, 0, 0, 0]}>
            <LabelList dataKey="_orgPct" position="center" fill="#fff" fontSize={11} fontWeight={600} />
          </Bar>
          <Bar dataKey={paidKey} stackId="a" fill={PAID} name="Paid" radius={[6, 6, 0, 0]}>
            <LabelList dataKey="_paidPct" position="center" fill="#fff" fontSize={11} fontWeight={600} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
