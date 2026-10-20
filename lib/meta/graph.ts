// Kéo insights Meta Ads của app Proveny thẳng từ Graph API bằng System User
// token. Chạy được khi env có META_ACCESS_TOKEN + META_AD_ACCOUNT_ID; không có
// thì route trả snapshot trong repo.
//
// Mỗi lần fetch là 6 request (daily, campaigns, ads, country, placement,
// age×gender), cache trong tiến trình 15 phút để không đập API mỗi lượt mở tab.

import type {
  MetaAdRow,
  MetaCampaignRow,
  MetaCountryRow,
  MetaDailyRow,
  MetaDemoRow,
  MetaPlacementRow,
  MetaProvenyPayload,
} from './types';

const API = 'https://graph.facebook.com/v21.0';
const DATE_PRESET = 'last_30d';
const CACHE_TTL_MS = 15 * 60 * 1000;

const INSIGHT_FIELDS = [
  'spend',
  'impressions',
  'reach',
  'frequency',
  'clicks',
  'inline_link_clicks',
  'actions',
  'action_values',
  'conversions',
  'conversion_values',
  'video_play_actions',
  'video_thruplay_watched_actions',
  'video_p25_watched_actions',
  'video_p50_watched_actions',
  'video_p75_watched_actions',
  'video_p100_watched_actions',
  'video_avg_time_watched_actions',
].join(',');

// Event pixel/custom conversion của Proveny. Custom conversion id lấy từ Ads
// Manager (Create Video, Visit App); custom pixel event có tên luôn.
const EV = {
  firstVideoCreated: ['offsite_conversion.fb_pixel_custom.FirstVideoCreated'],
  createVideo: ['offsite_conversion.custom.1127476886367994'],
  visitApp: ['offsite_conversion.custom.4053074454987565'],
  startTrial: ['start_trial_total', 'start_trial_website', 'offsite_conversion.fb_pixel_start_trial', 'start_trial'],
  subscribe: ['subscribe_total', 'subscribe_website', 'offsite_conversion.fb_pixel_subscribe', 'subscribe'],
  registration: ['complete_registration', 'omni_complete_registration', 'offsite_conversion.fb_pixel_complete_registration'],
  purchase: ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'],
  lpv: ['landing_page_view', 'omni_landing_page_view'],
  engagement: ['post_engagement'],
} as const;

type Action = { action_type: string; value: string };
interface RawInsight {
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: Action[];
  action_values?: Action[];
  /** Pixel standard/custom events (FirstVideoCreated, start_trial, subscribe) come back here, not in actions. */
  conversions?: Action[];
  conversion_values?: Action[];
  video_play_actions?: Action[];
  video_thruplay_watched_actions?: Action[];
  video_p25_watched_actions?: Action[];
  video_p50_watched_actions?: Action[];
  video_p75_watched_actions?: Action[];
  video_p100_watched_actions?: Action[];
  video_avg_time_watched_actions?: Action[];
  country?: string;
  publisher_platform?: string;
  platform_position?: string;
  device_platform?: string;
  age?: string;
  gender?: string;
}

const n = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null) return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const act = (list: Action[] | undefined, types: readonly string[]): number => {
  if (!list) return 0;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return n(hit.value);
  }
  return 0;
};
// FirstVideoCreated / start_trial / subscribe live in `conversions`; custom
// conversions (Create Video, Visit App) and purchase live in `actions`. Look in both.
const conv = (r: RawInsight, types: readonly string[]): number => act(r.conversions, types) || act(r.actions, types);

// Video metrics come back as a one-element list keyed 'video_view'.
const vid = (list: Action[] | undefined): number => (list && list[0] ? n(list[0].value) : 0);

type PromotedObject = { custom_conversion_id?: string; custom_event_type?: string; custom_event_str?: string; pixel_rule?: string };

