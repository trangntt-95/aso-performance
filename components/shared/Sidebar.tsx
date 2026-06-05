'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListChecks, BarChart3, Globe2, Layers, LayoutDashboard, Crosshair } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  shortLabel?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Overview', Icon: LayoutDashboard, shortLabel: 'Home' },
  { href: '/market-index', label: 'Market Health', Icon: BarChart3, shortLabel: 'Market' },
  { href: '/tier1-watch', label: 'Tier 1 Watch', Icon: Globe2, shortLabel: 'Tier 1' },
  { href: '/categories', label: 'Categories', Icon: Layers, shortLabel: 'Cats' },
  { href: '/paid-coverage', label: 'Paid Coverage', Icon: Crosshair, shortLabel: 'Paid' },
  { href: '/actions', label: 'Action Queue', Icon: ListChecks, shortLabel: 'Actions' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-slate-200 bg-white">
      <div className="px-5 py-5 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center text-white font-bold shadow-sm">
            T
          </div>
          <div>
            <div className="font-semibold leading-tight text-slate-900">TrueProfit ASO</div>
            <div className="text-[11px] text-slate-500">Performance dashboard</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition',
                active
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-slate-400 group-hover:text-slate-600')} />
              <span className="font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-3 border-t border-slate-200 text-[11px] text-slate-400">
        v0.2 · Phase 2 + Overview
      </div>
    </aside>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white">
      <div className="grid grid-cols-6">
        {NAV_ITEMS.map(({ href, label, shortLabel, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 transition',
                active ? 'text-slate-900' : 'text-slate-500',
              )}
            >
              <Icon className={cn('h-4 w-4', active && 'text-indigo-600')} />
              <span className="truncate w-full text-center">{shortLabel ?? label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
