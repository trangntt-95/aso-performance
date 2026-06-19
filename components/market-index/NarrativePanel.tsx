'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Window } from '@/lib/sheets/types';
import type { NarrativeEvidence } from '@/lib/market/narrativeEvidence';
import type { AccountTotals } from '@/lib/market/accountAggregates';
import { formatNumber, formatDeltaPct } from '@/lib/utils/format';
import { ScrollText, BarChart3, Lightbulb, Target, Search } from 'lucide-react';

interface Props {
  window: Window;
  narrative?: string;
  primaryCause?: string;
  causeDetails?: string;
  evidence?: NarrativeEvidence | null;
  /** Whole-account totals (All_Lx) — when set, the data line uses these instead
   *  of the core-basket numbers parsed from the sheet narrative. */
  dataOverride?: AccountTotals | null;
}

/**
 * The Apps Script narrative is a single concatenated sentence:
 *   "Tuần L7: Users tổng X→Y (Δ%), GetApp X→Y (Δ%). Nguyên nhân chính: <cause>. <details>.
 *    → Action: <action> <temporal pattern>"
 * We split it back into the structured pieces so the panel can render
 * data → insight → action as bullets. primaryCause/causeDetails come as
 * separate props (the canonical insight), so we only pull the data line,
 * the action line and the trailing temporal pattern out of the string.
 */
function parseNarrative(
  narrative: string | undefined,
  causeDetails: string | undefined,
): { dataPoints: string[]; action: string; pattern: string } {
  const empty = { dataPoints: [] as string[], action: '', pattern: '' };
  if (!narrative) return empty;

  // 1. Data line — everything before "Nguyên nhân chính:".
  const causeStart = narrative.indexOf('Nguyên nhân chính:');
  const dataLine = (causeStart >= 0 ? narrative.slice(0, causeStart) : '').trim();
  // Drop the "Tuần L7:" prefix, then split Users / GetApp into separate bullets.
  const dataBody = dataLine.replace(/^Tuần\s+\S+:\s*/, '').replace(/\.\s*$/, '');
  const dataPoints = dataBody
    ? dataBody.split(/,\s*(?=GetApp)/).map((s) => s.trim()).filter(Boolean)
    : [];

  // 2. Everything after the cause details = action + temporal pattern.
  let rest = '';
  if (causeDetails) {
    const dIdx = narrative.indexOf(causeDetails);
    if (dIdx >= 0) rest = narrative.slice(dIdx + causeDetails.length);
  }
  if (!rest) {
    const aIdx = narrative.indexOf('→ Action:');
    if (aIdx >= 0) rest = narrative.slice(aIdx);
  }
  rest = rest.replace(/^[.\s]+/, '');

  // 3. Split action vs temporal pattern (pattern starts with a known marker).
  let action = '';
  let pattern = '';
  const aIdx = rest.indexOf('→ Action:');
  const afterAction = aIdx >= 0 ? rest.slice(aIdx + '→ Action:'.length) : rest;
  const m = afterAction.match(/(💢|📉|⚠️|🔻|📈|💥|🚀|🌀|→\s*Ổn định)/);
  if (aIdx >= 0) {
    if (m && (m.index ?? 0) > 0) {
      action = afterAction.slice(0, m.index).trim();
      pattern = afterAction.slice(m.index).trim();
    } else {
      action = afterAction.trim();
    }
  } else if (m) {
    // No explicit action — the remainder is just the temporal pattern.
    pattern = afterAction.slice(m.index).trim();
  }

  return { dataPoints, action, pattern };
}

/** Make the Apps Script wording friendlier: GetApp → Install, "pp" → "điểm %",
 *  and the confusing "ăn noise" jargon → "traffic không convert". */
function humanize(s: string): string {
  return s
    .replace(/Get ?App/gi, 'Install')
    .replace(/Users tổng/g, 'Users')
    .replace(/(\d(?:[.,]\d+)?)\s*pp\b/g, '$1 điểm %')
    .replace(/ăn noise/gi, 'hút traffic không convert');
}

function StepHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {icon}
      {label}
    </div>
  );
}

