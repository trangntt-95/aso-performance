'use client';

import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRefreshSheetData, useSheetData } from '@/lib/hooks/useSheetData';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

export function RefreshButton() {
  const { data, isFetching } = useSheetData();
  const refresh = useRefreshSheetData();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const spinning = isFetching || busy;

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      {data?.fetchedAt && (
        <span className="hidden sm:inline">Updated {formatDateTime(data.fetchedAt)}</span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={spinning}
        className="h-8 gap-1.5"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', spinning && 'animate-spin')} />
        <span className="hidden sm:inline">Refresh</span>
      </Button>
    </div>
  );
}
