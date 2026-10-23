'use client';

import { useMemo, useState } from 'react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { buildPositionDigest, type DigestGroup, type DigestRow, type Win } from '@/lib/digest/positions';
import { cn } from '@/lib/utils';

// Biến động vị trí keyword chính theo nước (L3/L7/L14), cùng logic với email
// 09:00 (lib/digest/positions.ts) nhưng đầy đủ: cả vị trí lẫn users, cả dòng
// ổn định. Tách Paid (để action) và Organic (để xem xu hướng), keyword biến
// động nhiều nhất lên đầu. Trang 23/10/2026.

const fmtPos = (p: number | null) => (p === null ? '—' : p.toFixed(1));
const fmtDelta = (d: number | null) => (d === null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}`);

function DeltaCell({ d, threshold }: { d: number | null; threshold: number }) {
  if (d === null) return <td className="px-2 py-1 text-right text-slate-300">—</td>;
  const bad = d >= threshold;
  const good = d <= -threshold;
  return (
    <td
      className={cn(
        'px-2 py-1 text-right font-mono tabular-nums',
        bad ? 'bg-rose-50 font-semibold text-rose-700' : good ? 'bg-emerald-50 font-semibold text-emerald-700' : 'text-slate-500',
      )}
    >
      {bad ? '▼' : good ? '▲' : ''}
      {fmtDelta(d)}
    </td>
  );
}

function WinCells({ r, n, threshold }: { r: DigestRow; n: Win; threshold: number }) {
  const s = r.w[n];
  return (
    <>
      <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-800">{fmtPos(s.pos)}</td>
      <DeltaCell d={s.delta} threshold={threshold} />
    </>
  );
}

function UsersCell({ r }: { r: DigestRow }) {
  const u = r.w[7];
  const d = u.usersPrev > 0 ? (u.users - u.usersPrev) / u.usersPrev : null;
  return (
    <td className="px-2 py-1 text-right font-mono tabular-nums text-slate-700">
      {u.users}
      <span className={cn('ml-1 text-[10px]', d === null ? 'text-slate-300' : d >= 0.1 ? 'text-emerald-600' : d <= -0.1 ? 'text-rose-600' : 'text-slate-400')}>
        {d === null ? '' : `${d > 0 ? '+' : ''}${Math.round(d * 100)}%`}
      </span>
    </td>
  );
}

function SurfaceTable({ groups, threshold, onlyMoving }: { groups: DigestGroup[]; threshold: number; onlyMoving: boolean }) {
  const moving = (r: DigestRow) => r.w[7].delta !== null && Math.abs(r.w[7].delta) >= threshold;
  const shown = onlyMoving ? groups.filter((g) => moving(g.all) || g.countries.some(moving)) : groups;
  if (shown.length === 0) {
    return <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500">Không có keyword nào {onlyMoving ? 'biến động quá ngưỡng' : ''}.</div>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[820px] text-xs">
        <thead className="bg-slate-50 text-[11px] text-slate-600">
          <tr>
            <th className="px-2 py-2 text-left font-medium">Keyword · nước</th>
            <th className="px-2 py-2 text-right font-medium">L3</th>
            <th className="px-2 py-2 text-right font-medium" title="So với 3 ngày liền trước">Δ3</th>
            <th className="px-2 py-2 text-right font-medium">L7</th>
            <th className="px-2 py-2 text-right font-medium" title="So với 7 ngày liền trước">Δ7</th>
            <th className="px-2 py-2 text-right font-medium">L14</th>
            <th className="px-2 py-2 text-right font-medium" title="So với 14 ngày liền trước">Δ14</th>
            <th className="px-2 py-2 text-right font-medium" title="Users 7 ngày và % so với 7 ngày trước">Users L7</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((g) => {
            const countries = onlyMoving ? g.countries.filter(moving) : g.countries;
            return (
              <FragmentRows key={`${g.keyword}|${g.surface}`} g={g} countries={countries} threshold={threshold} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRows({ g, countries, threshold }: { g: DigestGroup; countries: DigestRow[]; threshold: number }) {
  return (
    <>
      <tr className="border-t-2 border-slate-200">
        <td className="px-2 py-1.5">
          <span className="font-semibold text-slate-900">{g.keyword}</span>
          {g.isBrand && <span className="ml-1 rounded bg-indigo-50 px-1 text-[9px] font-bold text-indigo-700">BRAND</span>}
          <span className="ml-1 text-[10px] text-slate-400">{g.category}</span>
          <div className="text-[10px] text-slate-500">mọi nước</div>
        </td>
        <WinCells r={g.all} n={3} threshold={threshold} />
        <WinCells r={g.all} n={7} threshold={threshold} />
        <WinCells r={g.all} n={14} threshold={threshold} />
        <UsersCell r={g.all} />
      </tr>
      {countries.map((r) => (
        <tr key={r.country} className="bg-slate-50/50">
          <td className="py-1 pl-6 pr-2 text-slate-700">↳ {r.country}</td>
          <WinCells r={r} n={3} threshold={threshold} />
          <WinCells r={r} n={7} threshold={threshold} />
          <WinCells r={r} n={14} threshold={threshold} />
          <UsersCell r={r} />
        </tr>
      ))}
      {g.moreCountries > 0 && (
        <tr className="bg-slate-50/50">
          <td colSpan={8} className="py-0.5 pl-6 text-[10px] text-slate-400">
            +{g.moreCountries} nước khác quá ít users để tính
          </td>
        </tr>
      )}
    </>
  );
}

export function PositionDigestPanel() {
  const { data } = useSheetData();
  const digest = useMemo(() => (data ? buildPositionDigest(data) : null), [data]);
  const [onlyMoving, setOnlyMoving] = useState(true);
  const [open, setOpen] = useState(true);
  if (!digest) return null;
  const t = digest.summary.threshold;
  const paid = digest.groups.filter((g) => g.surface === 'paid');
  const organic = digest.groups.filter((g) => g.surface === 'organic');
  const dmy = digest.dataDate.split('-').reverse().join('/');

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-left">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Biến động vị trí keyword chính · theo nước {open ? '▾' : '▸'}
          </div>
          <div className="text-[11px] text-slate-500">
            Data tới {dmy} · cùng logic với email 09:00 · {digest.summary.worsened7} dòng nước tụt, {digest.summary.improved7} lên trong 7 ngày (ngưỡng {t} bậc)
          </div>
        </button>
        <label className="flex items-center gap-1 text-[11px] text-slate-600">
          <input type="checkbox" checked={onlyMoving} onChange={(e) => setOnlyMoving(e.target.checked)} />
          Chỉ keyword biến động
        </label>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div>
            <div className="mb-1 text-[11px] font-semibold text-amber-800">PAID · để action bid</div>
            <SurfaceTable groups={paid} threshold={t} onlyMoving={onlyMoving} />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold text-teal-800">ORGANIC · để xem xu hướng</div>
            <SurfaceTable groups={organic} threshold={t} onlyMoving={onlyMoving} />
          </div>
        </div>
      )}
      <div className="mt-2 text-[10px] text-slate-400">
        Vị trí = trung bình theo ngày, trọng số theo users; Δ so với cửa sổ cùng độ dài liền trước, dương là tụt. Keyword chính = mọi keyword Brand + top 30 theo users L30
        (bỏ Noise/Test); dòng nước cần ≥5 users trong 2 tuần (Brand: 3). Bỏ {digest.summary.excludedCountries.join(', ')}.
      </div>
    </div>
  );
}
