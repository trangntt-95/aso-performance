// Exchange rate used to put the Google Ads account (VND) next to everything
// else (USD).
//
// This is an ASSUMPTION, not a live rate: Trang set it to a working average on
// 2026-08-14. It is deliberately a single named constant rather than being
// inlined at each call site, so it can be corrected in one place — and every
// screen that uses it says which rate it used, so a stale number shows itself
// instead of quietly skewing a channel comparison.
export const VND_PER_USD = 26_500;

/** Convert an amount in the given currency to USD. Unknown currency → null,
 *  which callers must render as "—" rather than as zero. */
export function toUsd(amount: number, currency: string): number | null {
  const c = (currency || '').toUpperCase();
  if (c === 'USD' || c === '') return amount;
  if (c === 'VND') return amount / VND_PER_USD;
  return null;
}

export const FX_NOTE = `Quy đổi ở mức ${VND_PER_USD.toLocaleString('vi-VN')}₫ = $1 (tỷ giá trung bình, sửa trong lib/config/fx.ts khi cần).`;
