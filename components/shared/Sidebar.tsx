'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListChecks, BarChart3, Target, Globe2, Layers, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  shortLabel?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Action Queue', Icon: ListChecks, shortLabel: 'Actions' },
  { href: '/market-index', label: 'Market Index', Icon: BarChart3, shortLabel: 'Market' },
  { href: '/geo-opportunity', label: 'Geo Opportunity', Icon: Target, shortLabel: 'Geo' },
  { href: '/tier1-watch', label: 'Tier 1 Watch', Icon: Globe2, shortLabel: 'Tier 1' },
  { href: '/categories', label: 'Categories', Icon: Layers, shortLabel: 'Cats' },
  { href: '/trends', label: 'Trends', Icon: Sparkles, shortLabel: 'Trends' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col w-56 shrink-0 border-r bg-white">
      <div className="px-4 py-5 border-b">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-600 grid place-items-center text-white font-bold">
            T
          </div>
          <div>
            <div className="font-semibold leading-tight">TrueProfit ASO</div>
            <div className="text-xs text-gray-500">Dashboard</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition',
                active
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-100',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t text-xs text-gray-500">v0.1 · Phase 1</div>
    </aside>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-white">
      <div className="grid grid-cols-6">
        {NAV_ITEMS.map(({ href, label, shortLabel, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 transition',
                active ? 'text-gray-900' : 'text-gray-500',
              )}
            >
              <Icon className={cn('h-4 w-4', active && 'text-emerald-600')} />
              <span className="truncate w-full text-center">{shortLabel ?? label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
