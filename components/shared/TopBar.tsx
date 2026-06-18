'use client';

import { usePathname } from 'next/navigation';
import { RefreshButton } from './RefreshButton';

const TITLES: Record<string, string> = {
  '/': 'Overview',
  '/market-index': 'Market Health',
  '/categories': 'Categories',
  '/paid-coverage': 'Paid Coverage',
  '/bid-cap': 'Bid Recommendations',
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
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="md:hidden h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center text-white font-bold shrink-0">
            T
          </div>
          <h1 className="text-base md:text-lg font-semibold truncate text-slate-900">{titleFor(pathname)}</h1>
        </div>
        <RefreshButton />
      </div>
    </header>
  );
}
