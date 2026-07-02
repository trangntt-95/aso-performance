import type { BidCapRow, CampLinkRow, MasterKwRow, ShopifyCampRow } from '@/lib/sheets/types';
import { buildCampGeoIndex, type CampGeo } from '@/lib/sheets/campGeo';
import { normalizeCampName } from '@/lib/sheets/campName';

// Detect OVERBID campaigns: paid camps (from Shopify_daily) whose effective
// CPC (Spend/Clicks) and/or CPI (Spend/Installs) run ABOVE the allowed bid /
// CPI for the countries they target (from 'Max bid cap'). These are the camps
// burning budget by paying more per tap / per install than recommended.
//
// We have no per-camp bid column, so effective CPC is the proxy for the bid
// being paid. Apple Search Ads never charges above your bid, so an effective
// CPC already ABOVE the allowed bid is a hard overbid signal.
//
// Target countries come from the Camp_Links **Geo** column (the authoritative
// targeting). When a camp's Geo is blank / it isn't in Camp_Links, it's treated
// as GENERAL targeting → we compare against the AVERAGE allowed CPC/CPI across
// the whole category. NB: in 'Max bid cap' the CPC column == Bid Rec ⭐ (verified
// live), so "allowed CPC" = Bid Rec.

export interface OverbidRow {
  camp: string;
  url?: string;
  category: string;
  /** Resolved target countries (empty for general). */
  countries: string[];
  /** 'country' = matched specific Geo; 'category' = general (category average). */
  matchLevel: 'country' | 'category';
  countryLabel: string;
  impressions: number;
  clicks: number;
  installs: number;
  spend: number;
  cpc: number | null;
  cpi: number | null;
  /** Allowed bid (avg Bid Rec across the camp's countries / category). */
  targetBid: number | null;
  /** Allowed CPI (avg CPI across the camp's countries / category). */
  targetCpi: number | null;
  cpcOverPct: number | null;
  cpiOverPct: number | null;
  reasons: string[];
  /** Priority = worst overage × spend (biggest wasted budget on top). */
  score: number;
  /** How many Shopify_daily rows were merged into this camp (same URL). 1 = none. */
  mergedCount: number;
  /** The original Shopify_daily names that were merged (for tooltip). */
  mergedNames: string[];
}

export interface OverbidParams {
  /** Ignore camps with fewer clicks (CPC from 1–2 clicks is noise). Default 5. */
  minClicks?: number;
  /** Flag only when CPC exceeds the allowed bid by > this %. Default 0. */
  cpcTolerancePct?: number;
  /** Flag only when CPI exceeds the allowed CPI by > this %. Default 0. */
  cpiTolerancePct?: number;
}

// Camp-name category token → 'Max bid cap' category taxonomy.
const CAT_MAP: Record<string, string> = {
  brandname: 'Brand',
  brand: 'Brand',
  profit: 'Profit',
  competitor: 'Competitor',
  cpm: 'CPM',
  feature: 'Feature',
  others: 'Others',
  other: 'Others',
  generic: 'Others',
  language: 'Language',
  lang: 'Language',
  test: 'Test',
};

/** Derive the bid-cap category from a camp name ("… TP - Profit - …"). */
function campCategory(name: string): string | null {
  const m = name.match(/TP\s*-\s*([A-Za-z]+)/i);
  if (m) {
    const mapped = CAT_MAP[m[1].toLowerCase()];
    if (mapped) return mapped;
  }
  const lower = name.toLowerCase();
  for (const token of Object.keys(CAT_MAP)) {
    if (new RegExp(`\\b${token}\\b`).test(lower)) return CAT_MAP[token];
  }
  return null;
}

interface Cell {
  country: string;
  bid: number;
  cpi: number;
}

