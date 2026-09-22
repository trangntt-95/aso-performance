import type { CampLinkRow } from './types';

/**
 * Camp geo targeting parsed from Camp_Links' free-text Geo column.
 *
 * Real-world cell formats (verified live 2026-06-05):
 *   ""                                  → unknown (Trang hasn't filled it)
 *   "All countries/regions"            → all
 *   "All (excl)"                       → all (9/2026: 187 dòng — "mọi nước trừ
 *                                         nước không target ở cấp tài khoản",
 *                                         đúng nghĩa của general)
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
  // Bổ sung 22/09/2026 để đọc nước từ tên camp ("Tier 2 - PT, RO, CO, UY", "-BR").
  AT: 'Austria',
  GR: 'Greece',
  CL: 'Chile',
  SG: 'Singapore',
  AE: 'United Arab Emirates',
  MX: 'Mexico',
  HU: 'Hungary',
  RO: 'Romania',
  CO: 'Colombia',
  UY: 'Uruguay',
  BR: 'Brazil',
  AR: 'Argentina',
  KR: 'South Korea',
  CN: 'China',
  PH: 'Philippines',
  ZA: 'South Africa',
  IE: 'Ireland',
  DK: 'Denmark',
  CZ: 'Czechia',
  IL: 'Israel',
  EG: 'Egypt',
  MA: 'Morocco',
  ID: 'Indonesia',
  TH: 'Thailand',
  MY: 'Malaysia',
  SA: 'Saudi Arabia',
  NG: 'Nigeria',
  PE: 'Peru',
  BD: 'Bangladesh',
  TW: 'Taiwan',
  LT: 'Lithuania',
  LV: 'Latvia',
  EE: 'Estonia',
  BG: 'Bulgaria',
  HR: 'Croatia',
  SK: 'Slovakia',
  SI: 'Slovenia',
  CY: 'Cyprus',
  KW: 'Kuwait',
  QA: 'Qatar',
  LB: 'Lebanon',
  JO: 'Jordan',
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
  phil: 'Philippines',
  philippines: 'Philippines',
  holland: 'Netherlands',
  japan: 'Japan',
  brazil: 'Brazil',
};

// Mọi cụm chữ chỉ nước mà module này biết (tiếng Việt, alias Anh, tên chuẩn
// Country_L*) → tên chuẩn. Dài trước ngắn để "New Zealand" ăn trước "Zealand".
let PHRASES: [string, string][] | null = null;
function countryPhrases(): [string, string][] {
  if (PHRASES) return PHRASES;
  const m = new Map<string, string>();
  for (const k of Object.keys(VN_TO_EN)) m.set(k, VN_TO_EN[k]);
  for (const k of Object.keys(EN_ALIASES)) m.set(k, EN_ALIASES[k]);
  for (const k of Object.keys(CODE_TO_EN)) m.set(CODE_TO_EN[k].toLowerCase(), CODE_TO_EN[k]);
  PHRASES = Array.from(m.entries()).sort((a, b) => b[0].length - a[0].length);
  return PHRASES;
}

const LETTER = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;

/**
 * Nước được gọi tên trong một đoạn chữ tự do (tên camp): tên đầy đủ Anh/Việt
 * ("Japan", "New Zealand", "Tây Ban Nha", "Czech") và mã 2 chữ IN HOA ("DE",
 * "CO"). Chỉ nhận cụm nguyên chữ — "IT" trong "ITEM" hay "no" thường không
 * tính. Không đoán gì ngoài các bảng trên.
 */
