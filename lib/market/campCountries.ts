import type { CampLinkRow, MarketTierRow } from '@/lib/sheets/types';
import { buildCampGeoIndex, isNeverTargeted, normCountryToken, type CampGeo } from '@/lib/sheets/campGeo';
import { buildCampNameResolver, normalizeCampName } from '@/lib/sheets/campName';

// Camp này chạy ở nước nào — để cột "Camp đang bid" ở Vị trí keyword xếp camp
// đúng nước lên trước và làm mờ camp không phủ.
//
// Hai nguồn, theo thứ tự tin:
//   1. Geo trong Camp_Links (include / exclude / all).
//   2. Tên camp, khi Geo trống — Trang đặt tên theo nước hoặc tier rất đều:
//      "Exact - DE, FR", "US 🏆", "Tier 2 - PT, RO, CO, UY. IT", "(-IN)",
//      "Excl Phil, US, Austria", "excl tier 1,2", "Tier 1 Premium - AU",
//      "tier 2+", "Tier 1-2". Tier đổi ra danh sách nước qua khối Tier của
//      Countries performance. Đo 22/09/2026: phần lớn camp Profit theo tier và
//      mọi camp Language không có Geo, nên không đọc tên thì cột Camp xếp camp
//      Tier 3 Argentina lên đầu dòng profit × Spain.
//
// Kết quả không bao giờ "chắc": tên camp là gợi ý, nên hạng 0 chỉ khi nước được
// gọi tên rõ (Geo include, hoặc tên/tier ghi rõ); còn lại hạng 1 (có thể phủ)
// và 2 (bị loại trừ hoặc không trong danh sách).

export type TargetMode = 'include' | 'exclude' | 'all' | 'unknown';

export interface CampTarget {
  mode: TargetMode;
  /** Nước (tên như Country_L*) được gọi tên — include: đúng các nước này; exclude: trừ các nước này. */
  countries: string[];
  source: 'geo' | 'name' | 'none';
  /** Một dòng để hover: "Geo: Spain", "Tên: Tier 2 → 8 nước", "trừ India". */
  label: string;
}

/** 0 = nước được gọi tên rõ · 1 = có thể phủ (all / không rõ) · 2 = không phủ. */
export type CoverRank = 0 | 1 | 2;

const TIER_WORDS: { re: RegExp; tiers: string[] }[] = [
  { re: /tier\s*1\s*(?:-\s*)?premium/i, tiers: ['tier 1 - premium'] },
  { re: /tier\s*1\s*(?:-\s*)?strong/i, tiers: ['tier 1 - strong'] },
  { re: /tier\s*1\s*[,.]\s*5/i, tiers: ['tier 1,5'] },
  { re: /tier\s*1\s*-\s*2\b/i, tiers: ['tier 1 - premium', 'tier 1 - strong', 'tier 1,5', 'tier 2'] },
  { re: /tier\s*1\b(?!\s*[,.]\s*5)(?!\s*-\s*2)/i, tiers: ['tier 1 - premium', 'tier 1 - strong'] },
  { re: /tier\s*2\s*\+/i, tiers: ['__tier2plus__'] },
  { re: /tier\s*2\b/i, tiers: ['tier 2'] },
  { re: /tier\s*3\b/i, tiers: ['__tier3__'] },
];

const EXCLUDE_HINT = /\bexcl\b|\bexclude\b|\(-|(?:^|\s)-[A-Z]{2}\b/i;

function tierCountries(tiers: MarketTierRow[], key: string): string[] {
  const t = tiers.find((x) => x.tier.trim().toLowerCase().replace(/\s+/g, ' ') === key);
  return t ? t.countries.map((c) => c.country) : [];
}

/** Nước nhắc trong một đoạn tên: mã 2 chữ hoa, hoặc tên nước / tier. */
function countriesInSegment(seg: string, tiers: MarketTierRow[]): { countries: string[]; tierBelow: 'tier2plus' | 'tier3' | null } {
  const out = new Set<string>();
  let tierBelow: 'tier2plus' | 'tier3' | null = null;
  for (const tw of TIER_WORDS) {
    if (!tw.re.test(seg)) continue;
    for (const key of tw.tiers) {
      if (key === '__tier2plus__') tierBelow = 'tier2plus';
      else if (key === '__tier3__') tierBelow = 'tier3';
      else for (const c of tierCountries(tiers, key)) out.add(c);
    }
    break;
  }
  // Bỏ phần "(CPI 41)" và các số, rồi tách theo dấu phẩy / chấm / khoảng trắng.
  const cleaned = seg.replace(/\([^)]*\)/g, ' ').replace(/[🏆✅⚠️!]/g, ' ');
  for (const tok of cleaned.split(/[,./&+]+|\s+/)) {
    const t = tok.trim();
    if (!t || /^\d+$/.test(t)) continue;
    if (/^[A-Z]{2}$/.test(t)) {
      const c = normCountryToken(t);
      if (c && c !== t) out.add(c);
      continue;
    }
    if (/^[A-Z][a-zA-Z]{3,}$/.test(t)) {
      const c = normCountryToken(t);
      // normCountryToken trả nguyên token khi không biết → chỉ nhận khi nó đổi
      // dạng, hoặc là tên nước nằm trong khối Tier.
      if (c && (c !== t || tiers.some((x) => x.countries.some((y) => y.country === c)))) out.add(c);
    }
  }
  return { countries: Array.from(out), tierBelow };
}

