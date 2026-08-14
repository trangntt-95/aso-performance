import type {
  AdDestination,
  GoogleAdsPayload,
} from '@/lib/sheets/googleAdsTypes';

// Turn the Google Ads export into the few things worth acting on.
//
// The account's own "conversions" number is a mix of page views, add-to-carts
// and installs — 341 of the 425 counted in the first two weeks were page views.
// Reporting cost-per-conversion against it would flatter the channel and make it
// look several times cheaper than the app-store side. So installs are counted
// separately, from the conversion ACTIONS that actually represent an install.

/** Conversion actions that mean an app was installed, not a page was seen. */
const INSTALL_ACTION_PATTERNS = [/app_install/i, /shopify_app_install/i];

export function isInstallAction(actionName: string): boolean {
  return INSTALL_ACTION_PATTERNS.some((re) => re.test(actionName));
}

export interface Totals {
  impressions: number;
  clicks: number;
  cost: number;
  /** Google's blended conversion count — kept for reference, not for CPA. */
  conversions: number;
  /** Installs only, from the install conversion actions. */
  installs: number;
  ctr: number | null;
  cpc: number | null;
  /** Cost per INSTALL. Null until at least one install lands. */
  cpi: number | null;
}

function totalsOf(rows: { impressions: number; clicks: number; cost: number; conversions: number }[], installs: number): Totals {
  let impressions = 0, clicks = 0, cost = 0, conversions = 0;
  for (const r of rows) {
    impressions += r.impressions;
    clicks += r.clicks;
    cost += r.cost;
    conversions += r.conversions;
  }
  return {
    impressions, clicks, cost, conversions, installs,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpc: clicks > 0 ? cost / clicks : null,
    cpi: installs > 0 ? cost / installs : null,
  };
}

export type ShareVerdict = 'budget' | 'rank' | 'healthy' | 'unknown';

export interface CampaignRow {
  name: string;
  status: string;
  channel: string;
  days: number;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  installs: number;
  ctr: number | null;
  cpc: number | null;
  cpi: number | null;
  /** Average daily budget across the days the campaign ran. */
  budget: number | null;
  /** Averaged impression share and where the rest went. */
  is: number | null;
  lostBudget: number | null;
  lostRank: number | null;
  absTopIs: number | null;
  /** What is capping this campaign, and therefore what to change. */
  verdict: ShareVerdict;
  /** Share of this campaign's clicks that landed on the Shopify app listing. */
  appstoreClickShare: number | null;
}

export interface DestinationSplit {
  destination: AdDestination;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  installs: number;
  cpc: number | null;
}

export interface SearchTermRow {
  term: string;
  status: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  cpc: number | null;
  /** Matched but never added as a keyword — the actionable ones. */
  notAdded: boolean;
}

export interface DailyPoint {
  date: string;
  cost: number;
  clicks: number;
  impressions: number;
  installs: number;
}

export interface ConvActionRow {
  action: string;
  category: string;
  conversions: number;
  isInstall: boolean;
}

export interface GoogleAdsReport {
  currency: string;
  account: string;
  from: string;
  to: string;
  days: number;
  totals: Totals;
  campaigns: CampaignRow[];
  destinations: DestinationSplit[];
  searchTerms: SearchTermRow[];
  daily: DailyPoint[];
  convActions: ConvActionRow[];
  /** Money that impression share says is being left on the table. */
  lostToBudgetCost: number;
  lostToRankCost: number;
}

/** Impression share lost to budget above this reads as "raise the budget". */
const LOST_BUDGET_THRESHOLD = 0.15;
/** Impression share lost to rank above this reads as "raise the bid". */
const LOST_RANK_THRESHOLD = 0.25;

