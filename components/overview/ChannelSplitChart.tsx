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

// Stacked label: big bold % on top, small faint absolute number underneath, so
// you can see whether a share/CR shift came from an organic vs paid abs change.
function ValueLabel(props: {
  x?: unknown;
  y?: unknown;
  value?: unknown;
  index?: number;
  color: string;
  abs: number[];
  decimals: number;
  placement: 'top' | 'bottom';
}) {
  const { index, color, abs, decimals, placement } = props;
  const x = Number(props.x);
  const y = Number(props.y);
  const value = Number(props.value);
  if (!isFinite(x) || !isFinite(y) || index == null || !isFinite(value)) return null;
  const pctY = placement === 'top' ? y - 15 : y + 15;
  const absY = placement === 'top' ? y - 4 : y + 26;
  return (
    <g>
      <text x={x} y={pctY} textAnchor="middle" fill={color} fontSize={11} fontWeight={600}>
        {value.toFixed(decimals)}%
      </text>
      <text x={x} y={absY} textAnchor="middle" fill={color} fillOpacity={0.5} fontSize={9}>
        {formatNumber(abs[index] ?? 0, { compact: true })}
      </text>
    </g>
  );
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
  const orgAbs = enriched.map((e) => e._orgAbs);
  const paidAbs = enriched.map((e) => e._paidAbs);

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
              return [`${val.toFixed(1)}% · ${formatNumber(abs)}`, name];
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
              content={(p) => (
                <ValueLabel {...p} color={ORG} abs={orgAbs} decimals={decimals} placement="top" />
              )}
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
              content={(p) => (
                <ValueLabel {...p} color={PAID} abs={paidAbs} decimals={decimals} placement="bottom" />
              )}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
