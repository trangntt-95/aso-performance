import type { ShopifyCampRow, ShopifyDailyRow } from '@/lib/sheets/types';
import { buildCampGrouper } from '@/lib/sheets/campGroup';

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
  | 'paused' // listed in Paused_camp → genuinely switched off
  | 'idle' // spent last period, nothing now, but NOT in Paused_camp → check
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
  /** Relative change in spend vs the prior window. Reading spend without this
   *  is ambiguous: $60 means something different depending on whether the camp
   *  spent $20 or $200 in the period before. */
  spendDelta: number | null;
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
  /** False when only campaign totals were available: deltas, and the buckets
   *  that depend on them, are absent by necessity and the UI must say so. */
  periodComparable: boolean;
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
  /** Camp_Links names, fed to the grouper so an annotated label can resolve to
   *  its clean base name even when that base never appears in the spend data. */
  canonicalNames?: string[];
  /** Camp names from the Paused_camp tab. The ONLY reliable proof a campaign was
   *  switched off — absence of spend is not, since a camp can simply have been
   *  renamed or run out of budget. */
  pausedCamps?: string[];
  /** Campaign TOTALS, used only when no per-day rows exist. The Shopify export
   *  switched to a single date-range block with no date column, which zeroed the
   *  per-day feed and blanked this whole screen. Totals can still answer the
   *  period-free questions (spending with no installs, impressions with no
   *  clicks, paused); anything needing a prior period is withheld rather than
   *  faked. */
  aggregate?: ShopifyCampRow[];
  /** Label of the range the totals cover, e.g. "01/08/2026 → 16/08/2026". */
  aggregateRange?: string;
}

export function analyseCampHealth(
  rows: ShopifyDailyRow[],
  opts: CampHealthOptions = {},
): CampHealthResult {
  const win = opts.windowDays ?? 30;
  const minSpend = opts.minSpend ?? 1;
  // One campaign shows up under several labels ("… - test till Sep",
  // "… (CPI 32)"). Group them, or the same camp is reported as several rows
  // each holding a slice of its spend.
  //
  // Only Camp_Links is authoritative. Paused_camp names used to be passed in
  // here too, which backfired: a paused entry carrying a longer description
  // ("… Low bid 09 (-IN)", "… Test potential KW Apr - test till Sep") became a
  // campaign identity of its own, so the shorter running label could no longer
  // fold onto it and never got recognised as switched off. Left out, those
  // names fall through to the leftover pass and fold onto the spend label.
  //
  // The label set must come from whichever source actually has rows: fed the
  // empty per-day list, the grouper has no labels to return and every camp name
  // comes back lowercased from its own key.
  const nameSource =
    rows.length > 0 ? rows.map((r) => r.camp) : (opts.aggregate ?? []).map((r) => r.camp);
  const grouper = buildCampGrouper(nameSource, opts.canonicalNames ?? []);
  // Paused_camp is the only confirmation that a campaign was switched off.
  // Resolved through the grouper so a paused camp still matches when the spend
  // data labels it with an extra description.
  const pausedKeys = new Set((opts.pausedCamps ?? []).filter(Boolean).map((c) => grouper.key(c)));
  const days = Array.from(new Set(rows.map((r) => r.date))).sort();
  if (days.length === 0) {
    return analyseFromTotals(opts, grouper, pausedKeys, minSpend);
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
    const key = grouper.key(r.camp);
    if (!key) continue;
    let a = byCamp.get(key);
    if (!a) {
      a = { camp: r.camp, cur: empty(), curDays: new Set(), prev: empty(), prevDays: new Set(), lastActive: '', series: [] };
      byCamp.set(key, a);
    }
    // The grouper already picked the shortest label for this campaign.
    a.camp = grouper.label(key);
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
    const spendDelta = prev.spend > 0 ? (cur.spend - prev.spend) / prev.spend : null;
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

    // Presence in Paused_camp settles it: the campaign is off, so nothing about
    // it is actionable. Checked FIRST and without regard to spend — a camp
    // paused midway still shows spend for the days before it was switched off,
    // and flagging that as "burning money" would send you to fix something
    // already fixed.
    const isPaused = pausedKeys.has(grouper.key(a.camp));
    if (isPaused) {
      bucket = 'paused';
      atRisk = 0;
      reason = spentNow
        ? `Có trong tab Paused_camp → đã tắt. Vẫn thấy $${Math.round(cur.spend)} trong kỳ vì camp chạy một phần trước khi tắt.`
        : `Có trong tab Paused_camp và ${win} ngày qua không tiêu gì → đã tắt. Kỳ trước tiêu $${Math.round(prev.spend)} (${prev.installs} install).`;
    } else if (!spentNow && spentBefore) {
      bucket = 'idle';
      atRisk = prev.spend;
      reason = `Kỳ trước tiêu $${Math.round(prev.spend)} (${prev.installs} install), ${win} ngày qua không tiêu gì — nhưng KHÔNG có trong Paused_camp. Kiểm tra xem hết ngân sách hay quên bật lại.`;
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
      camp: a.camp, bucket, cur, prev, impDelta, installDelta, spendDelta, atRisk, reason, reliable,
      lastActive: a.lastActive,
      series: a.series.sort((x, y) => x.t - y.t),
    });
  }

  out.sort((x, y) => y.atRisk - x.atRisk || y.cur.spend - x.cur.spend);
  const totalSpend = prepared.reduce((s, a) => s + a.cur.spend, 0);
  return { rows: out, totalSpend, medianCpi, from, to, prevFrom, prevTo, periodComparable: true };
}

