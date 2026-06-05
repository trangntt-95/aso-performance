import type { CampLinkRow } from './types';

/**
 * Camp geo targeting parsed from Camp_Links' free-text Geo column.
 *
 * Real-world cell formats (verified live 2026-06-05):
 *   ""                                  → unknown (Trang hasn't filled it)
 *   "All countries/regions"            → all
 *   "180 countries"                    → all (Shopify "almost everywhere")
 *   "-IN, PK, VN"                      → exclude: India, Pakistan, Vietnam
 *   "exclude:\nTây Ban Nha\n..."       → exclude list (VN names, multiline)
 *   "Đức, Pháp" / "United States"      → include list (VN/EN names mixed,
 *                                         separated by , or newlines, stray quotes)
 *
 * Country names are normalised to the EXACT spelling the Country_L* tabs use
 * (English, e.g. "Türkiye", "Czechia") so coverage can be joined against
 * keyword traffic countries.
 */
export interface CampGeo {
  mode: 'all' | 'include' | 'exclude' | 'unknown';
  /** Normalised EN country names (empty for all/unknown). */
  countries: string[];
}

// VN country names (lowercase, as they appear in the sheet) → Country_L* spelling.
const VN_TO_EN: Record<string, string> = {
  'đức': 'Germany',
  'pháp': 'France',
  'tây ban nha': 'Spain',
  'hoa kỳ': 'United States',
  'mỹ': 'United States',
  'ấn độ': 'India',
  'việt nam': 'Vietnam',
  'hà lan': 'Netherlands',
  'vương quốc anh': 'United Kingdom',
  'anh': 'United Kingdom',
  'thổ nhĩ kỳ': 'Türkiye',
  'thụy sĩ': 'Switzerland',
  'ba lan': 'Poland',
  'bồ đào nha': 'Portugal',
  'na uy': 'Norway',
  'thụy điển': 'Sweden',
  'hy lạp': 'Greece',
  'litva': 'Lithuania',
  'các tiểu vương quốc ả rập thống nhất': 'United Arab Emirates',
  'phần lan': 'Finland',
  'bỉ': 'Belgium',
  'áo': 'Austria',
  'đan mạch': 'Denmark',
  'síp': 'Cyprus',
  'trung quốc': 'China',
  'hàn quốc': 'South Korea',
  'đài loan': 'Taiwan',
  'ukraina': 'Ukraine',
  'séc': 'Czechia',
  'nhật bản': 'Japan',
  'nga': 'Russia',
  'ý': 'Italy',
  'úc': 'Australia',
};

// 2-letter codes used in "-IN, PK, VN"-style cells and camp names.
const CODE_TO_EN: Record<string, string> = {
  IN: 'India',
  PK: 'Pakistan',
  VN: 'Vietnam',
  US: 'United States',
  UK: 'United Kingdom',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  ES: 'Spain',
  SE: 'Sweden',
  AU: 'Australia',
  NL: 'Netherlands',
  CA: 'Canada',
  TR: 'Türkiye',
  CH: 'Switzerland',
  PT: 'Portugal',
  NO: 'Norway',
  PL: 'Poland',
  NZ: 'New Zealand',
  FI: 'Finland',
  IT: 'Italy',
  BE: 'Belgium',
  HK: 'Hong Kong',
  JP: 'Japan',
  BL: 'Bangladesh',
};

// EN spellings that differ from the Country_L* canon.
const EN_ALIASES: Record<string, string> = {
  turkey: 'Türkiye',
  czech: 'Czechia',
  'czech republic': 'Czechia',
  hungary: 'Hungary',
  'hủngary': 'Hungary', // sheet typo
  uae: 'United Arab Emirates',
  usa: 'United States',
  korea: 'South Korea',
};

/** Normalise one free-text country token → Country_L* spelling (or the raw
 *  token title-cased when unrecognised — it simply won't join, never crashes). */
export function normCountryToken(raw: string): string | null {
  const t = raw.replace(/["“”]/g, '').trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (VN_TO_EN[lower]) return VN_TO_EN[lower];
  if (EN_ALIASES[lower]) return EN_ALIASES[lower];
  if (/^[A-Za-z]{2}$/.test(t) && CODE_TO_EN[t.toUpperCase()]) return CODE_TO_EN[t.toUpperCase()];
  return t; // assume already EN canon ("United States", "Japan", …)
}

const splitTokens = (s: string): string[] =>
  s
    .split(/[,\n\r]+/)
    .map((x) => normCountryToken(x))
    .filter((x): x is string => !!x);

export function parseCampGeo(geoRaw: string): CampGeo {
  const g = (geoRaw ?? '').trim();
  if (!g) return { mode: 'unknown', countries: [] };
  const lower = g.toLowerCase();
  if (lower.includes('all countries') || /^\d+\s+countries/.test(lower)) {
    return { mode: 'all', countries: [] };
  }
  if (lower.startsWith('exclude')) {
    return { mode: 'exclude', countries: splitTokens(g.replace(/^exclude:?/i, '')) };
  }
  if (g.startsWith('-')) {
    return { mode: 'exclude', countries: splitTokens(g.replace(/^-\s*/, '')) };
  }
  return { mode: 'include', countries: splitTokens(g) };
}

/** camp name → CampGeo. Duplicate Camp_Links rows: first geo-bearing row wins. */
export function buildCampGeoIndex(campLinks: CampLinkRow[]): Map<string, CampGeo> {
  const index = new Map<string, CampGeo>();
  for (const r of campLinks) {
    const geo = parseCampGeo(r.geoRaw);
    const existing = index.get(r.camp);
    if (!existing || (existing.mode === 'unknown' && geo.mode !== 'unknown')) {
      index.set(r.camp, geo);
    }
  }
  return index;
}

const covers = (geo: CampGeo, country: string): boolean | null => {
  switch (geo.mode) {
    case 'all':
      return true;
    case 'include':
      return geo.countries.includes(country);
    case 'exclude':
      return !geo.countries.includes(country);
    default:
      return null; // unknown
  }
};

export interface CountryCoverage {
  /** Countries (among the ones asked about) covered by ≥1 active camp. */
  covered: string[];
  /** Countries NOT covered by ANY active camp — only when every camp's geo is known. */
  gaps: string[];
  /** ≥1 camp has unknown geo → gaps can't be asserted for the remaining countries. */
  hasUnknownGeo: boolean;
}

/** For a keyword bid in `camps`, classify each traffic country as covered / gap.
 *  A country is a GAP only when every camp has known geo and none covers it —
 *  with any unknown-geo camp the verdict downgrades to "maybe" (hasUnknownGeo). */
export function resolveCountryCoverage(
  camps: string[],
  trafficCountries: string[],
  geoIndex: Map<string, CampGeo>,
): CountryCoverage {
  const geos = camps.map((c) => geoIndex.get(c) ?? { mode: 'unknown' as const, countries: [] });
  const hasUnknownGeo = geos.some((g) => g.mode === 'unknown');
  const covered: string[] = [];
  const gaps: string[] = [];
  for (const country of trafficCountries) {
    if (geos.some((g) => covers(g, country) === true)) covered.push(country);
    else if (!hasUnknownGeo) gaps.push(country);
  }
  return { covered, gaps, hasUnknownGeo };
}
