import type { ShopifyDailyRow } from '@/lib/sheets/types';
import { normalizeCampName } from '@/lib/sheets/campName';

// Where the ad budget is leaking, read from the per-day Shopify export.
//
// The overbid table answers "is this camp paying more per click than the sheet
// recommends". That misses the bigger hole: measured over the last 30 days, 31%
// of spend goes to campaigns that produce NO installs at all — a camp can sit
// perfectly inside its bid cap and still convert nothing. This file finds those.
//
// Everything is measured on the SAME window versus the equal-length one before
// it (length is user-selectable), so the buckets are comparable and a camp lands
// in exactly one — the most costly problem wins.

export type HealthBucket =
  | 'burning' // spend, clicks, zero installs → cut or fix
  | 'wasted-imp' // lots of impressions, almost no clicks → keyword/creative mismatch
  | 'losing-imp' // impressions collapsing vs prior period → losing the auction
  | 'stopped' // spent last period, nothing now → budget sitting idle?
  | 'pricey' // converting, but CPI well above the median
  | 'rising' // impressions AND installs both up vs the prior period → push it
  | 'scale' // cheap CPI with steady installs → room to push
  | 'ok';

export interface HealthWindow {
  impressions: number;
  clicks: number;
  installs: number;
  spend: number;
  days: number;
  cpc: number | null;
  cpi: number | null;
  ctr: number | null;
  impPerDay: number;
}

export interface CampHealthRow {
  camp: string;
  bucket: HealthBucket;
  cur: HealthWindow;
  prev: HealthWindow;
  /** Relative change in impressions/day vs the prior window. */
  impDelta: number | null;
  /** Relative change in installs vs the prior window. */
  installDelta: number | null;
  /** Money at stake for this row — what ranks the table. */
  atRisk: number;
  /** Plain-language reason + what to do. */
  reason: string;
  /** False when the read rests on 1–2 installs; CPI is noise at that size. */
  reliable: boolean;
  lastActive: string;
  series: { t: number; v: number | null }[];
}

export interface CampHealthResult {
  rows: CampHealthRow[];
  totalSpend: number;
  medianCpi: number | null;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}

const empty = (): HealthWindow => ({
  impressions: 0, clicks: 0, installs: 0, spend: 0, days: 0,
  cpc: null, cpi: null, ctr: null, impPerDay: 0,
});

function finalise(w: HealthWindow, dayCount: number): HealthWindow {
  const n = Math.max(1, dayCount);
  return {
    ...w,
    days: dayCount,
    cpc: w.clicks > 0 ? w.spend / w.clicks : null,
    cpi: w.installs > 0 ? w.spend / w.installs : null,
    ctr: w.impressions > 0 ? w.clicks / w.impressions : null,
    impPerDay: w.impressions / n,
  };
}

export interface CampHealthOptions {
  /** Length of each comparison window in days. Default 30. */
  windowDays?: number;
  /** Ignore camps below this spend in the current window. Default 1. */
  minSpend?: number;
}

