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
        'Get the top-line KPI snapshot for a window (Users, GetApp installs, CR, paid Ads target + runrate). Use for "tổng quan tuần này" / "what does this week look like" style questions.',
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
        'Get top contributing keywords by Users or GetApp installs in a window. Returns up to 30 keywords sorted by absolute volume.',
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
        'Top countries ranked by Users or GetApp installs in a window. Returns top 20.',
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
        'Δ Users %, Δ GetApp %, Δ Weighted % across all windows (L3 → L90) — useful to see if the market is accelerating or decelerating.',
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
        'Daily L7D-rolling time series (Users, optionally GetApp + CR when History_Daily covers the date). Last ~30 days. Use for trend questions like "users 2 tuần gần nhất ra sao".',
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
        'Drill into a single keyword across windows + countries. Returns its position, users, installs, CR, alert, and any matching action-queue entries.',
      inputSchema: z.object({
        keyword: z.string().describe('Exact keyword text (case-insensitive)'),
      }),
      execute: async ({ keyword }) => {
        const kw = keyword.toLowerCase();
        const windows: Array<keyof SheetPayload> = ['allL3', 'allL7', 'allL14', 'allL30', 'allL90'];
        const cwindows: Array<keyof SheetPayload> = ['countryL3', 'countryL7', 'countryL14', 'countryL30', 'countryL90'];

        const all_window_rows: Array<{ window: string; rows: Array<Record<string, unknown>> }> = [];
        windows.forEach((tab) => {
          const w = tab.replace('all', '') as OverviewWindow;
          const matched = (data[tab] as Array<{ searchTerm: string; surface: string; usersL: number; usersP: number; getAppL: number; getAppP: number; crL: number | null; posL: number | null; deltaUsersPct: number; deltaCrPct: number | null; deltaPosPct: number | null; alert: string }>).filter(
            (r) => r.searchTerm.toLowerCase() === kw,
          );
          all_window_rows.push({
            window: w,
            rows: matched.map((r) => ({
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
            (r) => r.searchTerm.toLowerCase() === kw,
          );
          matched
            .sort((a, b) => b.usersL - a.usersL)
            .slice(0, 10)
            .forEach((r) => {
              countryHits.push({
                window: w,
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
          .filter((a) => a.keyword.toLowerCase() === kw)
          .map((a) => ({
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
          keyword,
          by_window: all_window_rows,
          by_country_top10: countryHits,
          action_queue: actionQueueHits,
        };
      },
    }),
  };
}
