import type { CampLinkRow } from './types';
import { normalizeCampName, buildCampLinkResolver } from './campName';

/**
 * Camp name → its Shopify Ads URL, tolerant of the performance tags Trang adds
 * to camp names ("(CPI 41)", "- cân nhắc off") which Camp_Links doesn't carry.
 *
 * Resolution is the same two-step the overbid detector uses: try the
 * note-stripped name directly, then fall back to matching it against the known
 * Camp_Links base names. Extracted here because three tables now need it.
 */
export interface CampUrlIndex {
  get(camp: string): string | undefined;
  /** Campaign ID theo tên camp (cột Campaign ID của Camp_Links; không có thì
   *  lấy số cuối URL). Để ô tìm kiếm khớp theo ID — Trang 01/10/2026: tên đổi
   *  đuôi liên tục, gõ ID "44442" khớp dễ hơn. */
  idOf(camp: string): string | undefined;
  /** Theo Campaign ID — chắc nhất, không phụ thuộc tên camp đổi tag. */
  getById(campaignId: string | undefined): string | undefined;
  size: number;
}

/** "https://partners.shopify.com/832504/ads/74102" → "74102". */
export function campaignIdFromUrl(url: string | undefined): string | undefined {
  const m = (url ?? '').match(/\/ads\/(\d+)(?!\d)/);
  return m ? m[1] : undefined;
}

export function buildCampUrlIndex(campLinks: CampLinkRow[]): CampUrlIndex {
  const byName = new Map<string, string>();
  const idByName = new Map<string, string>();
  for (const c of campLinks) {
    if (!c.camp) continue;
    const key = normalizeCampName(c.camp).toLowerCase();
    if (c.url && !byName.has(key)) byName.set(key, c.url);
    const id = (c.campaignId ?? '').trim() || campaignIdFromUrl(c.url);
    if (id && !idByName.has(key)) idByName.set(key, id);
  }
  const byId = new Map<string, string>();
  for (const c of campLinks) {
    const id = (c.campaignId ?? '').trim();
    if (id && c.url && !byId.has(id)) byId.set(id, c.url);
  }
  const resolver = buildCampLinkResolver(campLinks);
  return {
    size: byName.size,
    getById(campaignId) {
      const id = (campaignId ?? '').trim();
      return id ? byId.get(id) : undefined;
    },
    get(camp) {
      const direct = byName.get(normalizeCampName(camp).toLowerCase());
      if (direct) return direct;
      const base = resolver.resolve(camp);
      return base ? byName.get(base.toLowerCase()) : undefined;
    },
    idOf(camp) {
      const direct = idByName.get(normalizeCampName(camp).toLowerCase());
      if (direct) return direct;
      const base = resolver.resolve(camp);
      return base ? idByName.get(base.toLowerCase()) : undefined;
    },
  };
}
