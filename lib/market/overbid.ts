import type { BidCapRow, CampLinkRow, ShopifyCampRow } from '@/lib/sheets/types';
import { buildCampGeoIndex, normCountryToken } from '@/lib/sheets/campGeo';

// Detect OVERBID campaigns: paid camps (from Shopify_daily) whose effective
// CPC (Spend/Clicks) and/or CPI (Spend/Installs) run ABOVE the recommended bid
// / target CPI for their Country × Category (from 'Max bid cap'). These are the
// camps burning budget by paying more per tap / per install than recommended.
//
// We have no per-camp bid column, so effective CPC is the proxy for the bid
// being paid. Since Apple Search Ads never charges more than your bid, an
// effective CPC already ABOVE the recommended bid is a hard overbid signal.

export interface OverbidRow {
  camp: string;
  url?: string;
  category: string;
  /** Resolved target countries (from camp name + Camp_Links geo). */
  countries: string[];
  /** How the target bid/CPI was resolved. */
  matchLevel: 'country' | 'category';
  countryLabel: string;
  impressions: number;
  clicks: number;
  installs: number;
  spend: number;
  cpc: number | null;
  cpi: number | null;
  /** Recommended bid (max Bid Rec across the camp's countries / category). */
  targetBid: number | null;
  /** Recommended CPI (max CPI across the camp's countries / category). */
  targetCpi: number | null;
  /** (cpc − targetBid) / targetBid, when both known and cpc is higher. */
  cpcOverPct: number | null;
  /** (cpi − targetCpi) / targetCpi, when both known and cpi is higher. */
  cpiOverPct: number | null;
  reasons: string[];
  /** Priority = worst overage × spend (biggest wasted budget on top). */
  score: number;
}

export interface OverbidParams {
  /** Ignore camps with fewer clicks (CPC from 1–2 clicks is noise). Default 5. */
  minClicks?: number;
  /** Flag only when CPC exceeds the recommended bid by > this %. Default 0. */
  cpcTolerancePct?: number;
  /** Flag only when CPI exceeds the target CPI by > this %. Default 0. */
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
  // Loose fallback: any known category token anywhere in the name.
  const lower = name.toLowerCase();
  for (const [token, cat] of Object.entries(CAT_MAP)) {
    if (new RegExp(`\\b${token}\\b`).test(lower)) return cat;
  }
  return null;
}

/** Country tokens embedded in a camp name, gated to countries we have bid caps
 *  for (so "Exact"/"Tier"/"Search" aren't mistaken for countries). */
function countriesFromName(name: string, known: Set<string>): string[] {
  // Exclusion camps ("… Excl US, IN", "… -PH, US") name the countries that are
  // NOT targeted — we can't infer the included set from the name, so bail and
  // let the category band (or Camp_Links geo) decide.
  if (/\bexcl(?:ude)?\b|\bexcept\b/i.test(name)) return [];
  const out = new Set<string>();
  // 2-letter codes ("BE, DE", "US🏆").
  const codeRe = /\b([A-Z]{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(name)) !== null) {
    const en = normCountryToken(m[1]);
    if (en && known.has(en)) out.add(en);
  }
  // Full / VN names split on separators.
  name.split(/[-(),/]+/).forEach((tok) => {
    const en = normCountryToken(tok.replace(/[^A-Za-z\s]/g, '').trim());
    if (en && known.has(en)) out.add(en);
  });
  return Array.from(out);
}

