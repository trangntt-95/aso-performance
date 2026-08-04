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
  '2026-07': 165,
  '2026-08': 169,
  '2026-09': 163,
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

  // Windows longer than a quarter (e.g. L365) have no annual target defined →
  // no ads target (the AdsTargetTile then shows no ring). Guard BEFORE the
  // pro-rate fallback so 365 isn't mistakenly prorated from the current month.
  if (windowDays > 90) return null;

  // L3, L7, L14 → daily rate × N từ current month
  if (currentMonthly === undefined) return null;
  const days = daysInMonth(asOf.getFullYear(), asOf.getMonth());
  return (currentMonthly / days) * windowDays;
}

/**
 * Runrate cuối kỳ theo window.
 *   - L3/L7/L14/L30 (windowDays ≤ days_in_month):
 *     pace = actual / effectiveDays, projection = pace × days_in_month, pct = projection / monthly_target
 *     effectiveDays:
 *       - MTD-style (= min(windowDays, daysElapsedInMonth)) khi đã qua ≥ ½ window trong tháng
 *         → mid/late-month L30 phản ánh đúng pace tháng hiện tại, không bị tháng trước dilute.
 *       - Pure rolling (= windowDays) khi đầu tháng (daysElapsed < ½ window)
 *         → tránh divide-by-tiny gây projection bùng nổ (vd ngày 1: L30/1×30 = ×30).
 *   - L90 (windowDays > days_in_month):
 *     pct = actual / L90 target (= tổng target 3 tháng gần nhất, lấy từ expectedAdsInstalls)
 *     projection = actual (không extrapolate vì window đã ≥ 1 tháng)
 * Trả null nếu thiếu target hoặc input invalid.
 */
export function runrateAdsToMonthEnd(
  windowDays: number,
  actualInstalls: number,
  asOf: Date = new Date(),
): {
  pct: number;
  projectedInstalls: number;
  targetInstalls: number;
  effectiveDays: number;
  mode: 'paced' | 'direct';
} | null {
  if (!Number.isFinite(windowDays) || windowDays <= 0) return null;
  if (!Number.isFinite(actualInstalls) || actualInstalls < 0) return null;
  const days = daysInMonth(asOf.getFullYear(), asOf.getMonth());

  if (windowDays > days) {
    // L90 (hoặc bất kỳ window > 1 tháng) → so trực tiếp với target của window.
    const windowTarget = expectedAdsInstalls(windowDays, asOf);
    if (windowTarget === null || windowTarget <= 0) return null;
    return {
      pct: actualInstalls / windowTarget,
      projectedInstalls: actualInstalls,
      targetInstalls: windowTarget,
      effectiveDays: windowDays,
      mode: 'direct',
    };
  }

  // L3/L7/L14/L30 → month-to-date pace (per Trang's formula):
  //   projection = actual / days_covered × days_in_month
  //   pct        = projection / monthly_target
  // days_covered = how many days the window's actual falls inside the current
  // month = min(windowDays, completed_days_this_month). completed days excludes
  // today's partial day (on the 13th → 12), floored at 1 for day-1 safety.
  //   - L30 on the 13th → min(30, 12) = 12  → 60/12×31 (Trang's formula)
  //   - L7  on the 13th → min(7, 12)  = 7   → true 7-day rate
  const monthlyTarget = ADS_MONTHLY_TARGETS[ymKey(asOf)];
  if (monthlyTarget === undefined || monthlyTarget <= 0) return null;
  const completedDays = Math.max(asOf.getDate() - 1, 1);
  const effectiveDays = Math.min(windowDays, completedDays);
  const projectedInstalls = (actualInstalls / effectiveDays) * days;
  return {
    pct: projectedInstalls / monthlyTarget,
    projectedInstalls,
    targetInstalls: monthlyTarget,
    effectiveDays,
    mode: 'paced',
  };
}