/** Đọc nước từ tên camp. */
export function targetFromName(camp: string, tiers: MarketTierRow[]): CampTarget {
  const name = normalizeCampName(camp);
  const segments = name.split(/\s+-\s+/).slice(1); // bỏ "TP"
  const include = new Set<string>();
  const exclude = new Set<string>();
  let excludeTiers: string[] = [];
  let tierBelow: 'tier2plus' | 'tier3' | null = null;
  for (const seg of segments) {
    const isExcl = EXCLUDE_HINT.test(seg);
    const { countries, tierBelow: tb } = countriesInSegment(seg, tiers);
    if (isExcl) {
      for (const c of countries) exclude.add(c);
      // "excl tier 1,2" — trừ cả các tier gọi tên
      if (/tier/i.test(seg)) excludeTiers = countries;
    } else {
      for (const c of countries) include.add(c);
      if (tb) tierBelow = tb;
    }
  }
  // "(-IN, US)" kiểu ngoặc: mã sau dấu trừ
  const paren = /\(-\s*([A-Za-z ,]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = paren.exec(camp)) !== null) {
    for (const tok of m[1].split(/[, ]+/)) {
      const c = normCountryToken(tok.trim().toUpperCase());
      if (c && c !== tok.trim().toUpperCase()) exclude.add(c);
    }
  }
  if (include.size > 0) {
    const list = Array.from(include).filter((c) => !exclude.has(c));
    return { mode: 'include', countries: list, source: 'name', label: `Tên: ${list.join(', ')}` };
  }
  if (tierBelow) {
    // Tier 2+ / Tier 3: mọi nước trừ các tier cao hơn.
    const higher = tierBelow === 'tier2plus'
      ? ['tier 1 - premium', 'tier 1 - strong', 'tier 1,5']
      : ['tier 1 - premium', 'tier 1 - strong', 'tier 1,5', 'tier 2'];
    const ex = new Set(exclude);
    for (const k of higher) for (const c of tierCountries(tiers, k)) ex.add(c);
    return { mode: 'exclude', countries: Array.from(ex), source: 'name', label: `Tên: ${tierBelow === 'tier2plus' ? 'Tier 2+' : 'Tier 3'} (trừ tier cao hơn)` };
  }
  if (exclude.size > 0 || excludeTiers.length > 0) {
    const ex = new Set(Array.from(exclude).concat(excludeTiers));
    return { mode: 'exclude', countries: Array.from(ex), source: 'name', label: `Tên: trừ ${Array.from(ex).join(', ')}` };
  }
  return { mode: 'unknown', countries: [], source: 'none', label: 'Không có Geo, tên không nói nước' };
}

export function buildCampTargetResolver(
  campLinks: readonly CampLinkRow[],
  tiers: readonly MarketTierRow[],
): (camp: string) => CampTarget {
  const resolver = buildCampNameResolver(campLinks.map((c) => c.camp));
  const geoByKey = new Map<string, CampGeo>();
  buildCampGeoIndex(campLinks as CampLinkRow[]).forEach((g, name) => {
    const k = normalizeCampName(name).toLowerCase();
    const cur = geoByKey.get(k);
    if (!cur || (cur.mode === 'unknown' && g.mode !== 'unknown')) geoByKey.set(k, g);
  });
  const cache = new Map<string, CampTarget>();
  return (camp: string) => {
    const hit = cache.get(camp);
    if (hit) return hit;
    const base = resolver.resolve(camp) ?? normalizeCampName(camp);
    const geo = geoByKey.get(normalizeCampName(base).toLowerCase());
    let out: CampTarget;
    if (geo && geo.mode === 'include' && geo.countries.length > 0) {
      out = { mode: 'include', countries: geo.countries, source: 'geo', label: `Geo: ${geo.countries.join(', ')}` };
    } else if (geo && geo.mode === 'exclude' && geo.countries.length > 0) {
      out = { mode: 'exclude', countries: geo.countries, source: 'geo', label: `Geo: trừ ${geo.countries.join(', ')}` };
    } else if (geo && geo.mode === 'all') {
      // Geo ghi "All (excl)" nhưng tên có "(-IN)" hay "excl …" → tên cụ thể hơn.
      const fromName = targetFromName(camp, tiers as MarketTierRow[]);
      out = fromName.mode === 'include' || fromName.mode === 'exclude' ? fromName : { mode: 'all', countries: [], source: 'geo', label: 'Geo: mọi nước' };
    } else {
      out = targetFromName(camp, tiers as MarketTierRow[]);
    }
    cache.set(camp, out);
    return out;
  };
}

/** Camp có phủ nước này không — 0 gọi tên rõ, 1 có thể, 2 không. */
export function coverRank(t: CampTarget, country: string): CoverRank {
  switch (t.mode) {
    case 'include':
      return t.countries.includes(country) ? 0 : 2;
    case 'exclude':
      return t.countries.includes(country) || isNeverTargeted(country) ? 2 : 1;
    default:
      return isNeverTargeted(country) ? 2 : 1;
  }
}
