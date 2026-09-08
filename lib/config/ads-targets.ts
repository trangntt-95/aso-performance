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
 * Runrate tới cuối tháng, suy từ pace của window đang chọn.
 *
 *   - windowDays ≤ số ngày trong tháng (L3/L7/L14/L30):
 *       pace       = actual / windowDays
 *       projection = pace × days_in_month
 *       pct        = projection / monthly_target
 *   - windowDays > số ngày trong tháng (L90):
 *       so trực tiếp actual với target của window, không extrapolate.
 *
 * ── Vì sao chia cho windowDays chứ không phải số ngày đã qua trong tháng ──
 * Bản trước chia cho `min(windowDays, completedDaysThisMonth)` với ý "pace
 * month-to-date". Sai, và sai lớn: `actual` là tổng của CẢ window, còn
 * completedDays chỉ đếm phần window nằm trong tháng này. Ngày 08/09 với L30,
 * window phủ ~10/08→08/09 nên 75 install rải trên 30 ngày; chia cho 7 là gán
 * toàn bộ 75 vào 7 ngày của tháng 9 → pace 10.71/ngày thay vì 2.50, projection
 * 321 thay vì 75, phóng đại 4.3 lần. Càng đầu tháng càng sai to.
 *
 * Muốn pace month-to-date thật thì phải truyền vào actual của 01/tháng→hôm nay,
 * không phải actual của L30. Hàm này nhận actual theo window, nên đơn vị duy
 * nhất đúng để chia là chính độ dài window đó.
 *
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

  // The window's own length is the period `actualInstalls` was measured over, so
  // it is the only correct divisor. See the note above for what dividing by
  // completed-days-this-month did instead.
  const monthlyTarget = ADS_MONTHLY_TARGETS[ymKey(asOf)];
  if (monthlyTarget === undefined || monthlyTarget <= 0) return null;
  const effectiveDays = windowDays;
  const projectedInstalls = (actualInstalls / effectiveDays) * days;
  return {
    pct: projectedInstalls / monthlyTarget,
    projectedInstalls,
    targetInstalls: monthlyTarget,
    effectiveDays,
    mode: 'paced',
  };
}
