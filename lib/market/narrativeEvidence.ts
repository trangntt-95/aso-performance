import type { KeywordRow } from '@/lib/sheets/types';
import { formatNumber, formatDeltaPct, formatPercent } from '@/lib/utils/format';

// Concrete, data-backed examples for the Narrative "Action" — so a claim like
// "paid đang ăn noise" is shown with the actual keywords that prove it, never
// asserted on its own. Returns null when nothing in the data supports the
// claim (better to show nothing than to guess).

export interface NarrativeEvidence {
  label: string;
  items: { term: string; detail: string }[];
}

const num = (n: number) => formatNumber(n, { compact: true });

export function deriveNarrativeEvidence(
  rows: KeywordRow[],
  cause: string,
): NarrativeEvidence | null {
  const c = (cause || '').toLowerCase();
  const paid = rows.filter((r) => r.surface === 'search_ad');
  const organic = rows.filter((r) => r.surface === 'search');

  // Noise / broad match / paid CR drop → paid keywords pulling traffic but
  // barely converting (0 or very low install). These literally show the noise.
  if (/noise|broad|cr drop|match type/.test(c)) {
    const items = paid
      .filter((r) => r.usersL >= 3 && (r.getAppL === 0 || (r.crL ?? 1) < 0.03))
      .sort((a, b) => {
        const ca = a.crL ?? 0;
        const cb = b.crL ?? 0;
        return ca - cb || b.usersL - a.usersL;
      })
      .slice(0, 3)
      .map((r) => ({
        term: r.searchTerm,
        detail: `${num(r.usersL)} users → ${num(r.getAppL)} install (CR ${formatPercent(r.crL)})`,
      }));
    if (items.length)
      return { label: 'Keyword paid có traffic nhưng không convert (gần như 0 install):', items };
  }

  // Bid / competitor outbid → paid keywords that lost the most users.
  if (/outbid|\bbid\b|competitor/.test(c)) {
    const items = paid
      .filter((r) => r.usersP >= 5 && r.deltaUsersPct < -0.2)
      .sort((a, b) => a.deltaUsersPct - b.deltaUsersPct)
      .slice(0, 3)
      .map((r) => ({
        term: r.searchTerm,
        detail: `users ${num(r.usersP)}→${num(r.usersL)} (${formatDeltaPct(r.deltaUsersPct)})`,
      }));
    if (items.length) return { label: 'Keyword paid tụt users mạnh nhất:', items };
  }

  // Organic improvement → organic keywords with the biggest user gains.
  if (/organic up|discoverability|organic \+/.test(c)) {
    const items = organic
      .filter((r) => r.usersL >= 5 && r.deltaUsersPct > 0.15)
      .sort((a, b) => b.deltaUsersPct - a.deltaUsersPct)
      .slice(0, 3)
      .map((r) => ({
        term: r.searchTerm,
        detail: `users ${num(r.usersP)}→${num(r.usersL)} (${formatDeltaPct(r.deltaUsersPct)})`,
      }));
    if (items.length) return { label: 'Keyword organic tăng users mạnh nhất:', items };
  }

  return null;
}
