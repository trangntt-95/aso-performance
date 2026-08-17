import type { SheetPayload } from '@/lib/sheets/types';
import { computeKpis, topVolumeMovers, topCountriesFor, channelSnapshotForWindow } from '@/components/overview/aggregate';
import { analyseCampHealth, BUCKET_META, type HealthBucket } from './campHealth';
import { findOverbidCamps } from './overbid';
import { buildCpiCapOverview } from './cpiCapOverview';
import { buildGoogleAdsReport } from './googleAdsReport';
import { buildGoogleAdsDeep } from './googleAdsDeep';
import { buildInstallOrigin } from './installOrigin';

// One pass over every module, returning only what changed or stands out.
//
// The dashboard has eight screens; answering "what happened this week" by
// opening all eight is the thing this replaces. Each finding carries the number
// that justifies it and the screen it came from, so nothing here is a claim the
// reader can't go and check.
//
// Two rules keep it from becoming noise:
//   - a finding needs a threshold crossed, not merely a direction
//   - anything resting on 1–2 installs says so, rather than being dropped
//     silently or quoted as if it were a rate

export type Severity = 'critical' | 'warning' | 'info' | 'good';

export interface DigestItem {
  severity: Severity;
  /** Which screen this came from — so it can be verified, not just believed. */
  source: string;
  headline: string;
  /** The numbers behind the headline, already formatted. */
  detail: string;
  /** What to do about it, when there is a clear next step. */
  action?: string;
  /** Sorting weight — money at stake, or a proxy for it. */
  weight: number;
}

