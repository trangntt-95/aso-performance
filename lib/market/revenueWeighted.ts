import type { KeywordRow, SheetPayload } from '@/lib/sheets/types';
import { normCountryToken } from '@/lib/sheets/campGeo';

// A market verdict weighted by what each country is actually worth to us.
//
// The sheet's own weighted index uses SEARCH volume: a country's weight is its
// organic search users divided by the biggest country's. That measures attention,
// not value, and the sheet's own 'Δ Rank (Rev − Search)' column shows how far the
// two diverge — Brazil ranks 7th by search and 27th by revenue, so at weight
// 0.141 it moves the verdict about as much as Australia (0.19) while an install
// there is worth $3.82 against Australia's $73.33. Pakistan and Türkiye carry
// weight 0.121 and 0.118 and do not appear in the revenue table at all.
//
// So "the market is down" was partly being driven by markets that produce almost
// no money. This weights by revenue instead: weight = country revenue ÷ the
// largest country's revenue.
//
// The two readings differ by tens of points on some windows and can even differ
// in sign, which is the point of the change — and also why the screen shows both
// side by side rather than letting one quietly replace the other. The exact gap
// is not quoted here because it moves with the data; read it off the panel.

/** Below this share of organic users covered by a weight, the index is too thin
 *  to report — most of the traffic would be sitting outside it. */
const MIN_COVERAGE = 0.5;

export interface CountryWeight {
  country: string;
  /** Revenue from the quarterly block. 0 when the country isn't in it. */
  revenue: number;
  /** revenue ÷ largest revenue. 0 excludes the country from the index. */
  weight: number;
  /** Revenue ÷ installs from the same block. This is the number that makes the
   *  case for weighting by money — two countries can carry similar search
   *  traffic while one install is worth twenty times more in one of them. */
  valuePerInstall: number | null;
  usersL: number;
  usersP: number;
}

export interface WeightedWindow {
  window: string;
  /** Σ users × weight, this period and the one before. */
  weightedL: number;
  weightedP: number;
  /** (L − P) / P. Null when the prior period is empty. */
  deltaPct: number | null;
  /** Share of this window's organic users that carried a weight. */
  coverage: number;
  /** True when coverage clears MIN_COVERAGE — otherwise don't quote the delta. */
  reliable: boolean;
  /** Countries with users but no revenue, biggest first. They are excluded, and
   *  naming them is what keeps the exclusion honest. */
  excluded: { country: string; usersL: number }[];
  /** The countries that DO carry the index, biggest contribution first. */
  contributors: CountryWeight[];
  /** True when the underlying Country_L* tab has no rows at all. */
  unavailable: boolean;
}

export interface RevenueWeightedReport {
  windows: WeightedWindow[];
  /** The country whose revenue defines weight 1. */
  base: { country: string; revenue: number } | null;
  /** Countries in the revenue block, for context. */
  countriesWithRevenue: number;
  /**
   * Two countries that between them show why money and attention are not the
   * same weight: similar organic traffic, very different value per install.
   *
   * Computed rather than written into the copy, because a hand-written example
   * ("Brazil is worth $3.82 against Australia's $73.33") is true on the day it
   * is typed and quietly wrong afterwards.
   */
  contrast: { rich: CountryWeight; poor: CountryWeight } | null;
}

/**
 * Country name → a key both sources agree on.
 *
 * Necessary, not defensive. Country_L* writes 'Türkiye' while the revenue block
 * writes 'turkey'; matching on the raw string drops that country's $430 and 13
 * users silently, which is exactly the kind of exclusion this module is supposed
 * to make visible rather than commit itself.
 *
 * normCountryToken resolves the names it knows and returns anything else
 * unchanged, so two spellings of the same unlisted country still have to be
 * folded here: 'Côte d’Ivoire' against "cote d'ivoire" differs by both an accent
 * and a curly apostrophe. No two real countries differ only by diacritics, so
 * folding them cannot merge distinct markets.
 */
function countryKey(raw: string): string {
  const canon = normCountryToken(String(raw ?? '')) ?? raw ?? '';
  return String(canon)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/s+/g, ' ')
    .trim()
    .toLowerCase();
}

const WINDOW_TABS: { window: string; key: keyof SheetPayload }[] = [
  { window: 'L3', key: 'countryL3' },
  { window: 'L7', key: 'countryL7' },
  { window: 'L14', key: 'countryL14' },
  { window: 'L30', key: 'countryL30' },
  { window: 'L90', key: 'countryL90' },
];

