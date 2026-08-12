import type { CampLinkRow } from './types';
import { normalizeCampName, buildCampNameResolver } from './campName';

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
  size: number;
}

export function buildCampUrlIndex(campLinks: CampLinkRow[]): CampUrlIndex {
  const byName = new Map<string, string>();
  for (const c of campLinks) {
    if (!c.camp || !c.url) continue;
    const key = normalizeCampName(c.camp).toLowerCase();
    if (!byName.has(key)) byName.set(key, c.url);
  }
  const resolver = buildCampNameResolver(campLinks.map((c) => c.camp));
  return {
    size: byName.size,
    get(camp) {
      const direct = byName.get(normalizeCampName(camp).toLowerCase());
      if (direct) return direct;
      const base = resolver.resolve(camp);
      return base ? byName.get(base.toLowerCase()) : undefined;
    },
  };
}