/** Event mà adset tối ưu, đọc từ promoted_object; null khi không nhận ra. */
function optimisedEvent(po: PromotedObject | undefined): 'FirstVideoCreated' | 'Create Video' | 'Visit App' | null {
  if (!po) return null;
  if (po.custom_conversion_id === '1127476886367994') return 'Create Video';
  if (po.custom_conversion_id === '4053074454987565') return 'Visit App';
  const s = `${po.custom_event_str ?? ''} ${po.pixel_rule ?? ''}`;
  if (/FirstVideoCreated/i.test(s)) return 'FirstVideoCreated';
  return null;
}

// Kết quả chính = event campaign/adset đang tối ưu (promoted_object). Không
// đọc được thì lấy event có số lớn nhất trong ba event của Proveny.
function primaryResult(r: RawInsight, po?: PromotedObject): { type: string; value: number } {
  const counts = {
    FirstVideoCreated: conv(r, EV.firstVideoCreated),
    'Create Video': conv(r, EV.createVideo),
    'Visit App': conv(r, EV.visitApp),
  } as const;
  const chosen = optimisedEvent(po);
  if (chosen) return { type: chosen, value: counts[chosen] };
  let best: keyof typeof counts = 'FirstVideoCreated';
  for (const k of Object.keys(counts) as (keyof typeof counts)[]) if (counts[k] > counts[best]) best = k;
  return { type: best, value: counts[best] };
}

function base(r: RawInsight) {
  return {
    spend: n(r.spend),
    impressions: n(r.impressions),
    reach: n(r.reach),
    clicks: n(r.clicks),
    linkClicks: n(r.inline_link_clicks),
    lpv: act(r.actions, EV.lpv),
    plays: vid(r.video_play_actions),
    thruplays: vid(r.video_thruplay_watched_actions),
    p25: vid(r.video_p25_watched_actions),
    p100: vid(r.video_p100_watched_actions),
    engagement: act(r.actions, EV.engagement),
  };
}

async function get<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; data?: unknown };
  if (!res.ok || body.error) {
    throw new Error(`Meta Graph ${path}: ${body.error?.message ?? res.statusText}`);
  }
  return body as T;
}

interface Paged<T> {
  data: T[];
  paging?: { next?: string };
}

async function getAll<T>(path: string, params: Record<string, string>, token: string, maxPages = 5): Promise<T[]> {
  const out: T[] = [];
  let page = await get<Paged<T>>(path, { ...params, limit: params.limit ?? '500' }, token);
  out.push(...page.data);
  let i = 1;
  while (page.paging?.next && i < maxPages) {
    const res = await fetch(page.paging.next, { cache: 'no-store' });
    page = (await res.json()) as Paged<T>;
    if (!page.data) break;
    out.push(...page.data);
    i++;
  }
  return out;
}

