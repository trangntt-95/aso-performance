import { tool } from 'ai';
import { z } from 'zod';
import type { SheetPayload } from '@/lib/sheets/types';
import {
  computeKpis,
  marketTrajectory,
  channelSplit,
  topCountriesFor,
  categoryShareFor,
  topVolumeMovers,
  topContributors,
  channelSnapshotForWindow,
  dailyTrend,
  windowDays,
  type OverviewWindow,
} from '@/components/overview/aggregate';
import { expectedAdsInstalls, runrateAdsToMonthEnd } from '@/lib/config/ads-targets';
import { buildWeeklyDigest } from '@/lib/market/weeklyDigest';
import { analyseCampHealth } from '@/lib/market/campHealth';
import { buildCpiCapOverview } from '@/lib/market/cpiCapOverview';
import { buildGoogleAdsReport } from '@/lib/market/googleAdsReport';
import { buildGoogleAdsDeep } from '@/lib/market/googleAdsDeep';
import { buildInstallOrigin } from '@/lib/market/installOrigin';

const WindowSchema = z.enum(['L3', 'L7', 'L14', 'L30', 'L90']);
const SurfaceSchema = z.enum(['all', 'organic', 'paid']).optional();
const MetricSchema = z.enum(['users', 'getApp']).optional();

function round(n: number | null | undefined, digits = 1): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

