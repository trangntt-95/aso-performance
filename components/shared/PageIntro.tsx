import { Info } from 'lucide-react';

// One line at the top of a tab saying what the tab is for.
//
// Rendered from each page.tsx, next to that page's DataGapNote, rather than from
// inside the view: the text describes the screen's PURPOSE, which doesn't depend
// on the data, so it belongs where the route is declared and can be read without
// opening a 500-line component.
//
// Not added to every tab. Underbid, Overbid, Camp Health, Bid Recommendations,
// Nguồn Install, Google Ads and Change log already open with their own explainer,
// and several of those interpolate live thresholds ("paid share < 30%", the
// current window) that a static intro would flatten into something less useful.
// Duplicating them would put two boxes on top of each other. This component is
// for the tabs that had nothing.
//
// Overview is deliberately excluded — the user asked for it, and it is the
// landing page: it explains itself by being the thing everything else drills
// into.

export function PageIntro({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