export function analyseCampHealth(
  rows: ShopifyDailyRow[],
  opts: CampHealthOptions = {},
): CampHealthResult {
  const win = opts.windowDays ?? 30;
  const minSpend = opts.minSpend ?? 1;
  const days = Array.from(new Set(rows.map((r) => r.date))).sort();
  if (days.length === 0) {
    return { rows: [], totalSpend: 0, medianCpi: null, from: '', to: '', prevFrom: '', prevTo: '' };
  }
  const to = days[days.length - 1];
  const from = days[Math.max(0, days.length - win)];
  const prevTo = days[Math.max(0, days.length - win - 1)];
  const prevFrom = days[Math.max(0, days.length - win * 2)];

  interface Acc {
    camp: string;
    cur: HealthWindow; curDays: Set<string>;
    prev: HealthWindow; prevDays: Set<string>;
    lastActive: string;
    series: { t: number; v: number | null }[];
  }
  const byCamp = new Map<string, Acc>();
  for (const r of rows) {
    const key = normalizeCampName(r.camp).toLowerCase();
    if (!key) continue;
    let a = byCamp.get(key);
    if (!a) {
      a = { camp: r.camp, cur: empty(), curDays: new Set(), prev: empty(), prevDays: new Set(), lastActive: '', series: [] };
      byCamp.set(key, a);
    }
    // Prefer the shortest name as the label — notes only ever lengthen names.
    if (r.camp.length < a.camp.length) a.camp = r.camp;
    a.series.push({ t: Date.parse(r.date), v: r.impressions });
    if (r.spend > 0 || r.clicks > 0) {
      if (r.date > a.lastActive) a.lastActive = r.date;
    }
    const bump = (w: HealthWindow) => {
      w.impressions += r.impressions;
      w.clicks += r.clicks;
      w.installs += r.installs;
      w.spend += r.spend;
    };
    if (r.date >= from && r.date <= to) { bump(a.cur); a.curDays.add(r.date); }
    else if (r.date >= prevFrom && r.date <= prevTo) { bump(a.prev); a.prevDays.add(r.date); }
  }

  const prepared = Array.from(byCamp.values()).map((a) => ({
    ...a,
    cur: finalise(a.cur, a.curDays.size),
    prev: finalise(a.prev, a.prevDays.size),
  }));

  // Median CPI across camps that actually converted — the yardstick for "pricey".
  const cpis = prepared.map((a) => a.cur.cpi).filter((v): v is number => v !== null).sort((x, y) => x - y);
  const medianCpi = cpis.length ? cpis[Math.floor(cpis.length / 2)] : null;

  const out: CampHealthRow[] = [];
  for (const a of prepared) {
    const cur = a.cur, prev = a.prev;
    const spentNow = cur.spend >= minSpend;
    const spentBefore = prev.spend >= minSpend;
    if (!spentNow && !spentBefore) continue;

    const impDelta = prev.impPerDay > 0 ? (cur.impPerDay - prev.impPerDay) / prev.impPerDay : null;
    const installDelta = prev.installs > 0 ? (cur.installs - prev.installs) / prev.installs : null;
    // Growing on BOTH sides of the funnel — more eyes and more installs than the
    // period before. Checked ahead of the CPI test on purpose: a camp whose
    // installs are climbing is working, and CPI off a couple of installs is too
    // noisy to override that.
    const rising =
      impDelta !== null && impDelta >= 0.25 && cur.installs >= 2 && cur.installs > prev.installs;

    let bucket: HealthBucket = 'ok';
    let atRisk = 0;
    let reason = '';
    // Installs this thin make CPI meaningless; flagged so the UI can say so.
    const reliable = cur.installs >= 3;

    if (!spentNow && spentBefore) {
      bucket = 'stopped';
      atRisk = prev.spend;
      reason = `Kỳ trước tiêu $${Math.round(prev.spend)} (${prev.installs} install), ${win} ngày qua không tiêu gì. Camp đã tắt hay hết ngân sách?`;
    } else if (cur.installs === 0 && cur.clicks >= 2) {
      bucket = 'burning';
      atRisk = cur.spend;
      reason = `Tiêu $${Math.round(cur.spend)} qua ${cur.clicks} click nhưng KHÔNG ra install nào. CPC $${cur.cpc?.toFixed(2)} — cắt hoặc soát lại keyword.`;
    } else if (cur.impressions >= 500 && (cur.ctr ?? 0) < 0.001) {
      bucket = 'wasted-imp';
      atRisk = cur.spend;
      reason = `${Math.round(cur.impressions).toLocaleString()} lượt hiển thị nhưng chỉ ${cur.clicks} click (CTR ${((cur.ctr ?? 0) * 100).toFixed(2)}%). Keyword/creative lệch nhu cầu — hiển thị đang phí.`;
    } else if (impDelta !== null && impDelta <= -0.35 && prev.impressions >= 300) {
      bucket = 'losing-imp';
      atRisk = cur.spend;
      const spendUp = prev.spend > 0 && cur.spend > prev.spend;
      reason = `Hiển thị/ngày rơi ${Math.round(impDelta * 100)}% (${Math.round(prev.impPerDay)}→${Math.round(cur.impPerDay)})${spendUp ? ' TRONG KHI tiền tăng — đang bị đẩy giá trong đấu giá' : ''}.`;
    } else if (rising) {
      bucket = 'rising';
      atRisk = 0;
      reason = `Hiển thị/ngày +${Math.round((impDelta ?? 0) * 100)}% và install ${prev.installs}→${cur.installs} so với kỳ trước. Đang lên — đáng nới ngân sách.`;
    } else if (medianCpi !== null && cur.cpi !== null && cur.cpi > medianCpi * 1.5) {
      bucket = 'pricey';
      // Only the excess over the median is really "at risk".
      atRisk = Math.max(0, cur.spend - cur.installs * medianCpi);
      reason = `CPI $${cur.cpi.toFixed(2)} — gấp ${(cur.cpi / medianCpi).toFixed(1)}× mức trung vị $${medianCpi.toFixed(2)}. Kéo về trung vị sẽ tiết kiệm ~$${Math.round(atRisk)}.`;
    } else if (medianCpi !== null && cur.cpi !== null && cur.cpi <= medianCpi && cur.installs >= 2) {
      bucket = 'scale';
      atRisk = 0;
      reason = `CPI $${cur.cpi.toFixed(2)} rẻ hơn trung vị, ${cur.installs} install đều. Còn dư địa tăng bid / nới ngân sách.`;
    } else {
      bucket = 'ok';
      atRisk = 0;
      reason = `Không thấy vấn đề rõ trong ${win} ngày qua.`;
    }

    out.push({
      camp: a.camp, bucket, cur, prev, impDelta, installDelta, atRisk, reason, reliable,
      lastActive: a.lastActive,
      series: a.series.sort((x, y) => x.t - y.t),
    });
  }

  out.sort((x, y) => y.atRisk - x.atRisk || y.cur.spend - x.cur.spend);
  const totalSpend = prepared.reduce((s, a) => s + a.cur.spend, 0);
  return { rows: out, totalSpend, medianCpi, from, to, prevFrom, prevTo };
}