export function buildRevenueWeighted(data: SheetPayload | null | undefined): RevenueWeightedReport | null {
  if (!data) return null;

  // Revenue per country, and the country that sets weight 1.
  const revenue = new Map<string, number>();
  const valuePerInstall = new Map<string, number>();
  let base: { country: string; revenue: number } | null = null;
  for (const r of data.perGeoRevenue ?? []) {
    if (!r.country || !(r.revenue > 0)) continue;
    const k = countryKey(r.country);
    revenue.set(k, Math.max(revenue.get(k) ?? 0, r.revenue));
    if (r.valuePerInstall && r.valuePerInstall > 0) valuePerInstall.set(k, r.valuePerInstall);
    if (!base || r.revenue > base.revenue) base = { country: r.country, revenue: r.revenue };
  }
  if (!base) return null;
  const weightOf = (country: string): number => (revenue.get(countryKey(country)) ?? 0) / base!.revenue;

  const windows: WeightedWindow[] = WINDOW_TABS.map(({ window, key }) => {
    const rows = (data[key] as KeywordRow[] | undefined) ?? [];
    // Organic only, matching what the sheet's own weights are built from
    // ('L365 organic search, surface_type=search').
    const organic = rows.filter((r) => r.surface !== 'search_ad' && r.country);

    if (organic.length === 0) {
      return {
        window,
        weightedL: 0,
        weightedP: 0,
        deltaPct: null,
        coverage: 0,
        reliable: false,
        excluded: [],
        contributors: [],
        unavailable: true,
      };
    }

    const byCountry = new Map<string, CountryWeight>();
    for (const r of organic) {
      const c = r.country as string;
      // The tabs carry a literal '(not set)' for traffic GA4 could not place.
      if (/^\(not set\)$/i.test(c.trim())) continue;
      const cur =
        byCountry.get(c) ??
        {
          country: c,
          revenue: revenue.get(countryKey(c)) ?? 0,
          weight: weightOf(c),
          valuePerInstall: valuePerInstall.get(countryKey(c)) ?? null,
          usersL: 0,
          usersP: 0,
        };
      cur.usersL += r.usersL ?? 0;
      cur.usersP += r.usersP ?? 0;
      byCountry.set(c, cur);
    }

    let weightedL = 0;
    let weightedP = 0;
    let usersWithWeight = 0;
    let usersTotal = 0;
    const excluded: { country: string; usersL: number }[] = [];
    const contributors: CountryWeight[] = [];
    byCountry.forEach((c) => {
      usersTotal += c.usersL;
      if (c.weight <= 0) {
        if (c.usersL > 0) excluded.push({ country: c.country, usersL: c.usersL });
        return;
      }
      usersWithWeight += c.usersL;
      weightedL += c.usersL * c.weight;
      weightedP += c.usersP * c.weight;
      contributors.push(c);
    });

    excluded.sort((a, b) => b.usersL - a.usersL);
    contributors.sort((a, b) => b.usersL * b.weight - a.usersL * a.weight);
    const coverage = usersTotal > 0 ? usersWithWeight / usersTotal : 0;

    return {
      window,
      weightedL,
      weightedP,
      deltaPct: weightedP > 0 ? (weightedL - weightedP) / weightedP : null,
      coverage,
      reliable: coverage >= MIN_COVERAGE,
      excluded,
      contributors,
      unavailable: false,
    };
  });

  return { windows, base, countriesWithRevenue: revenue.size, contrast: pickContrast(windows) };
}

/**
 * Pick two countries whose value per install is far apart while their organic
 * traffic is comparable — the pair that shows why weighting by search volume
 * and weighting by money are not the same thing.
 *
 * The widest window with data is used, because the short windows carry a
 * handful of users per country and any pair drawn from them is noise. Both
 * countries must clear MIN_CONTRAST_USERS for the same reason: a country with
 * two installs can show a spectacular value per install that means nothing.
 */
const MIN_CONTRAST_USERS = 5;

function pickContrast(windows: WeightedWindow[]): { rich: CountryWeight; poor: CountryWeight } | null {
  const widest = [...windows].reverse().find((w) => !w.unavailable && w.contributors.length >= 2);
  if (!widest) return null;
  const eligible = widest.contributors.filter(
    (c) => c.valuePerInstall !== null && c.valuePerInstall > 0 && c.usersL >= MIN_CONTRAST_USERS,
  );
  if (eligible.length < 2) return null;
  const sorted = [...eligible].sort((a, b) => (b.valuePerInstall ?? 0) - (a.valuePerInstall ?? 0));
  const rich = sorted[0];
  const poor = sorted[sorted.length - 1];
  // A pair that is barely apart proves nothing, so say nothing.
  if ((rich.valuePerInstall ?? 0) < (poor.valuePerInstall ?? 0) * 3) return null;
  return { rich, poor };
}