/** Average a field over the given cells, skipping non-positive values. */
function avg(cells: Cell[], pick: (c: Cell) => number): number {
  const vals = cells.map(pick).filter((v) => v > 0);
  if (vals.length === 0) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

export function findOverbidCamps(
  shopifyCamps: ShopifyCampRow[],
  bidCap: BidCapRow[],
  campLinks: CampLinkRow[],
  pausedCamps: MasterKwRow[] = [],
  params: OverbidParams = {},
): OverbidRow[] {
  const minClicks = params.minClicks ?? 5;
  // Camps in the 'Paused_camp' tab are no longer running — drop them so the
  // table only lists live camps whose bid you can still act on. Match on the
  // note-stripped name so a paused camp renamed with a "(CPI …)" tag in
  // Shopify_daily is still recognised.
  const pausedSet = new Set(
    pausedCamps.map((p) => normalizeCampName(p.camp)).filter(Boolean),
  );
  const cpcTol = (params.cpcTolerancePct ?? 0) / 100;
  const cpiTol = (params.cpiTolerancePct ?? 0) / 100;

  // Bid-cap cells grouped by category (each holds per-country allowed bid/CPI).
  const cellsByCat = new Map<string, Cell[]>();
  for (const r of bidCap) {
    if (!r.category || !r.country) continue;
    const list = cellsByCat.get(r.category) ?? [];
    list.push({ country: r.country, bid: r.bidRecommended, cpi: r.cpiActual });
    cellsByCat.set(r.category, list);
  }

  // Camp_Links keeps un-annotated names, so key both the geo and URL lookups by
  // the note-stripped name and query with the same. Re-key the geo index
  // (first non-unknown geo wins, mirroring buildCampGeoIndex).
  const geoIndexRaw = buildCampGeoIndex(campLinks);
  const geoIndex = new Map<string, CampGeo>();
  geoIndexRaw.forEach((geo, name) => {
    const key = normalizeCampName(name);
    const existing = geoIndex.get(key);
    if (!existing || (existing.mode === 'unknown' && geo.mode !== 'unknown')) {
      geoIndex.set(key, geo);
    }
  });
  const campUrl = new Map<string, string>();
  for (const c of campLinks) {
    if (!c.camp || !c.url) continue;
    const key = normalizeCampName(c.camp);
    if (!campUrl.has(key)) campUrl.set(key, c.url);
  }

  // Merge Shopify_daily rows that are the SAME campaign. Trang renames a camp
  // over time (adding "(CPI xx)" / other notes), so one campaign can appear as
  // several rows — each covering part of the reporting window. They resolve to
  // one Camp_Links URL (= one campaign id); sum their impressions/clicks/
  // installs/spend so CPC/CPI reflect the whole window, not a single slice.
  // Rows with no resolvable URL can't be proven identical, so they merge only
  // with rows sharing the exact note-stripped name.
  interface MergedCamp {
    key: string; // note-stripped name of the representative row
    name: string; // representative (shortest) original name
    url?: string;
    impressions: number;
    clicks: number;
    installs: number;
    spend: number;
    members: string[];
  }
  const groups = new Map<string, MergedCamp>();
  for (const c of shopifyCamps) {
    const campKey = normalizeCampName(c.camp);
    if (pausedSet.has(campKey)) continue; // paused camp — bid no longer actionable
    const url = campUrl.get(campKey);
    const groupKey = url ?? `name:${campKey}`; // URL = campaign identity; else fall back to name
    let g = groups.get(groupKey);
    if (!g) {
      g = { key: campKey, name: c.camp, url, impressions: 0, clicks: 0, installs: 0, spend: 0, members: [] };
      groups.set(groupKey, g);
    }
    g.impressions += c.impressions;
    g.clicks += c.clicks;
    g.installs += c.installs;
    g.spend += c.spend;
    g.members.push(c.camp);
    // Prefer the shortest name as the label — notes only make names longer, so
    // the shortest member is the closest to the clean base name.
    if (c.camp.length < g.name.length) {
      g.name = c.camp;
      g.key = campKey;
    }
  }

  const out: OverbidRow[] = [];
  for (const c of Array.from(groups.values())) {
    const campKey = c.key; // note-stripped key of the representative name
    if (c.clicks < minClicks) continue; // too little data to trust CPC

    const category = campCategory(c.name);
    if (!category) continue; // can't map to a bid-cap category → can't assess
    const catCells = cellsByCat.get(category);
    if (!catCells || catCells.length === 0) continue; // no recommendation to compare

    const cpc = c.clicks > 0 ? c.spend / c.clicks : null;
    const cpi = c.installs > 0 ? c.spend / c.installs : null;

    // Resolve target cells from Camp_Links Geo; blank/missing geo = general.
    const geo = geoIndex.get(campKey);
    let targetCells: Cell[] = catCells;
    let matchLevel: 'country' | 'category' = 'category';
    let countryLabel = `general · avg ${category}`;
    let countries: string[] = [];

    if (geo && geo.mode === 'include' && geo.countries.length > 0) {
      const set = new Set(geo.countries);
      const picked = catCells.filter((x) => set.has(x.country));
      if (picked.length > 0) {
        targetCells = picked;
        matchLevel = 'country';
        countries = picked.map((x) => x.country);
        countryLabel = countries.join(', ');
      }
    } else if (geo && geo.mode === 'exclude' && geo.countries.length > 0) {
      const set = new Set(geo.countries);
      const picked = catCells.filter((x) => !set.has(x.country));
      if (picked.length > 0) {
        targetCells = picked;
        matchLevel = 'country';
        countries = picked.map((x) => x.country);
        countryLabel = `trừ ${geo.countries.join(', ')}`;
      }
    }
    // mode 'all' / 'unknown' / not-in-Camp_Links → keep general (category avg).

    const targetBid = avg(targetCells, (x) => x.bid) || null;
    const targetCpi = avg(targetCells, (x) => x.cpi) || null;
    if (targetBid === null && targetCpi === null) continue;

    const cpcOver = cpc !== null && targetBid !== null && cpc > targetBid * (1 + cpcTol);
    const cpiOver = cpi !== null && targetCpi !== null && cpi > targetCpi * (1 + cpiTol);
    if (!cpcOver && !cpiOver) continue;

    const cpcOverPct = cpcOver ? (cpc! - targetBid!) / targetBid! : null;
    const cpiOverPct = cpiOver ? (cpi! - targetCpi!) / targetCpi! : null;

    const reasons: string[] = [];
    if (cpcOver) reasons.push(`CPC $${cpc!.toFixed(2)} > bid cho phép $${targetBid!.toFixed(2)} (+${Math.round(cpcOverPct! * 100)}%)`);
    if (cpiOver) reasons.push(`CPI $${cpi!.toFixed(2)} > CPI cho phép $${targetCpi!.toFixed(2)} (+${Math.round(cpiOverPct! * 100)}%)`);

    const worstOver = Math.max(cpcOverPct ?? 0, cpiOverPct ?? 0);

    out.push({
      camp: c.name,
      url: c.url ?? campUrl.get(campKey),
      category,
      countries,
      matchLevel,
      countryLabel,
      impressions: c.impressions,
      clicks: c.clicks,
      installs: c.installs,
      spend: c.spend,
      cpc,
      cpi,
      targetBid,
      targetCpi,
      cpcOverPct,
      cpiOverPct,
      reasons,
      score: worstOver * c.spend,
      mergedCount: c.members.length,
      mergedNames: c.members,
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}
