'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Window } from '@/lib/sheets/types';
import { ScrollText } from 'lucide-react';

interface Props {
  window: Window;
  narrative?: string;
  primaryCause?: string;
  causeDetails?: string;
}

export function NarrativePanel({ window: w, narrative, primaryCause, causeDetails }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-emerald-600" />
          Narrative · {w}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed">
        {primaryCause && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-0.5">Primary cause</div>
            <div className="font-medium">{primaryCause}</div>
          </div>
        )}
        {causeDetails && (
          <div className="text-gray-700 whitespace-pre-line text-[13px]">{causeDetails}</div>
        )}
        {narrative ? (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-950 rounded p-3 whitespace-pre-line text-[13px]">
            {narrative}
          </div>
        ) : (
          <div className="text-gray-500 text-xs">No Vietnamese narrative for this window.</div>
        )}
      </CardContent>
    </Card>
  );
}