/**
 * Campaign health from TOTALS alone.
 *
 * Same buckets, minus every one that needs a prior period. `impDelta` and its
 * siblings stay null, which the existing guards already respect — so 'idle',
 * 'losing-imp' and 'rising' simply cannot fire, rather than firing on a fabricated
 * zero baseline. The result says `periodComparable: false` so the screen can
 * explain the gap instead of looking broken.
 */
function analyseFromTotals(
  opts: CampHealthOptions,
  grouper: ReturnType<typeof buildCampGrouper>,
  pausedKeys: Set<string>,
  minSpend: number,
): CampHealthResult {
  const totals = opts.aggregate ?? [];
  if (totals.length === 0) {
    return {
      rows: [],
      totalSpend: 0,
      medianCpi: null,
      from: '',
      to: '',
      prevFrom: '',
      prevTo: '',
      periodComparable: false,
    };
  }

  interface Acc { camp: string; impressions: number; clicks: number; installs: number; spend: number }
  const byCamp = new Map<string, Acc>();
  for (const r of totals) {
    const key = grouper.key(r.camp);
    if (!key) continue;
    const a = byCamp.get(key) ?? { camp: grouper.label(key), impressions: 0, clicks: 0, installs: 0, spend: 0 };
    a.impressions += r.impressions;
    a.clicks += r.clicks;
    a.installs += r.installs;
    a.spend += r.spend;
    byCamp.set(key, a);
  }

  // days = 0 keeps impPerDay at zero rather than inventing a rate from a range
  // whose length isn't in the data.
  const win = (w: Acc): HealthWindow => ({
    impressions: w.impressions,
    clicks: w.clicks,
    installs: w.installs,
    spend: w.spend,
    days: 0,
    cpc: w.clicks > 0 ? w.spend / w.clicks : null,
    cpi: w.installs > 0 ? w.spend / w.installs : null,
    ctr: w.impressions > 0 ? w.clicks / w.impressions : null,
    impPerDay: 0,
  });
  const blank: HealthWindow = {
    impressions: 0, clicks: 0, installs: 0, spend: 0, days: 0,
    cpc: null, cpi: null, ctr: null, impPerDay: 0,
  };

  const prepared = Array.from(byCamp.values()).map((a) => ({ camp: a.camp, cur: win(a) }));
  const cpis = prepared.map((a) => a.cur.cpi).filter((v): v is number => v !== null).sort((x, y) => x - y);
  const medianCpi = cpis.length ? cpis[Math.floor(cpis.length / 2)] : null;

  const range = opts.aggregateRange ? ` (${opts.aggregateRange})` : '';
  const out: CampHealthRow[] = [];
  for (const a of prepared) {
    const cur = a.cur;
    if (cur.spend < minSpend && cur.impressions === 0) continue;

    let bucket: HealthBucket = 'ok';
    let atRisk = 0;
    let reason = '';

    if (pausedKeys.has(grouper.key(a.camp))) {
      bucket = 'paused';
      reason = `Có trong tab Paused_camp → đã tắt. Số hiện ra là tổng của cả khoảng${range}, gồm cả những ngày trước khi tắt.`;
    } else if (cur.installs === 0 && cur.clicks >= 2) {
      bucket = 'burning';
      atRisk = cur.spend;
      reason = `Tiêu $${Math.round(cur.spend)} qua ${cur.clicks} click nhưng KHÔNG ra install nào${range}. CPC $${cur.cpc?.toFixed(2)} — cắt hoặc soát lại keyword.`;
    } else if (cur.impressions >= 500 && (cur.ctr ?? 0) < 0.001) {
      bucket = 'wasted-imp';
      atRisk = cur.spend;
      reason = `${Math.round(cur.impressions).toLocaleString()} lượt hiển thị nhưng chỉ ${cur.clicks} click (CTR ${((cur.ctr ?? 0) * 100).toFixed(2)}%). Keyword/creative lệch nhu cầu.`;
    } else if (medianCpi !== null && cur.cpi !== null && cur.cpi > medianCpi * 1.5) {
      bucket = 'pricey';
      atRisk = Math.max(0, cur.spend - cur.installs * medianCpi);
      reason = `CPI $${cur.cpi.toFixed(2)} — gấp ${(cur.cpi / medianCpi).toFixed(1)}× trung vị $${medianCpi.toFixed(2)}. Kéo về trung vị tiết kiệm ~$${Math.round(atRisk)}.`;
    } else if (medianCpi !== null && cur.cpi !== null && cur.cpi <= medianCpi && cur.installs >= 2) {
      bucket = 'scale';
      reason = `CPI $${cur.cpi.toFixed(2)} rẻ hơn trung vị, ${cur.installs} install. Còn dư địa nới ngân sách.`;
    } else {
      bucket = 'ok';
      reason = `Không thấy vấn đề rõ trong khoảng${range}.`;
    }

    out.push({
      camp: a.camp,
      bucket,
      cur,
      prev: blank,
      impDelta: null,
      installDelta: null,
      spendDelta: null,
      atRisk,
      reason,
      reliable: cur.installs >= 3,
      lastActive: '',
      series: [],
    });
  }

  out.sort((x, y) => y.atRisk - x.atRisk || y.cur.spend - x.cur.spend);
  const parts = (opts.aggregateRange ?? '').split('→').map((x) => x.trim());
  return {
    rows: out,
    totalSpend: prepared.reduce((s, a) => s + a.cur.spend, 0),
    medianCpi,
    from: parts[0] ?? '',
    to: parts[1] ?? '',
    prevFrom: '',
    prevTo: '',
    periodComparable: false,
  };
}

