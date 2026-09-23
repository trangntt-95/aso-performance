import type { CampLinkRow, MasterKwRow } from '@/lib/sheets/types';
import { buildCampGeoIndex, findCountriesInText, isNeverTargeted, normCountryToken, parseCampGeo, type CampGeo } from '@/lib/sheets/campGeo';
import { buildCampNameResolver, looseCampKey, normalizeCampName } from '@/lib/sheets/campName';

// Camp này chạy ở nước nào — để cột "Camp đang bid" ở Vị trí keyword xếp camp
// đúng nước lên trước và làm mờ camp không phủ.
//
// Hai nguồn, theo thứ tự tin:
//   1. Geo trong Camp_Links (include / exclude / all).
//   2. Tên camp, khi Geo trống hoặc camp không có trong Camp_Links — chỉ nhận
//      nước được GỌI TÊN: mã 2 chữ ("Exact - DE, FR", "Tier 2 - PT, RO, CO"),
//      tên đầy đủ ("Tier 1 - Japan", "Tier 3 (Argentina, Portugal)"), loại trừ
//      ("(-IN)", "Excl Phil, US, Austria").
//
// Chữ "Tier" trong tên KHÔNG đổi ra danh sách nước. Bản 22/09/2026 đã thử đổi
// qua khối Tier của Countries performance và sai ngay: Trang xếp tier theo ý
// mình lúc mở camp ("Brandname Tier 3 (31 countries)" có Colombia, trong khi
// khối Tier ghi Colombia là Tier 2; "Tier 3 (Argentina, Portugal)" nhưng Portugal
// là Tier 2; "Tier 1.5 - NZ, FI" nhưng NZ, FI là Tier 1). Tier chỉ là nhãn bid,
// không phải danh sách nước — danh sách thật chỉ có trong Geo.
//
// Kết quả không bao giờ "chắc": hạng 0 chỉ khi nước được gọi tên rõ (Geo
// include hoặc tên ghi rõ); còn lại hạng 1 (có thể phủ) và 2 (bị loại trừ hoặc
// không trong danh sách gọi tên).

export type TargetMode = 'include' | 'exclude' | 'all' | 'unknown';

export interface CampTarget {
  mode: TargetMode;
  /** Nước (tên như Country_L*) được gọi tên — include: đúng các nước này; exclude: trừ các nước này. */
  countries: string[];
  source: 'geo' | 'name' | 'none';
  /** Một dòng để hover: "Geo: Spain", "Tên: Germany, France", "Tên: trừ India". */
  label: string;
}

/** 0 = nước được gọi tên rõ · 1 = có thể phủ (all / không rõ) · 2 = không phủ. */
export type CoverRank = 0 | 1 | 2;