export function findCountriesInText(text: string): string[] {
  // Gom theo vị trí trong chuỗi để nhãn "Tên: A, B" giữ thứ tự Trang viết.
  const hits: { at: number; c: string }[] = [];
  const push = (at: number, c: string) => {
    if (!hits.some((h) => h.c === c)) hits.push({ at, c });
  };
  let rest = text;
  for (const [phrase, canon] of countryPhrases()) {
    if (phrase.length < 3) continue; // mã 2 chữ xử lý riêng (phải viết hoa)
    let from = 0;
    for (;;) {
      const i = rest.toLowerCase().indexOf(phrase, from);
      if (i < 0) break;
      const before = i > 0 ? rest.charAt(i - 1) : '';
      const after = rest.charAt(i + phrase.length);
      const hit = rest.slice(i, i + phrase.length);
      // Cụm 3 chữ ("UAE", "USA", "Nga", "Anh") chỉ nhận khi viết HOA — "anh",
      // "nga" viết thường trong ghi chú tiếng Việt không phải tên nước.
      const okCase = phrase.length > 3 || hit === hit.toUpperCase();
      if (okCase && !LETTER.test(before) && !LETTER.test(after)) {
        push(i, canon);
        rest = rest.slice(0, i) + ' '.repeat(phrase.length) + rest.slice(i + phrase.length);
      }
      from = i + phrase.length;
    }
  }
  // "KW" trong tên camp là "keyword" ("Test - Feature KW"), không phải Kuwait.
  const code = /(^|[^A-Za-z])([A-Z]{2})(?![A-Za-z])/g;
  let m: RegExpExecArray | null;
  while ((m = code.exec(rest)) !== null) {
    if (m[2] === 'KW') continue;
    const c = CODE_TO_EN[m[2]];
    if (c) push(m.index + m[1].length, c);
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.c);
}

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
  if (lower.includes('all countries') || /^\d+\s+countries/.test(lower) || /^all\b/.test(lower)) {
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

/**
 * Countries the account never advertises in (rule confirmed by Trang 2026-08).
 *
 * The Geo column reads: a camp naming countries targets EXACTLY those; a camp
 * leaving Geo blank targets everything EXCEPT this list. So the list is the
 * account-level negative geo, and it applies on top of a camp's own exclusions
 * too ("-IN" still doesn't mean the camp runs in Nigeria).
 *
 * Two uses: (1) resolving what a blank-Geo camp actually covers; (2) never
 * flagging these as a coverage GAP — "chưa bid ở India" is intentional.
 *
 * Spelling: the tabs disagree on the Dominican Republic ('Dominican Rep' in
 * 'Max bid cap' vs 'Dominican Republic' in Country_L*), so both are listed —
 * a name that matches nothing is simply inert. NB: Trang's list says
 * "Dominica"; no tab carries that island, so this reads it as the Dominican
 * Republic. 'Palestinian Territory, Occupied' appears in neither tab today and
 * is kept only so the rule stays complete if it shows up later.
 */
export const NEVER_TARGET_COUNTRIES = new Set([
  'India',
  'Nigeria',
  'Vietnam',
  'Pakistan',
  'South Africa',
  'Malaysia',
  'Palestinian Territory, Occupied',
  'Saudi Arabia',
  'Morocco',
  'Kenya',
  'Dominica',
  'Dominican Rep',
  'Dominican Republic',
  'Bangladesh',
  'Venezuela',
]);

/** True when the account never bids in this country, whatever a camp's Geo says. */
export function isNeverTargeted(country: string): boolean {
  return NEVER_TARGET_COUNTRIES.has(country);
}

/** Camp có Geo này có phủ nước không. Geo trống = mọi nước trừ IN/PK/VN. */
export const campGeoCovers = (geo: CampGeo, country: string): boolean => {
  switch (geo.mode) {
    case 'all':
      return true;
    case 'include':
      return geo.countries.includes(country);
    case 'exclude':
      return !geo.countries.includes(country);
    default:
      // unknown = ô Geo để trống. Quy tắc: target = tất cả nước − exclude mặc
      // định (IN, PK, VN). Nên camp geo-trống cover mọi nước trừ 3 nước này.
      return !NEVER_TARGET_COUNTRIES.has(country);
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
 *  Blank-Geo camps are treated as targeting ALL countries, so a country is a GAP
 *  only when NO camp (known-geo or blank) covers it. `hasUnknownGeo` is still
 *  reported for reference but no longer blocks gaps. */
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
    // Never flag India/Pakistan/Vietnam as a gap — intentionally not targeted.
    if (NEVER_TARGET_COUNTRIES.has(country)) {
      continue;
    }
    // A blank-Geo camp now counts as covering everything (see `covers`), so a
    // country is a GAP only when NO camp — known or blank — targets it.
    if (geos.some((g) => campGeoCovers(g, country))) covered.push(country);
    else gaps.push(country);
  }
  return { covered, gaps, hasUnknownGeo };
}
