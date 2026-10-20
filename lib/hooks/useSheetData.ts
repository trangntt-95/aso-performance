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
    // Short staleness + refetch on focus so edits made in the sheet show up when
    // you switch back to the dashboard tab (server route is force-dynamic, so a
    // refetch always pulls the latest sheet values). Manual Refresh button too.
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    // Google quota 60 đọc/phút: lỗi thì thử lại 1 lần sau 30s, không dồn dập
    // (mặc định 3 lần liên tiếp làm quota không bao giờ hồi).
    retry: 1,
    retryDelay: 30 * 1000,
  });
}

export function useRefreshSheetData() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: QUERY_KEY });
}