export function metaGraphConfigured(): boolean {
  return !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

let cache: { at: number; payload: MetaProvenyPayload } | null = null;

export async function fetchMetaProvenyFromGraph(): Promise<MetaProvenyPayload> {
  const token = process.env.META_ACCESS_TOKEN!;
  const account = process.env.META_AD_ACCOUNT_ID!.replace(/^act_/, '');
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload;
  const act_ = `act_${account}`;

  const [dailyRaw, campaignsRaw, adsRaw, countryRaw, placementRaw, demoRaw] = await Promise.all([
    getAll<RawInsight>(`${act_}/insights`, { level: 'account', date_preset: DATE_PRESET, time_increment: '1', fields: INSIGHT_FIELDS }, token),
    getAll<{
      id: string;
      name: string;
      effective_status: string;
      daily_budget?: string;
      created_time?: string;
      adsets?: { data: { promoted_object?: PromotedObject }[] };
      insights?: { data: RawInsight[] };
    }>(`${act_}/campaigns`, {
      fields: `id,name,effective_status,daily_budget,created_time,adsets.limit(5){promoted_object},insights.date_preset(${DATE_PRESET}){${INSIGHT_FIELDS}}`,
      limit: '100',
    }, token),
    getAll<{
      id: string;
      name: string;
      effective_status: string;
      created_time?: string;
      campaign?: { id: string; name: string };
      adset?: { name: string; promoted_object?: PromotedObject };
      insights?: { data: RawInsight[] };
    }>(`${act_}/ads`, {
      fields: `id,name,effective_status,created_time,campaign{id,name},adset{name,promoted_object},insights.date_preset(${DATE_PRESET}){${INSIGHT_FIELDS}}`,
      limit: '200',
    }, token),
    getAll<RawInsight>(`${act_}/insights`, { level: 'account', date_preset: DATE_PRESET, breakdowns: 'country', fields: INSIGHT_FIELDS }, token),
    getAll<RawInsight>(`${act_}/insights`, {
      level: 'account',
      date_preset: DATE_PRESET,
      breakdowns: 'publisher_platform,platform_position,device_platform',
      fields: INSIGHT_FIELDS,
    }, token),
    getAll<RawInsight>(`${act_}/insights`, { level: 'account', date_preset: DATE_PRESET, breakdowns: 'age,gender', fields: INSIGHT_FIELDS }, token),
  ]);

  const daily: MetaDailyRow[] = dailyRaw
    .map((r) => ({
      date: r.date_start ?? '',
      ...base(r),
      purchases: act(r.actions, EV.purchase),
      purchaseValue: act(r.action_values, EV.purchase),
      firstVideoCreated: conv(r, EV.firstVideoCreated),
      startTrials: conv(r, EV.startTrial),
      subscribes: conv(r, EV.subscribe),
      registrations: conv(r, EV.registration),
    }))
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const campaigns: MetaCampaignRow[] = campaignsRaw.map((c) => {
    const r = c.insights?.data?.[0] ?? {};
    const pr = primaryResult(r, c.adsets?.data?.[0]?.promoted_object);
    return {
      id: c.id,
      name: c.name,
      status: c.effective_status,
      dailyBudget: n(c.daily_budget) / 100,
      createdAt: (c.created_time ?? '').slice(0, 10),
      ...base(r),
      frequency: n(r.frequency),
      resultType: pr.type,
      results: pr.value,
      purchases: act(r.actions, EV.purchase),
      startTrials: conv(r, EV.startTrial),
      subscribes: conv(r, EV.subscribe),
      firstVideoCreated: conv(r, EV.firstVideoCreated),
      registrations: conv(r, EV.registration),
    };
  });

  const ads: MetaAdRow[] = adsRaw.map((a) => {
    const r = a.insights?.data?.[0] ?? {};
    const pr = primaryResult(r, a.adset?.promoted_object);
    return {
      id: a.id,
      name: a.name,
      campaignId: a.campaign?.id ?? '',
      campaignName: a.campaign?.name ?? '',
      adsetName: a.adset?.name ?? '',
      status: a.effective_status,
      createdAt: (a.created_time ?? '').slice(0, 10),
      ...base(r),
      frequency: n(r.frequency),
      resultType: pr.type,
      results: pr.value,
      p50: vid(r.video_p50_watched_actions),
      p75: vid(r.video_p75_watched_actions),
      avgWatchSec: vid(r.video_avg_time_watched_actions),
      saves: act(r.actions, ['post_save']),
      comments: act(r.actions, ['comment']),
      purchases: act(r.actions, EV.purchase),
    };
  });

  const countries: MetaCountryRow[] = countryRaw.map((r) => ({ country: r.country ?? '??', ...base(r) }));
  const placements: MetaPlacementRow[] = placementRaw.map((r) => ({
    platform: r.publisher_platform ?? 'unknown',
    position: r.platform_position ?? 'unknown',
    device: r.device_platform ?? 'unknown',
    ...base(r),
  }));
  const demographics: MetaDemoRow[] = demoRaw.map((r) => ({ age: r.age ?? '?', gender: r.gender ?? 'unknown', ...base(r) }));

  const dates = daily.map((d) => d.date);
  const payload: MetaProvenyPayload = {
    account: { id: account, name: 'Proveny', currency: 'USD', business: 'FireGroup Technology JSC' },
    source: 'graph_api',
    fetchedAt: new Date().toISOString(),
    dateRange: { since: dates[0] ?? '', until: dates[dates.length - 1] ?? '' },
    daily,
    campaigns,
    ads,
    countries,
    placements,
    demographics,
  };
  cache = { at: Date.now(), payload };
  return payload;
}
