// Decide whether to show the "→ english" translation hint next to a keyword.
//
// Apps Script writes an English translation into the `english` column for a LOT
// of keywords — including foreign-language ones it filed under Others / Feature /
// Brand (e.g. "versandkosten" → "shipping costs", "zapatos" → "shoes"). The old
// UI gate only showed the hint when the keyword was non-ASCII OR sat in the
// Language category, so ~78% of real translations were hidden (verified live via
// scripts/probe-translations.mjs: 236 of 303 translated rows suppressed).
//
// New rule: show the translation whenever it exists and differs from the keyword.
// The ONE thing we still suppress is English brand-term "corrections" — Apps
// Script runs translate on English typos in Brand/Profit/Competitor and gets
// noise ("true proft" → "true prophet", "profitpuls" → "profit pulse"). Those
// add no value, so we hide them for ASCII keywords in those brand-ish categories.
const BRANDISH_CATEGORIES = new Set(['Brand', 'Profit', 'Competitor']);

export function shouldShowTranslation(
  keyword: string | null | undefined,
  english: string | null | undefined,
  category?: string | null,
): boolean {
  if (!english || !keyword) return false;
  const k = keyword.trim().toLowerCase();
  const e = english.trim().toLowerCase();
  if (!e || e === k) return false; // empty, or just an English term copied verbatim
  if (/[^\x00-\x7F]/.test(keyword)) return true; // clearly foreign script → always show
  if (category && BRANDISH_CATEGORIES.has(category)) return false; // English brand typo-fix noise
  return true;
}

/** First non-empty english across candidate windows (an empty string never wins —
 *  unlike `??`, which stops on `''`). */
export function pickEnglish(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    const v = (c ?? '').trim();
    if (v) return v;
  }
  return '';
}
