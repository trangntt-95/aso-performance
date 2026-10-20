'use client';

import { useQuery } from '@tanstack/react-query';
import type { MetaProvenyPayload } from '@/lib/meta/types';

async function fetchMetaProveny(): Promise<MetaProvenyPayload> {
  const res = await fetch('/api/meta-proveny', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Meta fetch failed (${res.status})`);
  }
  return res.json();
}

export function useMetaProveny() {
  return useQuery({
    queryKey: ['meta-proveny'],
    queryFn: fetchMetaProveny,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
