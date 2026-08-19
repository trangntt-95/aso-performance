import type { BidCapRow, CampLinkRow, MasterKwRow, ShopifyCampRow } from '@/lib/sheets/types';
import { buildCampGeoIndex, isNeverTargeted, type CampGeo } from '@/lib/sheets/campGeo';
import { normalizeCampName, buildCampNameResolver } from '@/lib/sheets/campName';

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

/** Why a camp is / isn't on the overbid list. Only 'overbid' rows are actionable;
 *  the rest exist so a camp you noted can still be found after it leaves the list
 *  (see assessCamps). */
export type CampVerdict =
  | 'overbid' // CPC and/or CPI above the allowed level → hạ bid
  | 'ok' // assessed and within the allowed bid AND CPI → fixed
  | 'paused' // every Shopify_daily row of the camp is a paused campaign
  | 'low-clicks' // below the clicks threshold → CPC too noisy to judge
  | 'no-benchmark'; // camp name maps to no bid-cap category / no rows to compare

export interface OverbidRow {
  camp: string;
  url?: string;
  verdict: CampVerdict;
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
  /** Names of this camp's Shopify_daily rows that belong to a PAUSED campaign —
   *  excluded from the totals. Also the names a note may have been filed under
   *  before the rename/pause. */
  pausedNames: string[];
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

/**
 * Assess EVERY campaign in Shopify_daily and label it with a verdict — the
 * overbid ones plus the camps that don't (or no longer) trip the rule. The
 * overbid table filters this down; the "đã xử lý" view needs the rest, because a
 * camp whose bid you actually fixed drops out of the flagged list and would
 * otherwise be unfindable — along with its Impact bid reading.
 */
export function assessCamps(
  shopifyCamps: ShopifyCampRow[],
  bidCap: BidCapRow[],
  campLinks: CampLinkRow[],
  pausedCamps: MasterKwRow[] = [],
  params: OverbidParams = {},
): OverbidRow[] {
  const minClicks = params.minClicks ?? 5;
  // Camps in the 'Paused_camp' tab are no longer running — drop them so the
  // table only lists live camps whose bid you can still act on. Resolve on the
  // base name so a paused camp renamed with a "(CPI …)" tag or a free-text note
  // ("- cân nhắc off") in Shopify_daily is still recognised.
  const pausedResolver = buildCampNameResolver(pausedCamps.map((p) => p.camp));
  // Maps an annotated Shopify_daily name onto its Camp_Links base name so notes
  // like "(CPI 107) - cân nhắc off" or "- good CPI 7" don't lose the URL/geo.
  const linkResolver = buildCampNameResolver(campLinks.map((c) => c.camp));

  // The resolver above only folds a LONGER spend label onto a SHORTER paused
  // name. The reverse happens just as often: Paused_camp holds the annotated
  // version ("… Test potential KW Apr - test till Sep") while the spend data
  // still carries the plain one, so the plain label was never recognised as
  // switched off and kept showing up as a live camp to fix.
  //
  // Folding the other way is only safe when Camp_Links does NOT list the shorter
  // name: a name Camp_Links knows is a campaign in its own right, and collapsing
  // it would hide a live camp behind a paused sibling — the geo-split trap
  // ("… Tier 1" vs "… Tier 1 - DE"). Absent from Camp_Links, it is a label
  // variant, which is exactly the case being fixed here.
  const linkNames = new Set(
    campLinks.map((c) => normalizeCampName(c.camp).toLowerCase()).filter(Boolean),
  );
  const pausedByExtension = new Set<string>();
  {
    const pausedNorm = pausedCamps
      .map((x) => normalizeCampName(x.camp).toLowerCase())
      .filter(Boolean);
    const NOTE_START = /^\s*[-–(]/;
    for (const raw of shopifyCamps) {
      const lc = normalizeCampName(raw.camp).toLowerCase();
      if (!lc || linkNames.has(lc)) continue;
      for (const q of pausedNorm) {
        if (q.length > lc.length && q.startsWith(lc) && NOTE_START.test(q.slice(lc.length))) {
          pausedByExtension.add(lc);
          break;
        }
      }
    }
  }
  const isPausedName = (camp: string): boolean =>
    pausedResolver.resolve(camp) !== null ||
    pausedByExtension.has(normalizeCampName(camp).toLowerCase());
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
  // Same cells minus the markets the account never advertises in. This is the
  // benchmark for camps that DON'T name their countries (blank Geo, "all", or
  // an exclude list): they run everywhere except the account-level negative geo,
  // so the never-targeted markets must not sit in their average. They're the
  // cheap ones, so leaving them in dragged the allowed bid down and flagged
  // camps as overbid against a bar they were never bidding into.
  // A camp that DOES name its countries keeps the full list — an explicit Geo
  // wins over the account default (Trang's rule: "nói rõ geo thì target đúng
  // các nước đó").
  const targetableByCat = new Map<string, Cell[]>();
  cellsByCat.forEach((cells, cat) => {
    targetableByCat.set(cat, cells.filter((c) => !isNeverTargeted(c.country)));
  });

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
    members: string[]; // LIVE rows only — the totals above come from these
    pausedNames: string[]; // rows of a paused campaign, kept out of the totals
  }
  const groups = new Map<string, MergedCamp>();
  for (const c of shopifyCamps) {
    // Base name = Camp_Links match (annotations stripped) if any, else the raw
    // note-stripped name. Used to look up URL/geo AND to merge rows that are the
    // same campaign under different annotations.
    const campKey = linkResolver.resolve(c.camp) ?? normalizeCampName(c.camp);
    const url = campUrl.get(campKey);
    const groupKey = url ?? `name:${campKey}`; // URL = campaign identity; else fall back to name
    let g = groups.get(groupKey);
    if (!g) {
      g = { key: campKey, name: c.camp, url, impressions: 0, clicks: 0, installs: 0, spend: 0, members: [], pausedNames: [] };
      groups.set(groupKey, g);
    }
    // Paused camp — its bid is no longer actionable, so it contributes no
    // spend/clicks. The name is kept so a note filed before the pause can still
    // be found.
    if (isPausedName(c.camp)) {
      g.pausedNames.push(c.camp);
      continue;
    }
    g.impressions += c.impressions;
    g.clicks += c.clicks;
    g.installs += c.installs;
    g.spend += c.spend;
    g.members.push(c.camp);
    // Prefer the shortest LIVE name as the label — notes only make names longer,
    // so the shortest member is the closest to the clean base name.
    if (g.members.length === 1 || c.camp.length < g.name.length) {
      g.name = c.camp;
      g.key = campKey;
    }
  }

  const out: OverbidRow[] = [];
  for (const c of Array.from(groups.values())) {
    const campKey = c.key; // note-stripped key of the representative name

    // A camp that can't be assessed still gets a row so it stays findable.
    const stub = (verdict: CampVerdict, category: string): OverbidRow => ({
      camp: c.name,
      url: c.url ?? campUrl.get(campKey),
      verdict,
      category,
      countries: [],
      matchLevel: 'category',
      countryLabel: category === 'Unknown' ? 'không rõ category' : `general · avg ${category}`,
      impressions: c.impressions,
      clicks: c.clicks,
      installs: c.installs,
      spend: c.spend,
      cpc: c.clicks > 0 ? c.spend / c.clicks : null,
      cpi: c.installs > 0 ? c.spend / c.installs : null,
      targetBid: null,
      targetCpi: null,
      cpcOverPct: null,
      cpiOverPct: null,
      reasons: [],
      score: 0,
      mergedCount: c.members.length,
      mergedNames: c.members,
      pausedNames: c.pausedNames,
    });

    // Every row of this camp is a paused campaign → nothing live to assess.
    if (c.members.length === 0) {
      out.push(stub('paused', campCategory(c.pausedNames[0] ?? '') ?? 'Unknown'));
      continue;
    }
    if (c.clicks < minClicks) {
      out.push(stub('low-clicks', campCategory(c.name) ?? 'Unknown')); // too little data to trust CPC
      continue;
    }

    const category = campCategory(c.name);
    if (!category) {
      out.push(stub('no-benchmark', 'Unknown')); // can't map to a bid-cap category
      continue;
    }
    const catCells = cellsByCat.get(category);
    if (!catCells || catCells.length === 0) {
      out.push(stub('no-benchmark', category)); // no recommendation to compare
      continue;
    }

    const cpc = c.clicks > 0 ? c.spend / c.clicks : null;
    const cpi = c.installs > 0 ? c.spend / c.installs : null;

    // Resolve target cells from Camp_Links Geo; blank/missing geo = general.
    // General = every country in the category EXCEPT the account-level negative
    // geo, which is what a blank Geo cell actually means.
    const geo = geoIndex.get(campKey);
    const generalCells = targetableByCat.get(category) ?? catCells;
    let targetCells: Cell[] = generalCells;
    let matchLevel: 'country' | 'category' = 'category';
    let countryLabel = `general · avg ${category} (trừ nước không target)`;
    let countries: string[] = [];

    if (geo && geo.mode === 'include' && geo.countries.length > 0) {
      // Explicit Geo wins over the account default — compare against exactly
      // the countries named, even if one of them is normally excluded.
      const set = new Set(geo.countries);
      const picked = catCells.filter((x) => set.has(x.country));
      if (picked.length > 0) {
        targetCells = picked;
        matchLevel = 'country';
        countries = picked.map((x) => x.country);
        countryLabel = countries.join(', ');
      }
    } else if (geo && geo.mode === 'exclude' && geo.countries.length > 0) {
      // The camp's own exclusions stack ON TOP of the account-level ones.
      const set = new Set(geo.countries);
      const picked = generalCells.filter((x) => !set.has(x.country));
      if (picked.length > 0) {
        targetCells = picked;
        matchLevel = 'country';
        countries = picked.map((x) => x.country);
        countryLabel = `trừ ${geo.countries.join(', ')}`;
      }
    }
    // mode 'all' / 'unknown' / not-in-Camp_Links → general (category avg minus
    // the never-targeted markets).

    const targetBid = avg(targetCells, (x) => x.bid) || null;
    const targetCpi = avg(targetCells, (x) => x.cpi) || null;
    if (targetBid === null && targetCpi === null) {
      out.push(stub('no-benchmark', category));
      continue;
    }

    const cpcOver = cpc !== null && targetBid !== null && cpc > targetBid * (1 + cpcTol);
    const cpiOver = cpi !== null && targetCpi !== null && cpi > targetCpi * (1 + cpiTol);

    const cpcOverPct = cpcOver ? (cpc! - targetBid!) / targetBid! : null;
    const cpiOverPct = cpiOver ? (cpi! - targetCpi!) / targetCpi! : null;

    const reasons: string[] = [];
    if (cpcOver) reasons.push(`CPC $${cpc!.toFixed(2)} > bid cho phép $${targetBid!.toFixed(2)} (+${Math.round(cpcOverPct! * 100)}%)`);
    if (cpiOver) reasons.push(`CPI $${cpi!.toFixed(2)} > CPI cho phép $${targetCpi!.toFixed(2)} (+${Math.round(cpiOverPct! * 100)}%)`);

    const worstOver = Math.max(cpcOverPct ?? 0, cpiOverPct ?? 0);

    out.push({
      camp: c.name,
      url: c.url ?? campUrl.get(campKey),
      verdict: cpcOver || cpiOver ? 'overbid' : 'ok',
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
      pausedNames: c.pausedNames,
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

/** The actionable list: camps whose CPC/CPI run above the allowed level. */
export function findOverbidCamps(
  shopifyCamps: ShopifyCampRow[],
  bidCap: BidCapRow[],
  campLinks: CampLinkRow[],
  pausedCamps: MasterKwRow[] = [],
  params: OverbidParams = {},
): OverbidRow[] {
  return assessCamps(shopifyCamps, bidCap, campLinks, pausedCamps, params).filter(
    (r) => r.verdict === 'overbid',
  );
}