export function findOverbidCamps(
  shopifyCamps: ShopifyCampRow[],
  bidCap: BidCapRow[],
  campLinks: CampLinkRow[],
  params: OverbidParams = {},
): OverbidRow[] {
  const minClicks = params.minClicks ?? 5;
  const cpcTol = (params.cpcTolerancePct ?? 0) / 100;
  const cpiTol = (params.cpiTolerancePct ?? 0) / 100;

  // Lookup: Country×Category and Category-wide recommended bid / target CPI.
  const byCountryCat = new Map<string, { bid: number; cpi: number }>();
  const byCat = new Map<string, { bid: number; cpi: number }>(); // max across countries
  const knownCountries = new Set<string>();
  for (const r of bidCap) {
    if (!r.category) continue;
    if (r.country) knownCountries.add(r.country);
    const bid = r.bidRecommended > 0 ? r.bidRecommended : 0;
    const cpi = r.cpiActual > 0 ? r.cpiActual : 0;
    byCountryCat.set(`${r.category}|${r.country}`, { bid, cpi });
    const agg = byCat.get(r.category) ?? { bid: 0, cpi: 0 };
    byCat.set(r.category, { bid: Math.max(agg.bid, bid), cpi: Math.max(agg.cpi, cpi) });
  }

  const geoIndex = buildCampGeoIndex(campLinks);
  const campUrl = new Map<string, string>();
  for (const c of campLinks) if (c.camp && c.url) campUrl.set(c.camp, c.url);

  const out: OverbidRow[] = [];
  for (const c of shopifyCamps) {
    if (c.clicks < minClicks) continue; // too little data to trust CPC

    const category = campCategory(c.camp);
    if (!category) continue; // can't map to a bid-cap category → can't assess

    const cpc = c.clicks > 0 ? c.spend / c.clicks : null;
    const cpi = c.installs > 0 ? c.spend / c.installs : null;

    // Resolve target countries: camp-name tokens ∪ Camp_Links geo includes.
    const countrySet = new Set(countriesFromName(c.camp, knownCountries));
    const geo = geoIndex.get(c.camp);
    if (geo?.mode === 'include') {
      geo.countries.forEach((x) => {
        if (knownCountries.has(x)) countrySet.add(x);
      });
    }
    const countryList = Array.from(countrySet);

    // Target = max Bid Rec / CPI across the camp's countries that have a cell.
    let targetBid = 0;
    let targetCpi = 0;
    let matched = false;
    for (let i = 0; i < countryList.length; i++) {
      const cell = byCountryCat.get(`${category}|${countryList[i]}`);
      if (cell) {
        targetBid = Math.max(targetBid, cell.bid);
        targetCpi = Math.max(targetCpi, cell.cpi);
        matched = true;
      }
    }
    const matchLevel: 'country' | 'category' = matched ? 'country' : 'category';
    if (!matched) {
      const cell = byCat.get(category);
      if (cell) {
        targetBid = cell.bid;
        targetCpi = cell.cpi;
      }
    }
    const tBid = targetBid > 0 ? targetBid : null;
    const tCpi = targetCpi > 0 ? targetCpi : null;
    if (tBid === null && tCpi === null) continue; // no recommendation to compare

    const cpcOver = cpc !== null && tBid !== null && cpc > tBid * (1 + cpcTol);
    const cpiOver = cpi !== null && tCpi !== null && cpi > tCpi * (1 + cpiTol);
    if (!cpcOver && !cpiOver) continue;

    const cpcOverPct = cpcOver ? (cpc! - tBid!) / tBid! : null;
    const cpiOverPct = cpiOver ? (cpi! - tCpi!) / tCpi! : null;

    const reasons: string[] = [];
    if (cpcOver) reasons.push(`CPC $${cpc!.toFixed(2)} > bid rec $${tBid!.toFixed(2)} (+${Math.round(cpcOverPct! * 100)}%)`);
    if (cpiOver) reasons.push(`CPI $${cpi!.toFixed(2)} > target $${tCpi!.toFixed(2)} (+${Math.round(cpiOverPct! * 100)}%)`);

    const worstOver = Math.max(cpcOverPct ?? 0, cpiOverPct ?? 0);

    out.push({
      camp: c.camp,
      url: campUrl.get(c.camp),
      category,
      countries: countryList,
      matchLevel,
      countryLabel: matchLevel === 'country' ? countryList.join(', ') : `${category} (band)`,
      impressions: c.impressions,
      clicks: c.clicks,
      installs: c.installs,
      spend: c.spend,
      cpc,
      cpi,
      targetBid: tBid,
      targetCpi: tCpi,
      cpcOverPct,
      cpiOverPct,
      reasons,
      score: worstOver * c.spend,
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}
