'use client';

import { usePathname } from 'next/navigation';
import { RefreshButton } from './RefreshButton';

const TITLES: Record<string, string> = {
  '/': 'Action Queue',
  '/market-index': 'Market Index',
  '/geo-opportunity': 'Geo Opportunity',
  '/tier1-watch': 'Tier 1 Market Watch',
  '/categories': 'Categories',
  '/trends': 'Trends',
};

function titleFor(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const root = '/' + (pathname.split('/')[1] ?? '');
  return TITLES[root] ?? 'Dashboard';
}

export function TopBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 bg-white border-b">
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="md:hidden h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-600 grid place-items-center text-white font-bold shrink-0">
            T
          </div>
          <h1 className="text-base md:text-lg font-semibold truncate">{titleFor(pathname)}</h1>
        </div>
        <RefreshButton />
      </div>
    </header>
  );
}