export function buildGoogleAdsReport(p: GoogleAdsPayload): GoogleAdsReport | null {
  if (!p || p.campaigns.length === 0) return null;

  const dates = Array.from(new Set(p.campaigns.map((c) => c.date))).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];

  // Installs per campaign, from the install-type conversion actions only.
  const installsByCamp = new Map<string, number>();
  const installsByDate = new Map<string, number>();
  let installsTotal = 0;
  for (const a of p.convActions) {
    if (!isInstallAction(a.actionName)) continue;
    installsByCamp.set(a.campaignName, (installsByCamp.get(a.campaignName) ?? 0) + a.conversions);
    installsByDate.set(a.date, (installsByDate.get(a.date) ?? 0) + a.conversions);
    installsTotal += a.conversions;
  }

  // Impression share, averaged over the days a campaign actually reported it —
  // a day with no row would otherwise drag the average toward zero.
  interface ShareAcc { is: number; lb: number; lr: number; top: number; n: number }
  const shareByCamp = new Map<string, ShareAcc>();
  for (const s of p.share) {
    const e = shareByCamp.get(s.campaignName) ?? { is: 0, lb: 0, lr: 0, top: 0, n: 0 };
    if (s.is === null) continue;
    e.is += s.is;
    e.lb += s.isLostBudget ?? 0;
    e.lr += s.isLostRank ?? 0;
    e.top += s.absTopIs ?? 0;
    e.n++;
    shareByCamp.set(s.campaignName, e);
  }

  // Clicks by destination, per campaign and overall.
  const destTotals = new Map<AdDestination, { impressions: number; clicks: number; cost: number; conversions: number }>();
  const appstoreClicksByCamp = new Map<string, number>();
  const allClicksByCamp = new Map<string, number>();
  for (const l of p.landing) {
    const d = destTotals.get(l.destination) ?? { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    d.impressions += l.impressions;
    d.clicks += l.clicks;
    d.cost += l.cost;
    d.conversions += l.conversions;
    destTotals.set(l.destination, d);
    allClicksByCamp.set(l.campaignName, (allClicksByCamp.get(l.campaignName) ?? 0) + l.clicks);
    if (l.destination === 'appstore') {
      appstoreClicksByCamp.set(l.campaignName, (appstoreClicksByCamp.get(l.campaignName) ?? 0) + l.clicks);
    }
  }

  // Per-campaign aggregation.
  interface CampAcc {
    status: string; channel: string; days: Set<string>;
    impressions: number; clicks: number; cost: number; conversions: number;
    budgetSum: number; budgetN: number;
  }
  const byCamp = new Map<string, CampAcc>();
  for (const c of p.campaigns) {
    const e = byCamp.get(c.campaignName) ?? {
      status: c.status, channel: c.channel, days: new Set<string>(),
      impressions: 0, clicks: 0, cost: 0, conversions: 0, budgetSum: 0, budgetN: 0,
    };
    e.status = c.status || e.status;
    e.days.add(c.date);
    e.impressions += c.impressions;
    e.clicks += c.clicks;
    e.cost += c.cost;
    e.conversions += c.conversions;
    if (c.budget > 0) { e.budgetSum += c.budget; e.budgetN++; }
    byCamp.set(c.campaignName, e);
  }

  const campaigns: CampaignRow[] = [];
  let lostToBudgetCost = 0;
  let lostToRankCost = 0;
  byCamp.forEach((e, name) => {
    const sh = shareByCamp.get(name);
    const is = sh && sh.n > 0 ? sh.is / sh.n : null;
    const lostBudget = sh && sh.n > 0 ? sh.lb / sh.n : null;
    const lostRank = sh && sh.n > 0 ? sh.lr / sh.n : null;
    const installs = installsByCamp.get(name) ?? 0;

    // What is holding this campaign back — budget or rank? Whichever is losing
    // more share wins, and only above a threshold so noise doesn't produce a
    // recommendation.
    let verdict: ShareVerdict = 'unknown';
    if (lostBudget !== null || lostRank !== null) {
      const lb = lostBudget ?? 0;
      const lr = lostRank ?? 0;
      if (lb >= LOST_BUDGET_THRESHOLD && lb >= lr) verdict = 'budget';
      else if (lr >= LOST_RANK_THRESHOLD && lr > lb) verdict = 'rank';
      else verdict = 'healthy';
    }
    // Rough size of the opportunity: what the same cost-per-impression would
    // have bought had the lost share been captured.
    if (verdict === 'budget' && lostBudget) lostToBudgetCost += e.cost * (lostBudget / Math.max(0.01, is ?? 1));
    if (verdict === 'rank' && lostRank) lostToRankCost += e.cost * (lostRank / Math.max(0.01, is ?? 1));

    const allClicks = allClicksByCamp.get(name) ?? 0;
    campaigns.push({
      name,
      status: e.status,
      channel: e.channel,
      days: e.days.size,
      impressions: e.impressions,
      clicks: e.clicks,
      cost: e.cost,
      conversions: e.conversions,
      installs,
      ctr: e.impressions > 0 ? e.clicks / e.impressions : null,
      cpc: e.clicks > 0 ? e.cost / e.clicks : null,
      cpi: installs > 0 ? e.cost / installs : null,
      budget: e.budgetN > 0 ? e.budgetSum / e.budgetN : null,
      is,
      lostBudget,
      lostRank,
      absTopIs: sh && sh.n > 0 ? sh.top / sh.n : null,
      verdict,
      appstoreClickShare: allClicks > 0 ? (appstoreClicksByCamp.get(name) ?? 0) / allClicks : null,
    });
  });
  campaigns.sort((a, b) => b.cost - a.cost);

  // Installs can't be split by landing page — the export doesn't carry the
  // action name there — so the destination table reports clicks and cost only,
  // plus Google's blended conversions clearly labelled as such.
  const destinations: DestinationSplit[] = (['appstore', 'website', 'other'] as AdDestination[])
    .map((d) => {
      const t = destTotals.get(d);
      if (!t) return null;
      return {
        destination: d,
        impressions: t.impressions,
        clicks: t.clicks,
        cost: t.cost,
        conversions: t.conversions,
        installs: 0,
        cpc: t.clicks > 0 ? t.cost / t.clicks : null,
      };
    })
    .filter((x): x is DestinationSplit => x !== null && (x.clicks > 0 || x.cost > 0));

  // Search terms, collapsed across days.
  interface TermAcc { status: string; impressions: number; clicks: number; cost: number; conversions: number }
  const byTerm = new Map<string, TermAcc>();
  for (const t of p.searchTerms) {
    const key = t.searchTerm.toLowerCase();
    const e = byTerm.get(key) ?? { status: t.termStatus, impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    // NONE = matched but not in the account; that's the status worth surfacing,
    // so it wins over ADDED when a term shows both across days.
    if (t.termStatus === 'NONE') e.status = 'NONE';
    e.impressions += t.impressions;
    e.clicks += t.clicks;
    e.cost += t.cost;
    e.conversions += t.conversions;
    byTerm.set(key, e);
  }
  const searchTerms: SearchTermRow[] = Array.from(byTerm.entries())
    .map(([term, e]) => ({
      term,
      status: e.status,
      impressions: e.impressions,
      clicks: e.clicks,
      cost: e.cost,
      conversions: e.conversions,
      cpc: e.clicks > 0 ? e.cost / e.clicks : null,
      notAdded: e.status === 'NONE',
    }))
    .sort((a, b) => b.cost - a.cost || b.clicks - a.clicks);

  // Daily trend.
  const byDate = new Map<string, DailyPoint>();
  for (const c of p.campaigns) {
    const e = byDate.get(c.date) ?? { date: c.date, cost: 0, clicks: 0, impressions: 0, installs: 0 };
    e.cost += c.cost;
    e.clicks += c.clicks;
    e.impressions += c.impressions;
    byDate.set(c.date, e);
  }
  installsByDate.forEach((v, d) => {
    const e = byDate.get(d);
    if (e) e.installs = v;
  });
  const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  // What "conversions" is actually made of.
  const byAction = new Map<string, ConvActionRow>();
  for (const a of p.convActions) {
    const e = byAction.get(a.actionName) ?? {
      action: a.actionName,
      category: a.actionCat,
      conversions: 0,
      isInstall: isInstallAction(a.actionName),
    };
    e.conversions += a.conversions;
    byAction.set(a.actionName, e);
  }
  const convActions = Array.from(byAction.values()).sort((a, b) => b.conversions - a.conversions);

  return {
    currency: p.meta?.currency || '',
    account: p.meta?.account || '',
    from,
    to,
    days: dates.length,
    totals: totalsOf(p.campaigns, installsTotal),
    campaigns,
    destinations,
    searchTerms,
    daily,
    convActions,
    lostToBudgetCost,
    lostToRankCost,
  };
}

export const VERDICT_META: Record<ShareVerdict, { label: string; action: string; tone: string }> = {
  budget: {
    label: '💰 Hết ngân sách',
    action: 'Tăng ngân sách — quảng cáo đủ sức thắng nhưng bị cắt vì hết tiền trong ngày.',
    tone: 'bg-amber-100 text-amber-800',
  },
  rank: {
    label: '📉 Thua thứ hạng',
    action: 'Tăng bid hoặc cải thiện chất lượng — bị đối thủ đẩy xuống, không phải do ngân sách.',
    tone: 'bg-rose-100 text-rose-800',
  },
  healthy: {
    label: '✓ Không bị chặn',
    action: 'Đang lấy được phần lớn lượt hiển thị có thể lấy.',
    tone: 'bg-emerald-100 text-emerald-800',
  },
  unknown: {
    label: '— chưa có số',
    action: 'Chưa có dữ liệu impression share cho camp này.',
    tone: 'bg-slate-100 text-slate-500',
  },
};
