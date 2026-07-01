// Camp-name matching helper.
//
// Trang annotates campaign names in Shopify_daily with trailing performance
// notes — most commonly a "(CPI 17)" tag, sometimes "- CPI 62" — while
// Camp_Links / Paused_camp keep the un-annotated base name. Exact-string
// matching therefore fails for those camps (no URL, no geo, escapes the paused
// filter) even though it's the SAME campaign.
//
// normalizeCampName strips ONLY these CPI performance annotations from the tail.
// It deliberately PRESERVES geo parentheses like "(-IN, US)", "(US)",
// "(Brazil)" — those distinguish genuinely different campaigns (verified live:
// stripping all parens collapses "…Beprofit (-IN, US)" and "…Beprofit (US)"
// into one). Free-text dash notes ("- watch out", "- cân nhắc off") are also
// left intact for the same over-merge reason.
export function normalizeCampName(name: string): string {
  let x = (name ?? '').trim();
  // A camp can carry more than one trailing tag; strip repeatedly until stable.
  for (let i = 0; i < 6; i++) {
    const y = x
      .replace(/\s*\([^()]*CPI[^()]*\)\s*$/i, '') // "(CPI 17)", "(CPI 71 - good ROAS)"
      .replace(/\s*[-–]\s*CPI\s*[\d.]+\s*$/i, '') // "- CPI 62"
      .trim();
    if (y === x) break;
    x = y;
  }
  return x;
}
