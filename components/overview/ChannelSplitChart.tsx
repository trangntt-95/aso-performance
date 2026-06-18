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
  metric: 'users' | 'getapp' | 'cr';
  height?: number;
}

const ORG = '#059669';
const PAID = '#b45309';

// "L90" -> 90; used to express absolute totals as a per-day rate.
function windowDays(window: string): number {
  const n = parseInt(window.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function formatPerDay(total: number, days: number): string {
  const perDay = total / days;
  if (perDay >= 10) return formatNumber(Math.round(perDay));
  return perDay.toFixed(1);
}

interface EnrichedPoint extends ChannelSplitPoint {
  orgVal: number; // % share (users/getapp) or CR % (cr)
  paidVal: number;
  _orgAbs: number; // numerator for tooltip (users / install)
  _paidAbs: number;
  _orgBase: number; // CR denominator (users) — 0 in share mode
  _paidBase: number;
}

export function ChannelSplitChart({ data, metric, height = 260 }: Props) {
  const isCr = metric === 'cr';

  const enriched: EnrichedPoint[] = data.map((d) => {
    if (isCr) {
      // CR mode: each channel's own conversion rate = getApp / users.
      const orgCr = d.organicUsers > 0 ? (d.organicGetApp / d.organicUsers) * 100 : 0;
      const paidCr = d.paidUsers > 0 ? (d.paidGetApp / d.paidUsers) * 100 : 0;
      return {
        ...d,
        orgVal: orgCr,
        paidVal: paidCr,
        _orgAbs: d.organicGetApp,
        _paidAbs: d.paidGetApp,
        _orgBase: d.organicUsers,
        _paidBase: d.paidUsers,
      };
    }
    // Share mode: organic vs paid % of total (sums to 100).
    const org = metric === 'users' ? d.organicUsers : d.organicGetApp;
    const paid = metric === 'users' ? d.paidUsers : d.paidGetApp;
    const total = org + paid;
    return {
      ...d,
      orgVal: total > 0 ? (org / total) * 100 : 0,
      paidVal: total > 0 ? (paid / total) * 100 : 0,
      _orgAbs: org,
      _paidAbs: paid,
      _orgBase: 0,
      _paidBase: 0,
    };
  });

  const maxCr = isCr
    ? Math.max(1, ...enriched.flatMap((e) => [e.orgVal, e.paidVal]))
    : 100;
  const yDomain: [number, number] = isCr ? [0, Math.ceil((maxCr * 1.25) / 5) * 5] : [0, 100];
  const orgName = isCr ? 'Organic CR' : 'Organic %';
  const paidName = isCr ? 'Paid CR' : 'Paid %';
  const decimals = isCr ? 1 : 0;

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
            domain={yDomain}
            ticks={isCr ? undefined : [0, 25, 50, 75, 100]}
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
              const val = value as number;
              if (!p) return [`${val.toFixed(decimals)}%`, name];
              const isOrg = name === orgName;
              const abs = isOrg ? p._orgAbs : p._paidAbs;
              if (isCr) {
                const base = isOrg ? p._orgBase : p._paidBase;
                return [`${val.toFixed(1)}% · ${formatNumber(abs)} / ${formatNumber(base)}`, name];
              }
              const days = windowDays(p.window);
              return [`${formatPerDay(abs, days)}/day`, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" />
          <Line
            type="monotone"
            dataKey="orgVal"
            name={orgName}
            stroke={ORG}
            strokeWidth={2.5}
            dot={{ r: 4, fill: ORG, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          >
            <LabelList
              dataKey="orgVal"
              position="top"
              fill={ORG}
              fontSize={11}
              fontWeight={600}
              formatter={(v) => (typeof v === 'number' ? `${v.toFixed(decimals)}%` : '')}
            />
          </Line>
          <Line
            type="monotone"
            dataKey="paidVal"
            name={paidName}
            stroke={PAID}
            strokeWidth={2.5}
            dot={{ r: 4, fill: PAID, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          >
            <LabelList
              dataKey="paidVal"
              position="bottom"
              fill={PAID}
              fontSize={11}
              fontWeight={600}
              formatter={(v) => (typeof v === 'number' ? `${v.toFixed(decimals)}%` : '')}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
