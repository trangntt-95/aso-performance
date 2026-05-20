'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyTrendPoint } from './aggregate';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

interface Props {
  data: DailyTrendPoint[];
  height?: number;
}

type Metric = 'users' | 'getApp';

export function DailyTrendChart({ data, height = 220 }: Props) {
  const [metric, setMetric] = useState<Metric>('users');
  const getAppAvailable = data.some((d) => d.getApp !== null);

  if (data.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-500">Chưa có dữ liệu history.</div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px]">
          <button
            type="button"
            onClick={() => setMetric('users')}
            className={cn(
              'px-2.5 py-1 font-medium transition',
              metric === 'users'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            Users
          </button>
          <button
            type="button"
            onClick={() => getAppAvailable && setMetric('getApp')}
            disabled={!getAppAvailable}
            title={getAppAvailable ? '' : 'GetApp chưa có trong History tab — cần update Apps Script để ghi getApp theo ngày'}
            className={cn(
              'px-2.5 py-1 font-medium transition border-l border-slate-200',
              metric === 'getApp'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50',
              !getAppAvailable && 'opacity-40 cursor-not-allowed',
            )}
          >
            GetApp
          </button>
        </div>
        <span className="text-[10px] text-slate-500">
          {data.length} ngày · usersL7D (rolling 7-day)
        </span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: -8 }}>
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 10, fill: '#64748b' }}
              stroke="#cbd5e1"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#64748b' }}
              stroke="#cbd5e1"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatNumber(v, { compact: true })}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(value) => {
                const n = typeof value === 'number' ? value : Number(value);
                return [formatNumber(n), metric === 'users' ? 'Users (L7D)' : 'GetApp'];
              }}
              labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload as DailyTrendPoint | undefined;
                return p?.date ?? String(label);
              }}
            />
            <Area
              type="monotone"
              dataKey={metric}
              stroke="#4f46e5"
              strokeWidth={2}
              fill="url(#trendGradient)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