export const BUCKET_META: Record<HealthBucket, { label: string; short: string; cls: string; help: string }> = {
  burning: {
    label: '🔥 Đốt tiền', short: 'Đốt tiền',
    cls: 'bg-rose-100 text-rose-800',
    help: 'Có click, có tiêu tiền, nhưng 0 install trong kỳ đang chọn. Nhóm này đáng tin nhất — 0 install là 0 install, không phụ thuộc mẫu lớn nhỏ.',
  },
  'wasted-imp': {
    label: '👁 Hiển thị phí', short: 'Hiển thị phí',
    cls: 'bg-amber-100 text-amber-800',
    help: 'Từ 500 lượt hiển thị trở lên nhưng CTR dưới 0,1%. Không tốn nhiều tiền, nhưng là traffic bị bỏ phí — keyword hoặc creative lệch nhu cầu.',
  },
  'losing-imp': {
    label: '📉 Mất hiển thị', short: 'Mất hiển thị',
    cls: 'bg-orange-100 text-orange-800',
    help: 'Hiển thị/ngày rơi từ 35% trở lên so với kỳ trước liền kề. Nếu tiền lại tăng thì gần như chắc chắn đang bị đẩy giá trong đấu giá.',
  },
  stopped: {
    label: '⏹ Đã dừng', short: 'Đã dừng',
    cls: 'bg-slate-200 text-slate-700',
    help: 'Kỳ trước có tiêu tiền, kỳ này không tiêu gì. Có thể đã tắt chủ động — hoặc ngân sách đang bỏ trống ngoài ý muốn.',
  },
  pricey: {
    label: '💸 CPI cao', short: 'CPI cao',
    cls: 'bg-yellow-100 text-yellow-800',
    help: 'CPI cao hơn 1,5× mức trung vị. Cảnh báo: camp ở đây thường chỉ có 1–2 install, mà CPI tính từ 1 install là nhiễu — dòng nào có dấu ? thì đọc tham khảo thôi.',
  },
  rising: {
    label: '📈 Đang lên', short: 'Đang lên',
    cls: 'bg-teal-100 text-teal-800',
    help: 'Hiển thị/ngày tăng từ 25% trở lên VÀ install nhiều hơn kỳ trước (tối thiểu 2 install). Cả hai đầu phễu cùng lên — đây là chỗ đáng nới ngân sách trước tiên.',
  },
  scale: {
    label: '🚀 CPI rẻ', short: 'CPI rẻ',
    cls: 'bg-emerald-100 text-emerald-800',
    help: 'CPI rẻ hơn trung vị và có ít nhất 2 install. Đây là chỗ đáng đổ thêm tiền.',
  },
  ok: {
    label: '✓ Ổn', short: 'Ổn',
    cls: 'bg-slate-100 text-slate-500',
    help: 'Không rơi vào nhóm vấn đề nào.',
  },
};
