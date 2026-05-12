'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SheetPayload } from '@/lib/sheets/types';

const QUERY_KEY = ['sheet-data'] as const;

async function fetchSheetData(): Promise<SheetPayload> {
  const res = await fetch('/api/sheets', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Sheet fetch failed (${res.status})`);
  }
  return res.json();
}

export function useSheetData() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchSheetData,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useRefreshSheetData() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: QUERY_KEY });
}
