'use client';

import { useQuery } from '@tanstack/react-query';
import type { GoogleAdsProvenyResponse } from '@/app/api/google-ads-proveny/route';

async function fetchGoogleAdsProveny(): Promise<GoogleAdsProvenyResponse> {
  const res = await fetch('/api/google-ads-proveny', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Google Ads Proveny fetch failed (${res.status})`);
  }
  return res.json();
}

export function useGoogleAdsProveny(enabled = true) {
  return useQuery({
    queryKey: ['google-ads-proveny'],
    queryFn: fetchGoogleAdsProveny,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    retryDelay: 30 * 1000,
  });
}
