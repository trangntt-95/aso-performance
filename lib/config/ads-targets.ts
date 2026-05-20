/**
 * Monthly install targets cho paid search ads.
 * Update mỗi đầu quý — chỉnh ở đây, không hardcode rải rác trong UI.
 */
// Shopify Ads monthly install targets (search_ad surface only).
export const ADS_MONTHLY_TARGETS: Record<string, number> = {
  '2026-03': 178,
  '2026-04': 195,
  '2026-05': 203,
  '2026-06': 213,
  '2026-07': 222,
  '2026-08': 244,
  '2026-09': 234,
};

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Target install cho cửa sổ window theo logic monthly:
 *   - L3/L7/L14: pro-rate từ current month = monthly / days × N
 *   - L30: full current month target
 *   - L90: sum target của 3 tháng gần nhất (M-2, M-1, M)
 * Trả về null nếu thiếu data cho bất kỳ tháng cần thiết.
 */
export function expectedAdsInstalls(windowDays: number, asOf: Date = new Date()): number | null {
  const currentMonthKey = ymKey(asOf);
  const currentMonthly = ADS_MONTHLY_TARGETS[currentMonthKey];

  if (windowDays === 30) {
    return currentMonthly ?? null;
  }

  if (windowDays === 90) {
    let total = 0;
    for (let i = 0; i < 3; i++) {
      const d = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1);
      const t = ADS_MONTHLY_TARGETS[ymKey(d)];
      if (t === undefined) return null; // thiếu 1 tháng → bail
      total += t;
    }
    return total;
  }

  // L3, L7, L14 → daily rate × N từ current month
  if (currentMonthly === undefined) return null;
  const days = daysInMonth(asOf.getFullYear(), asOf.getMonth());
  return (currentMonthly / days) * windowDays;
}

/**
 * Runrate dự kiến cuối tháng dựa trên pace của window được chọn.
 *   pace = actualInstalls / windowDays
 *   projection = pace × số ngày trong tháng hiện tại
 *   pct = projection / current month target
 * Trả null nếu thiếu target tháng hiện tại hoặc windowDays/actualInstalls invalid.
 */
export function runrateAdsToMonthEnd(
  windowDays: number,
  actualInstalls: number,
  asOf: Date = new Date(),
): { pct: number; projectedInstalls: number; monthlyTarget: number } | null {
  if (!Number.isFinite(windowDays) || windowDays <= 0) return null;
  if (!Number.isFinite(actualInstalls) || actualInstalls < 0) return null;
  const monthlyTarget = ADS_MONTHLY_TARGETS[ymKey(asOf)];
  if (monthlyTarget === undefined || monthlyTarget <= 0) return null;
  const days = daysInMonth(asOf.getFullYear(), asOf.getMonth());
  const projectedInstalls = (actualInstalls / windowDays) * days;
  return { pct: projectedInstalls / monthlyTarget, projectedInstalls, monthlyTarget };
}