const EXCLUDE_HINT = /\bexcl\b|\bexclude[ds]?\b|\(-|(?:^|\s)-[A-Z]{2}\b/i;
const TIER_HINT = /\btiers?\b/i;
// "(31 countries)", "( 12 countries)", "(3 counries)" — số nước, không phải tên nước.
const COUNT_PAREN = /\(\s*\d+\s*coun\w*\s*\)/gi;

/** Đọc nước từ tên camp. Chữ Tier trong tên không đổi ra nước (xem đầu file). */
export function targetFromName(camp: string): CampTarget {
  const name = normalizeCampName(camp).replace(COUNT_PAREN, ' ');
  // "(-IN, US)": mã sau dấu trừ trong ngoặc — luôn là loại trừ.
  const exclude = new Set<string>();
  const paren = /\(-\s*([A-Za-z ,]+)\)/g;
  let m: RegExpExecArray | null;
  let body = name;
  while ((m = paren.exec(name)) !== null) {
    for (const tok of m[1].split(/[, ]+/)) {
      const t = tok.trim();
      if (!t) continue;
      const c = normCountryToken(t.toUpperCase());
      if (c && c !== t.toUpperCase()) exclude.add(c);
    }
    body = body.replace(m[0], ' ');
  }
  // Ngoặc có chữ thường là ghi chú ("(ra install IN)", "(net value 24$)"),
  // không phải danh sách nước như "(Argentina, Portugal)" hay "(IN, PK)".
  body = body.replace(/\(([^()]*)\)/g, (whole, inner: string) => (/(^|[\s,.])[a-z]/.test(inner) ? ' ' : whole));
  const segments = body.split(/\s+-\s+|_/).slice(1); // bỏ "TP"
  const include = new Set<string>();
  let tierOnly = false;
  for (const seg of segments) {
    const countries = findCountriesInText(seg);
    const isExcl = EXCLUDE_HINT.test(seg);
    if (countries.length === 0) {
      if (TIER_HINT.test(seg)) tierOnly = true;
      continue;
    }
    for (const c of countries) (isExcl ? exclude : include).add(c);
  }
  if (include.size > 0) {
    const list = Array.from(include).filter((c) => !exclude.has(c));
    return { mode: 'include', countries: list, source: 'name', label: `Tên: ${list.join(', ')}` };
  }
  if (exclude.size > 0) {
    const list = Array.from(exclude);
    return { mode: 'exclude', countries: list, source: 'name', label: `Tên: trừ ${list.join(', ')}` };
  }
  if (tierOnly) {
    return { mode: 'unknown', countries: [], source: 'none', label: 'Tên chỉ ghi Tier, không ghi nước — cần Geo trong Camp_Links' };
  }
  return { mode: 'unknown', countries: [], source: 'none', label: 'Không có Geo, tên không nói nước' };
}

export function buildCampTargetResolver(campLinks: readonly CampLinkRow[]): (camp: string, campaignId?: string) => CampTarget {
  const resolver = buildCampNameResolver(campLinks.map((c) => c.camp));
  const geoByKey = new Map<string, CampGeo>();
  buildCampGeoIndex(campLinks as CampLinkRow[]).forEach((g, name) => {
    const k = normalizeCampName(name).toLowerCase();
    const cur = geoByKey.get(k);
    if (!cur || (cur.mode === 'unknown' && g.mode !== 'unknown')) geoByKey.set(k, g);
  });
  // Theo Campaign ID — Trang đổi tên camp thường xuyên, ID thì không.
  const geoById = new Map<string, CampGeo>();
  for (const c of campLinks) {
    const id = (c.campaignId ?? '').trim();
    if (!id) continue;
    const g = parseCampGeo(c.geoRaw);
    const cur = geoById.get(id);
    if (!cur || (cur.mode === 'unknown' && g.mode !== 'unknown')) geoById.set(id, g);
  }
  const cache = new Map<string, CampTarget>();
  return (camp: string, campaignId?: string) => {
    const id = (campaignId ?? '').trim();
    const cacheKey = id ? `id:${id}|${camp}` : camp;
    const hit = cache.get(cacheKey);
    if (hit) return hit;
    const byId = id ? geoById.get(id) : undefined;
    const base = byId ? camp : resolver.resolve(camp);
    const geo = byId ?? (base ? geoByKey.get(normalizeCampName(base).toLowerCase()) : undefined);
    let out: CampTarget;
    if (geo && geo.mode === 'include' && geo.countries.length > 0) {
      out = { mode: 'include', countries: geo.countries, source: 'geo', label: `Geo: ${geo.countries.join(', ')}` };
    } else if (geo && geo.mode === 'exclude' && geo.countries.length > 0) {
      out = { mode: 'exclude', countries: geo.countries, source: 'geo', label: `Geo: trừ ${geo.countries.join(', ')}` };
    } else if (geo && geo.mode === 'all') {
      // Geo ghi "All (excl)" nhưng tên có "(-IN)" hay "excl …" → tên cụ thể hơn.
      const fromName = targetFromName(camp);
      out = fromName.mode === 'include' || fromName.mode === 'exclude' ? fromName : { mode: 'all', countries: [], source: 'geo', label: 'Geo: mọi nước' };
    } else {
      out = targetFromName(camp);
      // Camp không có trong Camp_Links (thường là đã đổi tên bên Shopify mà
      // Master còn giữ tên cũ) — nói rõ để Trang biết vì sao không có Geo.
      if (!base) out = { ...out, label: `${out.label} · không có trong Camp_Links` };
    }
    cache.set(cacheKey, out);
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

/**
 * Camp đang chạy mà Camp_Links ghi Geo gồm nước này, nhưng Master KW Lookup
 * không có dòng keyword nào của camp → dashboard không biết camp bid gì, nên
 * cột "Camp đang bid" liệt kê nó như GỢI Ý theo Geo (tên + URL), không phải
 * cảnh báo (Trang 22/09: bảng không hiện warning, giải thích để ở chân bảng). Đo 22/09/2026: 44 camp Camp_Links như vậy, trong đó
 * "TP - Brandname - Exact - Tier 3 (31 countries)" và "TP - Profit - Exact 01 -
 * Tier 2 - PT, RO, CO, UY. IT (NEW)" đều phủ Colombia — Trang hỏi vì sao dòng
 * profit × Colombia không thấy chúng.
 */
export interface GeoCampSuggestion {
  camp: string;
  url: string;
}

export function buildGeoCampsMissingInMaster(
  campLinks: readonly CampLinkRow[],
  pausedKw: readonly MasterKwRow[],
  master: readonly MasterKwRow[],
): ((country: string) => GeoCampSuggestion[]) & { all: GeoCampSuggestion[] } {
  const key = (n: string) => looseCampKey(normalizeCampName(n));
  const paused = new Set(pausedKw.map((p) => key(p.camp)));
  const resolver = buildCampNameResolver(campLinks.map((c) => c.camp));
  const inMaster = new Set<string>();
  const inMasterId = new Set<string>();
  for (const m of master) {
    if (!m.camp) continue;
    inMaster.add(key(m.camp));
    if (m.campaignId) inMasterId.add(m.campaignId.trim());
    const base = resolver.resolve(m.camp);
    if (base) inMaster.add(key(base));
  }
  const byCountry = new Map<string, GeoCampSuggestion[]>();
  const all: GeoCampSuggestion[] = [];
  for (const c of campLinks) {
    const k = key(c.camp);
    const id = (c.campaignId ?? '').trim();
    if (!k || paused.has(k) || inMaster.has(k) || (id && inMasterId.has(id))) continue;
    const geo = parseCampGeo(c.geoRaw);
    if (geo.mode !== 'include') continue;
    const item = { camp: c.camp, url: c.url ?? '' };
    if (!all.some((x) => x.camp === c.camp)) all.push(item);
    for (const country of geo.countries) {
      const arr = byCountry.get(country);
      if (arr) {
        if (!arr.some((x) => x.camp === c.camp)) arr.push(item);
      } else byCountry.set(country, [item]);
    }
  }
  const fn = ((country: string) => byCountry.get(country) ?? []) as ((country: string) => GeoCampSuggestion[]) & { all: GeoCampSuggestion[] };
  fn.all = all;
  return fn;
}