export function NarrativePanel({ window: w, narrative, primaryCause, causeDetails, evidence, dataOverride }: Props) {
  const { dataPoints, action, pattern } = parseNarrative(narrative, causeDetails);
  const n = (v: number) => formatNumber(v, { compact: true });
  // Prefer whole-account totals (match Overview); fall back to the parsed
  // basket numbers when no override is supplied.
  const shownPoints: string[] = dataOverride
    ? [
        `Users ${n(dataOverride.usersP)}→${n(dataOverride.usersL)} (${formatDeltaPct(dataOverride.deltaUsersPct)})`,
        `Install ${n(dataOverride.getAppP)}→${n(dataOverride.getAppL)} (${formatDeltaPct(dataOverride.deltaGetAppPct)})`,
      ]
    : dataPoints.map(humanize);
  const hasStructured = shownPoints.length > 0 || !!primaryCause || !!action;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-emerald-600" />
          Narrative · {w}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-relaxed">
        {hasStructured ? (
          <>
            {/* 1 — Phân tích data (toàn account, khớp Overview) */}
            {shownPoints.length > 0 && (
              <div className="space-y-1">
                <StepHeader icon={<BarChart3 className="h-3.5 w-3.5 text-sky-600" />} label="Phân tích data" />
                <ul className="space-y-0.5 text-[13px] text-slate-700">
                  {shownPoints.map((d, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-slate-400">•</span>
                      <span className="font-mono">{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 2 — Insight / Nguyên nhân (ý chính → ý phụ) */}
            {primaryCause && (
              <div className="space-y-1">
                <StepHeader icon={<Lightbulb className="h-3.5 w-3.5 text-amber-500" />} label="Insight · Nguyên nhân" />
                <ul className="space-y-1 text-[13px]">
                  <li className="flex gap-1.5">
                    <span className="text-slate-400">•</span>
                    <span className="font-medium text-slate-900">{humanize(primaryCause)}</span>
                  </li>
                  {causeDetails && (
                    <li className="ml-3 flex gap-1.5 text-slate-600">
                      <span className="text-slate-300">◦</span>
                      <span className="whitespace-pre-line">{humanize(causeDetails)}</span>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* 3 — Action (+ concrete keyword evidence) */}
            {(action || evidence) && (
              <div className="space-y-1 bg-emerald-50 border border-emerald-100 rounded p-3">
                <StepHeader icon={<Target className="h-3.5 w-3.5 text-emerald-600" />} label="Action" />
                {action && (
                  <ul className="space-y-1 text-[13px] text-emerald-950">
                    <li className="flex gap-1.5">
                      <span className="text-emerald-500">•</span>
                      <span className="font-medium">{humanize(action)}</span>
                    </li>
                    {pattern && (
                      <li className="ml-3 flex gap-1.5 text-emerald-800/80">
                        <span className="text-emerald-400">◦</span>
                        <span>{humanize(pattern)}</span>
                      </li>
                    )}
                  </ul>
                )}
                {evidence && (
                  <div className="mt-2 rounded bg-white/70 border border-emerald-100 p-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
                      <Search className="h-3 w-3" />
                      Dẫn chứng (keyword thực tế)
                    </div>
                    <div className="mt-0.5 text-[11px] text-emerald-900/80">{evidence.label}</div>
                    <ul className="mt-1 space-y-0.5 text-[12px] text-slate-700">
                      {evidence.items.map((it, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-emerald-500">›</span>
                          <span>
                            <span className="font-medium text-slate-900">{it.term}</span>
                            <span className="text-slate-500"> — {it.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Glossary so the numbers aren't cryptic. */}
            <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2 leading-relaxed">
              <b>Đọc số:</b> &quot;→&quot; = kỳ trước → kỳ này · trong ngoặc là % thay đổi · <b>CR</b> = tỉ lệ cài
              (install ÷ users) · <b>điểm %</b> = chênh lệch tuyệt đối giữa 2 mức CR (vd 5% → 3% là −2 điểm %) ·
              <b> Δ</b> = thay đổi so với kỳ trước.
            </div>
          </>
        ) : narrative ? (
          // Fallback — parsing failed, show the raw sentence.
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-950 rounded p-3 whitespace-pre-line text-[13px]">
            {narrative}
          </div>
        ) : (
          <div className="text-slate-500 text-xs">No Vietnamese narrative for this window.</div>
        )}
      </CardContent>
    </Card>
  );
}