/**
 * Three tones instead of nine colours: 'bad' = money to cut now, 'warn' = worth
 * a look, 'good' = an opportunity, 'neutral' = nothing to do. The bucket name
 * carries the detail; colour only has to carry urgency.
 */
export type BucketTone = 'bad' | 'warn' | 'good' | 'neutral';

export const TONE_CLS: Record<BucketTone, string> = {
  bad: 'bg-rose-100 text-rose-800',
  warn: 'bg-amber-100 text-amber-800',
  good: 'bg-emerald-100 text-emerald-800',
  neutral: 'bg-slate-100 text-slate-600',
};

export const BUCKET_META: Record<
  HealthBucket,
  { label: string; short: string; tone: BucketTone; help: string }
> = {
  burning: {
    label: '🔥 Đốt tiền', short: 'Đốt tiền',
    tone: 'bad',
    help: 'Có click, có tiêu tiền, nhưng 0 install trong kỳ đang chọn. Nhóm này đáng tin nhất — 0 install là 0 install, không phụ thuộc mẫu lớn nhỏ.',
  },
  'wasted-imp': {
    label: '👁 Hiển thị phí', short: 'Hiển thị phí',
    tone: 'warn',
    help: 'Từ 500 lượt hiển thị trở lên nhưng CTR dưới 0,1%. Không tốn nhiều tiền, nhưng là traffic bị bỏ phí — keyword hoặc creative lệch nhu cầu.',
  },
  'losing-imp': {
    label: '📉 Mất hiển thị', short: 'Mất hiển thị',
    tone: 'warn',
    help: 'Hiển thị/ngày rơi từ 35% trở lên so với kỳ trước liền kề. Nếu tiền lại tăng thì gần như chắc chắn đang bị đẩy giá trong đấu giá.',
  },
  paused: {
    label: '⏸ Đã tắt', short: 'Đã tắt',
    tone: 'neutral',
    help: 'Có tên trong tab Paused_camp → camp đã tắt, không cần làm gì. Nhãn này thắng mọi nhãn khác: camp tắt giữa kỳ vẫn còn spend của những ngày trước đó, nhưng đó không phải việc cần sửa.',
  },
  idle: {
    label: '⏹ Ngừng chi', short: 'Ngừng chi',
    tone: 'warn',
    help: 'Kỳ trước có tiêu, kỳ này không — nhưng KHÔNG có trong Paused_camp, nên chưa xác nhận là đã tắt. Thường là hết ngân sách hoặc quên bật lại; đáng kiểm tra.',
  },
  pricey: {
    label: '💸 CPI cao', short: 'CPI cao',
    tone: 'warn',
    help: 'CPI cao hơn 1,5× mức trung vị. Cảnh báo: camp ở đây thường chỉ có 1–2 install, mà CPI tính từ 1 install là nhiễu — dòng nào có dấu ? thì đọc tham khảo thôi.',
  },
  rising: {
    label: '📈 Đang lên', short: 'Đang lên',
    tone: 'good',
    help: 'Hiển thị/ngày tăng từ 25% trở lên VÀ install nhiều hơn kỳ trước (tối thiểu 2 install). Cả hai đầu phễu cùng lên — đây là chỗ đáng nới ngân sách trước tiên.',
  },
  scale: {
    label: '🚀 CPI rẻ', short: 'CPI rẻ',
    tone: 'good',
    help: 'CPI rẻ hơn trung vị và có ít nhất 2 install. Đây là chỗ đáng đổ thêm tiền.',
  },
  ok: {
    label: '✓ Ổn', short: 'Ổn',
    tone: 'neutral',
    help: 'Không rơi vào nhóm vấn đề nào.',
  },
};
