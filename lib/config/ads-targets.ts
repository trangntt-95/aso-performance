/**
 * Monthly install targets cho paid search ads.
 * Update mỗi đầu quý — chỉnh ở đây, không hardcode rải rác trong UI.
 */
export const ADS_MONTHLY_TARGETS: Record<string, number> = {
  '2026-05': 229,
  '2026-06': 240,
  '2026-07': 250,
  '2026-08': 275,
  '2026-09': 264,
};

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dailyRate(d: Date): number | null {
  const key = ymKey(d);
  const monthly = ADS_MONTHLY_TARGETS[key];
  if (!monthly) return null;
  return monthly / daysInMonth(d.getFullYear(), d.getMonth());
}

/**
 * Tổng số install expected trong cửa sổ rolling N ngày tính tới `asOf`.
 * Trả về null nếu KHÔNG có ngày nào trong window khớp config (out of range).
 * Nếu chỉ 1 phần ngày khớp → chỉ cộng số ngày khớp.
 */
export function expectedAdsInstalls(windowDays: number, asOf: Date = new Date()): number | null {
  let total = 0;
  let matched = 0;
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(asOf.getTime() - i * 86400000);
    const r = dailyRate(d);
    if (r !== null) {
      total += r;
      matched++;
    }
  }
  if (matched === 0) return null;
  return total;
}