export function makeDashboardTools(data: SheetPayload) {
  return {
    get_overview: tool({
      description:
        'Get the top-line KPI snapshot for a window (Users, Install, CR, paid Ads target + runrate). Use for "tổng quan tuần này" / "what does this week look like" style questions.',
      inputSchema: z.object({
        window: WindowSchema.describe('Time window (L3=3d, L7=7d, L14=14d, L30=30d, L90=90d)'),
        surface: SurfaceSchema,
        country: z.string().nullish().describe('Optional country to filter to'),
      }),
      execute: async ({ window, surface, country }) => {
        const filters = { surface: surface ?? 'all', country: country ?? null };
        const w = window as OverviewWindow;
        const kpis = computeKpis(data, w, filters);
        const snap = channelSnapshotForWindow(data, w, filters);
        const days = windowDays(w);
        const expected = expectedAdsInstalls(days);
        const adsPct = snap && expected ? snap.paidGetApp / expected : null;
        const runrate = snap ? runrateAdsToMonthEnd(days, snap.paidGetApp) : null;
        const totalCr = kpis.usersL > 0 ? kpis.getAppL / kpis.usersL : null;

        return {
          window,
          surface_filter: surface ?? 'all',
          country_filter: country ?? null,
          users: kpis.usersL,
          users_delta_pct: round(kpis.usersDeltaPct * 100),
          installs_getApp: kpis.getAppL,
          installs_delta_pct: round(kpis.getAppDeltaPct * 100),
          cr_total_pct: round((totalCr ?? 0) * 100, 2),
          alert_count_in_window: kpis.totalAlerts,
          action_queue_counts: {
            P0: kpis.p0Count, P1: kpis.p1Count, P2: kpis.p2Count, P3: kpis.p3Count,
          },
          channel_split: snap
            ? {
                organic_users: snap.organicUsers,
                organic_installs: snap.organicGetApp,
                organic_cr_pct: round(snap.organicCr * 100, 2),
                paid_users: snap.paidUsers,
                paid_installs: snap.paidGetApp,
                paid_cr_pct: round(snap.paidCr * 100, 2),
              }
            : null,
          ads_target: expected
            ? {
                actual_paid_installs: snap?.paidGetApp ?? 0,
                expected: round(expected),
                achievement_pct: round((adsPct ?? 0) * 100),
                runrate_eom: runrate
                  ? {
                      projected_installs: round(runrate.projectedInstalls),
                      target_installs: round(runrate.targetInstalls),
                      pct: round(runrate.pct * 100),
                      mode: runrate.mode,
                      effective_days: runrate.effectiveDays,
                    }
                  : null,
              }
            : null,
        };
      },
    }),

    get_top_keywords: tool({
      description:
        'Get top contributing keywords by Users or Install in a window. Returns up to 30 keywords sorted by absolute volume.',
      inputSchema: z.object({
        metric: z.enum(['users', 'getApp']).describe('Sort metric'),
        window: WindowSchema,
        surface: SurfaceSchema,
        country: z.string().nullish(),
        limit: z.number().min(1).max(50).default(15),
      }),
      execute: async ({ metric, window, surface, country, limit }) => {
        const filters = { surface: surface ?? 'all', country: country ?? null };
        const result = topContributors(data, window as OverviewWindow, metric, limit, filters);
        return {
          window,
          metric,
          total_in_window: result.total,
          full_count_keywords: result.fullCount,
          shown: result.rows.length,
          keywords: result.rows.map((r) => ({
            keyword: r.keyword,
            category: r.category,
            surface: r.surface,
            value: r.value,
            share_pct: round(r.sharePct),
          })),
        };
      },
    }),

    get_country_breakdown: tool({
      description:
        'Top countries ranked by Users or Install in a window. Returns top 20.',
      inputSchema: z.object({
        window: WindowSchema,
        metric: MetricSchema.default('users'),
        surface: SurfaceSchema,
      }),
      execute: async ({ window, metric, surface }) => {
        const filters = { surface: surface ?? 'all' };
        const rows = topCountriesFor(data, window as OverviewWindow, 20, filters);
        return {
          window,
          metric,
          countries: rows
            .sort((a, b) => (metric === 'getApp' ? b.getApp - a.getApp : b.users - a.users))
            .map((c) => ({
              country: c.country,
              users: c.users,
              installs: c.getApp,
              cr_pct: round(c.cr * 100, 2),
              alert_count: c.alertCount,
            })),
        };
      },
    }),

    get_category_share: tool({
      description:
        'Share of demand by keyword category (Brand, Competitor, Feature, etc.) in a window.',
      inputSchema: z.object({
        window: WindowSchema,
        metric: MetricSchema.default('users'),
        surface: SurfaceSchema,
        country: z.string().nullish(),
      }),
      execute: async ({ window, metric, surface, country }) => {
        const filters = { surface: surface ?? 'all', country: country ?? null };
        const rows = categoryShareFor(data, window as OverviewWindow, filters);
        const total = rows.reduce((s, r) => s + (metric === 'getApp' ? r.getApp : r.users), 0);
        return {
          window,
          metric,
          total,
          categories: rows
            .map((c) => ({
              category: c.category,
              users: c.users,
              installs: c.getApp,
              share_pct:
                metric === 'getApp'
                  ? round(total > 0 ? (c.getApp / total) * 100 : 0)
                  : round(c.share * 100),
            }))
            .sort((a, b) => (b.share_pct ?? 0) - (a.share_pct ?? 0)),
        };
      },
    }),

    get_volume_movers: tool({
      description:
        'Keywords with the biggest volume change (positive or negative) in a window, with diagnostic info (rank delta, CR delta, install delta). Already excludes Vietnam + India.',
      inputSchema: z.object({
        window: WindowSchema,
        surface: SurfaceSchema,
        country: z.string().nullish(),
        limit: z.number().min(1).max(30).default(10),
      }),
      execute: async ({ window, surface, country, limit }) => {
        const rows = topVolumeMovers(data, window as OverviewWindow, {
          limit,
          surface: surface ?? 'all',
          country: country ?? null,
        });
        return {
          window,
          surface_filter: surface ?? 'all',
          country_filter: country ?? null,
          movers: rows.map((m) => ({
            keyword: m.keyword,
            country: m.country,
            surface: m.surface,
            category: m.category,
            direction: m.direction,
            users_prior: m.usersP,
            users_latest: m.usersL,
            users_delta_pct: round(m.deltaUsersPct * 100),
            installs_prior: m.getAppP,
            installs_latest: m.getAppL,
            installs_delta_pct:
              m.deltaGetAppPct !== null ? round(m.deltaGetAppPct * 100) : null,
            cr_prior_pct: m.crP !== null ? round(m.crP * 100, 2) : null,
            cr_latest_pct: m.crL !== null ? round(m.crL * 100, 2) : null,
            cr_delta_pct: m.deltaCrPct !== null ? round(m.deltaCrPct * 100) : null,
            pos_prior: m.posP,
            pos_latest: m.posL,
            pos_delta:
              m.posL !== null && m.posP !== null ? round(m.posL - m.posP) : null,
            alert: m.alert,
          })),
        };
      },
    }),

    get_market_trajectory: tool({
      description:
        'Δ Users %, Δ Install %, Δ Weighted % across all windows (L3 → L90) — useful to see if the market is accelerating or decelerating.',
      inputSchema: z.object({
        surface: SurfaceSchema,
        country: z.string().nullish(),
      }),
      execute: async ({ surface, country }) => {
        const filters = { surface: surface ?? 'all', country: country ?? null };
        const points = marketTrajectory(data, filters);
        return {
          surface_filter: surface ?? 'all',
          country_filter: country ?? null,
          windows: points.map((p) => ({
            window: p.window,
            users_delta_pct: round(p.usersDelta),
            getApp_delta_pct: round(p.getAppDelta),
            weighted_delta_pct: round(p.weightedDelta),
            verdict: p.verdict,
          })),
        };
      },
    }),

    get_channel_split: tool({
      description:
        'Organic vs Paid share by window (users + installs). Use to see how the mix is shifting.',
      inputSchema: z.object({}),
      execute: async () => ({
        windows: channelSplit(data).map((s) => ({
          window: s.window,
          organic_users: s.organicUsers,
          paid_users: s.paidUsers,
          organic_installs: s.organicGetApp,
          paid_installs: s.paidGetApp,
        })),
      }),
    }),

    get_daily_trend: tool({
      description:
        'Daily L7D-rolling time series (Users, optionally Install + CR when History_Daily covers the date). Last ~30 days. Use for trend questions like "users 2 tuần gần nhất ra sao".',
      inputSchema: z.object({
        surface: SurfaceSchema,
        keyword: z.string().nullish().describe('Filter to a specific keyword'),
        last_n_days: z.number().min(1).max(120).default(30),
      }),
      execute: async ({ surface, keyword, last_n_days }) => {
        const filters = { surface: surface ?? 'all', keyword: keyword ?? null };
        const all = dailyTrend(data, filters);
        const trimmed = all.slice(-last_n_days);
        return {
          surface_filter: surface ?? 'all',
          keyword_filter: keyword ?? null,
          days: trimmed.length,
          points: trimmed.map((p) => ({
            date: p.date,
            users: p.users,
            installs: p.getApp,
            cr_pct: p.cr !== null ? round(p.cr * 100, 2) : null,
          })),
        };
      },
    }),

    search_keyword: tool({
      description:
        'Drill into a keyword across windows + countries. Returns position, users, installs, CR, alert, and matching action-queue entries. Matches the EXACT keyword if it exists; otherwise falls back to PARTIAL (substring) match — so "accounting" surfaces "accounting software", "accounting app", etc. Always check match_mode and matched_terms in the result before concluding "no data".',
      inputSchema: z.object({
        keyword: z
          .string()
          .describe('Keyword text (case-insensitive). Partial text is fine — e.g. "accounting" matches variants if no exact keyword exists.'),
      }),
      execute: async ({ keyword }) => {
        const kw = keyword.toLowerCase().trim();
        const windows: Array<keyof SheetPayload> = ['allL3', 'allL7', 'allL14', 'allL30', 'allL90'];
        const cwindows: Array<keyof SheetPayload> = ['countryL3', 'countryL7', 'countryL14', 'countryL30', 'countryL90'];

        // Match mode: prefer an exact keyword; if none exists anywhere, fall
        // back to substring so partial queries still surface real variants.
        const allTerms = new Set<string>();
        windows.forEach((tab) => {
          (data[tab] as Array<{ searchTerm: string }>).forEach((r) => allTerms.add(r.searchTerm.toLowerCase()));
        });
        const hasExact = allTerms.has(kw);
        const matches = (term: string) => {
          const t = term.toLowerCase();
          return hasExact ? t === kw : t.includes(kw);
        };
        const matchedTerms = new Set<string>();

        const all_window_rows: Array<{ window: string; rows: Array<Record<string, unknown>> }> = [];
        windows.forEach((tab) => {
          const w = tab.replace('all', '') as OverviewWindow;
          const matched = (data[tab] as Array<{ searchTerm: string; surface: string; usersL: number; usersP: number; getAppL: number; getAppP: number; crL: number | null; posL: number | null; deltaUsersPct: number; deltaCrPct: number | null; deltaPosPct: number | null; alert: string }>).filter(
            (r) => matches(r.searchTerm),
          );
          matched.forEach((r) => matchedTerms.add(r.searchTerm));
          all_window_rows.push({
            window: w,
            rows: matched
              .sort((a, b) => b.usersL - a.usersL)
              .slice(0, 25)
              .map((r) => ({
                keyword: r.searchTerm,
                surface: r.surface === 'search_ad' ? 'paid' : 'organic',
                users: r.usersL,
                users_delta_pct: round(r.deltaUsersPct * 100),
                installs: r.getAppL,
                cr_pct: r.crL !== null ? round(r.crL * 100, 2) : null,
                cr_delta_pct: r.deltaCrPct !== null ? round(r.deltaCrPct * 100) : null,
                pos: r.posL,
                pos_delta_pct: r.deltaPosPct !== null ? round(r.deltaPosPct * 100) : null,
                alert: r.alert,
              })),
          });
        });

        const countryHits: Array<Record<string, unknown>> = [];
        cwindows.forEach((tab) => {
          const w = tab.replace('country', '') as OverviewWindow;
          const matched = (data[tab] as Array<{ searchTerm: string; country?: string; surface: string; usersL: number; getAppL: number; crL: number | null; posL: number | null; deltaUsersPct: number; alert: string }>).filter(
            (r) => matches(r.searchTerm),
          );
          matched.forEach((r) => matchedTerms.add(r.searchTerm));
          matched
            .sort((a, b) => b.usersL - a.usersL)
            .slice(0, 10)
            .forEach((r) => {
              countryHits.push({
                window: w,
                keyword: r.searchTerm,
                country: r.country,
                surface: r.surface === 'search_ad' ? 'paid' : 'organic',
                users: r.usersL,
                users_delta_pct: round(r.deltaUsersPct * 100),
                installs: r.getAppL,
                pos: r.posL,
                cr_pct: r.crL !== null ? round(r.crL * 100, 2) : null,
                alert: r.alert,
              });
            });
        });

        const actionQueueHits = data.actionQueue
          .filter((a) => matches(a.keyword))
          .map((a) => ({
            keyword: a.keyword,
            priority: a.priority,
            score: a.score,
            country: a.country,
            surface: a.surface,
            window: a.window,
            alert: a.alert,
            bid_action: a.bidAction,
            bid_suggest: a.bidSuggest,
            note: a.note,
          }));

        return {
          query: keyword,
          match_mode: hasExact ? 'exact' : 'partial',
          matched_terms: Array.from(matchedTerms).sort(),
          by_window: all_window_rows,
          by_country_top10: countryHits,
          action_queue: actionQueueHits,
        };
      },
    }),

    get_weekly_digest: tool({
      description:
        'ONE call that sweeps every module — Overview, Camp Health, Overbid, Bid Recommendations, Google Ads, Nguồn Install — and returns only what moved past a threshold or stands out. Use this FIRST for open questions like "tuần này có gì", "có gì bất thường không", "biến động tuần vừa rồi", "outlier", "cần xử lý gì". Far cheaper and more complete than calling the per-area tools one by one. Each finding names the screen it came from so the user can verify it.',
      inputSchema: z.object({
        days: z
          .number()
          .min(3)
          .max(30)
          .default(7)
          .describe('Length of the period to summarise, in days. 7 = last week.'),
      }),
      execute: async ({ days }) => {
        const digest = buildWeeklyDigest(data, days);
        if (!digest) return { error: 'Chưa có dữ liệu để tổng hợp.' };
        return {
          period_days: days,
          through: digest.generatedFor,
          counts: digest.counts,
          // The findings, already ranked: critical first, then by money at stake.
          findings: digest.items.map((i) => ({
            severity: i.severity,
            source: i.source,
            headline: i.headline,
            detail: i.detail,
            action: i.action ?? null,
          })),
        };
      },
    }),

    get_camp_health: tool({
      description:
        'Campaign-level health for a period: which camps burn money with no installs, which have a CTR problem, which are losing impressions, which are rising, which are switched off. Use when the question is about CAMPAIGNS rather than keywords.',
      inputSchema: z.object({
        days: z.number().min(3).max(90).default(30),
        bucket: z
          .enum(['all', 'burning', 'wasted-imp', 'losing-imp', 'rising', 'paused'])
          .default('all')
          .describe('Filter to one health bucket.'),
        limit: z.number().min(1).max(40).default(12),
      }),
      execute: async ({ days, bucket, limit }) => {
        const health = analyseCampHealth(data.shopifyDaily ?? [], {
          windowDays: days,
          canonicalNames: (data.campLinks ?? []).map((c) => c.camp),
          pausedCamps: (data.pausedKw ?? []).map((r) => r.camp),
        });
        const rows = bucket === 'all' ? health.rows : health.rows.filter((r) => r.bucket === bucket);
        return {
          period: { from: health.from, to: health.to, days },
          total_spend: round(health.totalSpend, 0),
          median_cpi: round(health.medianCpi, 2),
          counts_by_bucket: health.rows.reduce<Record<string, number>>((acc, r) => {
            acc[r.bucket] = (acc[r.bucket] ?? 0) + 1;
            return acc;
          }, {}),
          camps: rows.slice(0, limit).map((r) => ({
            camp: r.camp,
            bucket: r.bucket,
            spend: round(r.cur.spend, 0),
            installs: r.cur.installs,
            clicks: r.cur.clicks,
            impressions: r.cur.impressions,
            cpi: round(r.cur.cpi, 2),
            imp_delta_pct: round((r.impDelta ?? 0) * 100),
            spend_delta_pct: round((r.spendDelta ?? 0) * 100),
            money_at_risk: round(r.atRisk, 0),
            // Small install counts make CPI a sample, not a rate — say so rather
            // than letting the model quote it as one.
            cpi_reliable: r.reliable,
            reason: r.reason,
          })),
        };
      },
    }),

    get_cpi_caps: tool({
      description:
        'Per-country CPI ceilings vs what each country actually cost, plus what one install is WORTH there (revenue per install). Use for questions about bid caps, which countries overpay, or whether a ceiling is set correctly at all.',
      inputSchema: z.object({
        only: z
          .enum(['all', 'over-cap', 'cap-above-value', 'spending'])
          .default('over-cap')
          .describe('over-cap = measured CPI above ceiling; cap-above-value = the ceiling itself exceeds what an install earns.'),
        limit: z.number().min(1).max(60).default(20),
      }),
      execute: async ({ only, limit }) => {
        const ov = buildCpiCapOverview(data);
        if (!ov) return { error: 'Chưa đọc được PerGeo_CPI_Cap.' };
        const pick = (() => {
          switch (only) {
            case 'over-cap': return ov.rows.filter((r) => r.verdict === 'over');
            case 'cap-above-value': return ov.rows.filter((r) => r.capHeadroom !== null && r.capHeadroom < 0);
            case 'spending': return ov.rows.filter((r) => r.spend > 0);
            default: return ov.rows;
          }
        })();
        return {
          totals: {
            countries_configured: ov.totals.configured,
            countries_with_spend: ov.totals.withSpend,
            spend: round(ov.totals.spend, 0),
            installs: ov.totals.installs,
            blended_cpi: round(ov.totals.cpi, 2),
            overspend_vs_cap: round(ov.totals.overspend, 0),
            countries_over_cap: ov.totals.overCount,
            countries_cap_above_value: ov.totals.capAboveValue,
          },
          countries: pick.slice(0, limit).map((r) => ({
            country: r.country,
            revenue_rank: r.rank,
            tier1: r.tier1,
            cpi_cap: r.cap,
            cpi_actual: round(r.cpi, 2),
            cpi_reliable: r.cpiReliable,
            installs: r.installs,
            spend: round(r.spend, 0),
            value_per_install: round(r.valuePerInstall, 2),
            cap_headroom: round(r.capHeadroom, 2),
            verdict: r.verdict,
          })),
        };
      },
    }),

    get_google_ads: tool({
      description:
        'Google Ads: spend, installs, impression share lost to budget vs rank, spend per country against the CPI ceiling and the exclude list, Quality Score weak points, and target CPA vs actual. A SEPARATE channel from App Store Ads — never add their install counts together.',
      inputSchema: z.object({
        area: z
          .enum(['summary', 'countries', 'quality', 'bidding'])
          .default('summary'),
        limit: z.number().min(1).max(40).default(12),
      }),
      execute: async ({ area, limit }) => {
        const report = buildGoogleAdsReport(data.googleAds);
        if (!report) return { error: 'Chưa có dữ liệu Google Ads.' };
        const deep = buildGoogleAdsDeep(data);
        if (area === 'countries' && deep.country) {
          return {
            currency_note: `Chi phí gốc bằng ${report.currency}, đã quy về USD.`,
            total_cost_usd: deep.country.totalCostUsd,
            spend_in_excluded_countries_usd: deep.country.excludedCostUsd,
            spend_in_no_revenue_countries_usd: deep.country.noRevenueCostUsd,
            countries: deep.country.rows
              .filter((r) => r.costUsd > 0)
              .slice(0, limit)
              .map((r) => ({
                country: r.country,
                cost_usd: r.costUsd,
                clicks: r.clicks,
                cost_per_google_conversion_usd: r.cpaUsd,
                cpi_cap_usd: r.capUsd,
                value_per_install_usd: r.valuePerInstall,
                on_appstore_exclude_list: r.excluded,
              })),
          };
        }
        if (area === 'quality' && deep.quality) {
          return {
            keywords_with_qs_below_5: deep.quality.lowQsCount,
            spend_on_weak_keywords_usd: deep.quality.weakCostUsd,
            by_weak_component: deep.quality.byCulprit,
            keywords: deep.quality.rows
              .filter((r) => r.weakParts.length > 0)
              .slice(0, limit)
              .map((r) => ({
                keyword: r.keyword,
                campaign: r.campaignName,
                qs: r.qs,
                weak: r.weakParts,
                fix_first: r.culprit,
                cost_usd: r.costUsd,
              })),
          };
        }
        if (area === 'bidding' && deep.bidding) {
          return {
            campaigns_over_their_target: deep.bidding.overTargetCount,
            campaigns_without_target: deep.bidding.noTargetCount,
            campaigns: deep.bidding.rows.slice(0, limit).map((r) => ({
              campaign: r.campaignName,
              strategy: r.bidStrategy,
              target_cpa_usd: r.targetCpaUsd,
              actual_cpa_usd: r.actualCpaUsd,
              actual_cpi_usd: r.actualCpiUsd,
              installs: r.installs,
              cost_usd: r.costUsd,
            })),
          };
        }
        return {
          period: { from: report.from, to: report.to, days: report.days },
          currency: report.currency,
          cost: round(report.totals.cost, 0),
          clicks: report.totals.clicks,
          // Google's 'conversions' is mostly page views; installs is the real number.
          google_conversions: round(report.totals.conversions, 1),
          installs_only: round(report.totals.installs, 1),
          cost_lost_to_budget: round(report.lostToBudgetCost, 0),
          cost_lost_to_rank: round(report.lostToRankCost, 0),
          campaigns: report.campaigns.slice(0, limit).map((c) => ({
            campaign: c.name,
            cost: round(c.cost, 0),
            clicks: c.clicks,
            installs: round(c.installs, 1),
            impression_share: round((c.is ?? 0) * 100),
            verdict: c.verdict,
          })),
        };
      },
    }),

    get_install_origin: tool({
      description:
        'Where paid installs came from: keyword x country x ad position x campaign x bid. Use for "install đến từ keyword nào", "nước nào", "vị trí mấy". Covers only the installs GA4 broke down by country — the response states the coverage.',
      inputSchema: z.object({
        keyword: z.string().nullish().describe('Optional: narrow to one keyword.'),
        country: z.string().nullish().describe('Optional: narrow to one country.'),
        limit: z.number().min(1).max(60).default(20),
      }),
      execute: async ({ keyword, country, limit }) => {
        const origin = buildInstallOrigin(data);
        if (!origin) return { error: 'Chưa có dòng paid nào ở mức keyword × nước kèm install.' };
        const kw = keyword?.trim().toLowerCase();
        const co = country?.trim().toLowerCase();
        const rows = origin.rows.filter(
          (r) =>
            (!kw || r.keyword.toLowerCase().includes(kw)) &&
            (!co || r.country.toLowerCase().includes(co)),
        );
        return {
          window: origin.window,
          installs_traced: origin.installs,
          installs_at_keyword_grain: origin.installsAllGrain,
          coverage_note:
            'GA4 giấu bớt hàng lượng thấp khi tách theo nước, nên đây KHÔNG phải toàn bộ install paid.',
          rows_with_ambiguous_campaign: origin.ambiguousRows,
          rows: rows.slice(0, limit).map((r) => ({
            keyword: r.keyword,
            country: r.country,
            ad_position: r.position,
            users: r.users,
            installs: r.installs,
            cr_pct: round((r.cr ?? 0) * 100, 1),
            bid_min: r.bidMin,
            bid_max: r.bidMax,
            campaigns: r.camps.map((c) => c.camp),
            campaign_is_ambiguous: r.campAmbiguous,
          })),
        };
      },
    }),
  };
}