export interface WeeklyDigest {
  window: string;
  generatedFor: string;
  items: DigestItem[];
  counts: Record<Severity, number>;
  /** Plain-text rendering, ready to paste into Slack or a doc. */
  text: string;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`;

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, good: 2, info: 3 };

/** Deltas below this are noise at this account's volume. */
const MOVE_THRESHOLD = 0.2;

export function buildWeeklyDigest(
  data: SheetPayload | null | undefined,
  windowDays = 7,
): WeeklyDigest | null {
  if (!data) return null;
  const items: DigestItem[] = [];
  const win = windowDays <= 3 ? 'L3' : windowDays <= 7 ? 'L7' : windowDays <= 14 ? 'L14' : 'L30';

  // ---- top line -----------------------------------------------------------
  const kpis = computeKpis(data, win as 'L7', {});
  const snap = channelSnapshotForWindow(data, win as 'L7', {});
  if (kpis.usersL > 0) {
    const moved = Math.abs(kpis.usersDeltaPct) >= MOVE_THRESHOLD || Math.abs(kpis.getAppDeltaPct) >= MOVE_THRESHOLD;
    items.push({
      severity: moved ? (kpis.getAppDeltaPct < 0 ? 'warning' : 'good') : 'info',
      source: 'Overview',
      headline: `${kpis.usersL} users · ${kpis.getAppL} install trong ${windowDays} ngày`,
      detail:
        `Users ${pct(kpis.usersDeltaPct)}, install ${pct(kpis.getAppDeltaPct)} so với kỳ trước cùng độ dài` +
        (snap ? `. Paid ${snap.paidGetApp} install / organic ${snap.organicGetApp}.` : '.'),
      weight: Math.abs(kpis.getAppDeltaPct) * 1000,
    });
  }

  // ---- keyword outliers ---------------------------------------------------
  const movers = topVolumeMovers(data, win as 'L7', { limit: 40 });
  const bigUp = movers.filter((m) => m.deltaUsersPct !== null && m.deltaUsersPct >= 0.5 && m.usersL >= 5);
  const bigDown = movers.filter((m) => m.deltaUsersPct !== null && m.deltaUsersPct <= -0.5 && m.usersP >= 5);
  if (bigDown.length > 0) {
    const worst = bigDown.slice(0, 5);
    items.push({
      severity: 'warning',
      source: 'Overview · volume movers',
      headline: `${bigDown.length} keyword mất trên nửa lượng traffic`,
      detail: worst
        .map((m) => `${m.keyword} ${m.usersP}→${m.usersL} (${pct(m.deltaUsersPct as number)})`)
        .join(' · '),
      action: 'Mở Search Terms để xem cụm nào tụt hạng, và Underbid nếu là keyword đang bid.',
      weight: bigDown.reduce((s, m) => s + m.usersP, 0),
    });
  }
  if (bigUp.length > 0) {
    const best = bigUp.slice(0, 5);
    items.push({
      severity: 'good',
      source: 'Overview · volume movers',
      headline: `${bigUp.length} keyword tăng trên 50% traffic`,
      detail: best
        .map((m) => `${m.keyword} ${m.usersP}→${m.usersL} (${pct(m.deltaUsersPct as number)})`)
        .join(' · '),
      action: 'Kiểm tra đã bid chưa — cụm đang lên mà chưa mua là chỗ rẻ nhất để thêm.',
      weight: bigUp.reduce((s, m) => s + m.usersL, 0),
    });
  }

  // ---- camp health --------------------------------------------------------
  const health = analyseCampHealth(data.shopifyDaily ?? [], {
    windowDays,
    canonicalNames: (data.campLinks ?? []).map((c) => c.camp),
    pausedCamps: (data.pausedKw ?? []).map((r) => r.camp),
  });
  const problemBuckets: HealthBucket[] = ['burning', 'wasted-imp', 'losing-imp'];
  for (const b of problemBuckets) {
    const rows = health.rows.filter((r) => r.bucket === b);
    if (rows.length === 0) continue;
    const risk = rows.reduce((s, r) => s + r.atRisk, 0);
    const top = rows.slice(0, 3);
    items.push({
      severity: risk >= 100 ? 'critical' : 'warning',
      source: 'Camp Health',
      headline: `${rows.length} camp · ${BUCKET_META[b].label} · ${usd(risk)} đang treo`,
      detail: top.map((r) => `${r.camp} (${usd(r.cur.spend)}, ${r.cur.installs} ins)`).join(' · '),
      action: BUCKET_META[b].help.split('.')[0] + '.',
      weight: risk,
    });
  }
  const rising = health.rows.filter((r) => r.bucket === 'rising');
  if (rising.length > 0) {
    items.push({
      severity: 'good',
      source: 'Camp Health',
      headline: `${rising.length} camp đang lên (imp tăng + install tăng)`,
      detail: rising
        .slice(0, 4)
        .map((r) => `${r.camp} (${r.cur.installs} ins${r.impDelta !== null ? `, imp ${pct(r.impDelta)}` : ''})`)
        .join(' · '),
      action: 'Cân nhắc nâng ngân sách trước khi đà này nguội.',
      weight: rising.reduce((s, r) => s + r.cur.spend, 0),
    });
  }

  // ---- overbid ------------------------------------------------------------
  const overbid = findOverbidCamps(
    data.shopifyCamps ?? [],
    data.bidCap ?? [],
    data.campLinks ?? [],
    data.pausedKw ?? [],
  );
  if (overbid.length > 0) {
    // What the same installs would have cost at the allowed CPI. Only camps with
    // both an install count and a target contribute — a camp with no installs
    // has no "should have cost", it simply shouldn't have spent.
    const waste = overbid.reduce(
      (sum, r) =>
        r.cpi !== null && r.targetCpi !== null && r.installs > 0 && r.cpi > r.targetCpi
          ? sum + (r.spend - r.installs * r.targetCpi)
          : sum,
      0,
    );
    items.push({
      severity: waste >= 100 ? 'critical' : 'warning',
      source: 'Overbid Camps',
      headline:
        `${overbid.length} camp trả trên trần` + (waste > 0 ? ` · khoảng ${usd(waste)} vượt` : ''),
      detail: overbid
        .slice(0, 4)
        .map(
          (r) =>
            `${r.camp} (CPI ${r.cpi === null ? '—' : usd(r.cpi)}` +
            `${r.targetCpi !== null ? ` vs trần ${usd(r.targetCpi)}` : ''})`,
        )
        .join(' · '),
      action: 'Hạ bid hoặc tách country cho những camp này.',
      weight: waste > 0 ? waste : overbid.reduce((sum, r) => sum + r.spend, 0),
    });
  }

  // ---- CPI cap sanity -----------------------------------------------------
  const capOverview = buildCpiCapOverview(data);
  if (capOverview) {
    const broken = capOverview.rows.filter((r) => r.capHeadroom !== null && r.capHeadroom < 0);
    if (broken.length > 0) {
      items.push({
        severity: 'critical',
        source: 'Bid Recommendations',
        headline: `${broken.length} nước có trần CPI cao hơn giá trị một install`,
        detail: broken
          .slice(0, 5)
          .map((r) => `${r.country}: trần ${usd(r.cap)} > giá trị $${(r.valuePerInstall ?? 0).toFixed(2)}`)
          .join(' · '),
        action: 'Lỗi cấu hình, không phải lỗi vận hành — sửa trần trong PerGeo_CPI_Cap.',
        weight: 500,
      });
    }
    if (capOverview.totals.overspend > 0) {
      items.push({
        severity: capOverview.totals.overspend >= 200 ? 'critical' : 'warning',
        source: 'Bid Recommendations',
        headline: `${usd(capOverview.totals.overspend)} chi vượt trần CPI (L30)`,
        detail: `${capOverview.totals.overCount}/${capOverview.totals.withInstalls} nước có install đang vượt trần. Tổng chi ${usd(capOverview.totals.spend)}.`,
        weight: capOverview.totals.overspend,
      });
    }
  }

  // ---- countries ----------------------------------------------------------
  const countries = topCountriesFor(data, win as 'L7', 12);
  // CountryRollup reports the current period plus a delta, not the prior count,
  // so the volume floor is applied to the current users instead.
  const countryDrops = countries.filter(
    (c) => c.deltaUsersPct !== null && c.deltaUsersPct <= -0.3 && c.users >= 5,
  );
  if (countryDrops.length > 0) {
    items.push({
      severity: 'warning',
      source: 'Overview · countries',
      headline: `${countryDrops.length} nước giảm trên 30% users`,
      detail: countryDrops
        .slice(0, 5)
        .map((c) => `${c.country} ${c.users} users (${pct(c.deltaUsersPct as number)})`)
        .join(' · '),
      weight: countryDrops.reduce((s, c) => s + c.users, 0),
    });
  }

  // ---- Google Ads ---------------------------------------------------------
  const gads = buildGoogleAdsReport(data.googleAds);
  if (gads) {
    if (gads.lostToBudgetCost > 0 || gads.lostToRankCost > 0) {
      items.push({
        severity: 'warning',
        source: 'Google Ads',
        headline: 'Đang mất lượt hiển thị',
        detail:
          `Vì hết ngân sách: ${usd(gads.lostToBudgetCost)} · vì thua thứ hạng: ${usd(gads.lostToRankCost)}` +
          ` (quy đổi từ ${gads.currency}).`,
        action: 'Mất vì ngân sách thì tăng budget; mất vì thứ hạng thì tăng bid hoặc sửa chất lượng.',
        weight: gads.lostToBudgetCost + gads.lostToRankCost,
      });
    }
    const deep = buildGoogleAdsDeep(data);
    if (deep.country && deep.country.excludedCostUsd > 0) {
      const list = deep.country.rows.filter((r) => r.excluded && r.costUsd > 0).slice(0, 5);
      items.push({
        severity: 'critical',
        source: 'Google Ads · nước',
        headline: `${usd(deep.country.excludedCostUsd)} chi vào nước đang exclude bên App Store`,
        detail: list.map((r) => `${r.country} ${usd(r.costUsd)}`).join(' · '),
        action: 'Loại các nước này khỏi target của campaign Google, hoặc xác nhận đây là chủ ý.',
        weight: deep.country.excludedCostUsd * 3,
      });
    }
    if (deep.country && deep.country.noRevenueCostUsd > 0) {
      items.push({
        severity: 'warning',
        source: 'Google Ads · nước',
        headline: `${usd(deep.country.noRevenueCostUsd)} chi vào ${deep.country.noRevenueCount} nước chưa ra doanh thu`,
        detail: 'Không có dòng doanh thu nào cho các nước này trong kỳ gần nhất của khối PerGeo.',
        weight: deep.country.noRevenueCostUsd,
      });
    }
    if (deep.quality && deep.quality.weakCostUsd > 0) {
      const worst = deep.quality.byCulprit.filter((c) => c.keywords > 0).sort((a, b) => b.costUsd - a.costUsd)[0];
      if (worst) {
        items.push({
          severity: 'warning',
          source: 'Google Ads · Quality Score',
          headline: `${usd(deep.quality.weakCostUsd)} đang chi vào keyword có điểm yếu QS`,
          detail: `Điểm yếu tốn tiền nhất: ${worst.culprit === 'lp' ? 'landing page' : worst.culprit === 'ad' ? 'độ liên quan của ad' : 'CTR kỳ vọng'} — ${worst.keywords} keyword, ${usd(worst.costUsd)}.`,
          weight: deep.quality.weakCostUsd,
        });
      }
    }
    if (deep.bidding && deep.bidding.overTargetCount > 0) {
      const over = deep.bidding.rows.filter((r) => r.vsTarget !== null && r.vsTarget > 0).slice(0, 3);
      items.push({
        severity: 'warning',
        source: 'Google Ads · bid',
        headline: `${deep.bidding.overTargetCount} camp trả cao hơn target CPA của chính nó`,
        detail: over
          .map((r) => `${r.campaignName} (${usd(r.actualCpaUsd ?? 0)} vs target ${usd(r.targetCpaUsd ?? 0)})`)
          .join(' · '),
        weight: over.reduce((s, r) => s + r.costUsd, 0),
      });
    }
  }

  // ---- install origin -----------------------------------------------------
  const origin = buildInstallOrigin(data);
  if (origin && origin.rows.length > 0) {
    const top = origin.rows.slice(0, 5);
    items.push({
      severity: 'info',
      source: 'Nguồn Install',
      headline: `${origin.installs} install truy được về ${origin.keywords} keyword × ${origin.countries} nước`,
      detail: top
        .map((r) => `${r.keyword}/${r.country} ${r.installs} ins (pos ${r.position === null ? '—' : r.position.toFixed(1)})`)
        .join(' · '),
      weight: 1,
    });
  }

  items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.weight - a.weight);

  const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0, good: 0 };
  items.forEach((i) => { counts[i.severity] += 1; });

  const MARK: Record<Severity, string> = { critical: '🔴', warning: '🟡', good: '🟢', info: '⚪' };
  const text = [
    `TÓM TẮT ${windowDays} NGÀY — ${health.from || ''} → ${health.to || ''}`,
    `${counts.critical} nghiêm trọng · ${counts.warning} cần xem · ${counts.good} tín hiệu tốt`,
    '',
    ...items.map((i) =>
      [`${MARK[i.severity]} [${i.source}] ${i.headline}`, `   ${i.detail}`, i.action ? `   → ${i.action}` : '']
        .filter(Boolean)
        .join('\n'),
    ),
  ].join('\n');

  return {
    window: win,
    generatedFor: health.to || '',
    items,
    counts,
    text,
  };
}
