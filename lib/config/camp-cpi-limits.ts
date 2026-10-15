/**
 * Trần CPI "không vượt" theo LOẠI camp — chốt với Trang 15/10/2026, dùng để cảnh
 * báo ở Camp Health và Overbid (qua buildCampBenchmark). Khác trần NPI × 90% của
 * Max bid cap (điểm hoà vốn 4 tháng): đây là mức an toàn thấp hơn vì NPI Feature
 * đứng trên rất ít shop trả tiền (6/58 install paid, 10/2026) — mất 1–2 shop là
 * NPI tụt, nên không mua sát hoà vốn. Trần hiệu lực = min(NPI × 90%, trần cứng).
 *
 *   Feature Exact, nước tier 1 (US, AU, UK, CA, Premium/Strong) … $45
 *   Feature Exact, tier 2–3 / excl tier 1 ………………………………… $30
 *   CPM Broad Feature ………………………………………………………………… $15 (đang đạt $8–10)
 *
 * Thêm loại camp khác thì thêm rule ở đây, không hardcode trong UI.
 */

export interface CampCpiLimit {
  /** Trần cứng, USD / install. */
  limit: number;
  /** Nhãn ngắn hiện trong tooltip / lý do, ví dụ 'Feature Exact tier 1'. */
  label: string;
}

export type CampTierHint = 'tier1' | 'lower' | 'unknown';

/** Tier của Max bid cap là tier 1 (Premium / Strong) hay thấp hơn. */
export function tierHintFromLabel(tier: string | null | undefined): CampTierHint {
  if (!tier) return 'unknown';
  if (/tier\s*1\s*(premium|strong)/i.test(tier) || /^tier\s*1$/i.test(tier.trim())) return 'tier1';
  return 'lower';
}

/**
 * Đọc tier từ TÊN camp (Trang đặt tên có "Tier 1", "tier 2+", "excl tier 1,2",
 * "(-tier 1)"). Tên nói rõ thì thắng Geo, vì Geo của camp tier thấp thường là
 * "All (excl)". Không đọc được → 'unknown' để rơi về Geo.
 */
export function tierHintFromName(camp: string): CampTierHint {
  const n = camp.toLowerCase();
  if (/(excl|exclude|-)\s*tier\s*1/.test(n)) return 'lower';
  if (/tier\s*(2|3)\b/.test(n) && !/tier\s*1\b/.test(n)) return 'lower';
  if (/tier\s*1\s*[,.]\s*5\b/.test(n) && !/tier\s*1\b[^,.]/.test(n)) return 'lower';
  if (/tier\s*1\b/.test(n)) return 'tier1';
  return 'unknown';
}

/**
 * Trần cứng cho một camp, hoặc null khi loại camp chưa có rule.
 * `category` là category Max bid cap đã map từ tên ('Feature', 'CPM', …);
 * `tier` là tier của các nước camp target (từ Geo), đã gộp: có nước tier 1 → 'tier1'.
 */
export function hardCpiLimitFor(camp: string, category: string | null, tier: CampTierHint): CampCpiLimit | null {
  const isFeature = category === 'Feature' || /\bfeature\b/i.test(camp);
  if (!isFeature) return null;
  if (category === 'CPM' || /\bcpm\b|\bbroad\b/i.test(camp)) return { limit: 15, label: 'CPM Broad Feature' };
  const byName = tierHintFromName(camp);
  const t = byName !== 'unknown' ? byName : tier;
  // Không rõ tier (Geo trống, tên không nói) → coi như chạy mọi nước, dùng mốc tier 1.
  if (t === 'lower') return { limit: 30, label: 'Feature Exact tier 2–3' };
  return { limit: 45, label: 'Feature Exact tier 1' };
}
