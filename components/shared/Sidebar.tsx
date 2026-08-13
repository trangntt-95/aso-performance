'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  LayoutDashboard,
  Crosshair,
  DollarSign,
  TrendingUp,
  Flame,
  HeartPulse,
  GripVertical,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { applyOrder, useNavOrder } from '@/lib/store/navOrderStore';
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
  { href: '/categories', label: 'Search Terms', Icon: BookOpen, shortLabel: 'Terms' },
  { href: '/paid-coverage', label: 'Paid Coverage', Icon: Crosshair, shortLabel: 'Paid' },
  { href: '/underbid', label: 'Underbid Keywords', Icon: TrendingUp, shortLabel: 'Underbid' },
  { href: '/overbid-camps', label: 'Overbid Camps', Icon: Flame, shortLabel: 'Overbid' },
  { href: '/camp-health', label: 'Camp Health', Icon: HeartPulse, shortLabel: 'Health' },
  { href: '/bid-cap', label: 'Bid Recommendations', Icon: DollarSign, shortLabel: 'Bids' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { order, setOrder, reset, ready } = useNavOrder();
  // Until the saved order has been read (after mount) render the default, so
  // the server and the first client render produce identical markup.
  const items = ready ? applyOrder(NAV_ITEMS, order) : NAV_ITEMS;

  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const move = (fromHref: string, toHref: string) => {
    if (fromHref === toHref) return;
    const hrefs = items.map((i) => i.href);
    const from = hrefs.indexOf(fromHref);
    const to = hrefs.indexOf(toHref);
    if (from < 0 || to < 0) return;
    hrefs.splice(to, 0, hrefs.splice(from, 1)[0]);
    setOrder(hrefs);
  };

  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-slate-200 bg-white sticky top-0 h-screen self-start">
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
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {items.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          const isOver = over === href && dragging !== href;
          return (
            <div
              key={href}
              onDragOver={(e) => {
                // Without preventDefault the browser never allows the drop.
                e.preventDefault();
                setOver(href);
              }}
              onDragLeave={() => setOver((c) => (c === href ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) move(dragging, href);
                setDragging(null);
                setOver(null);
              }}
              className={cn(
                'rounded-lg transition',
                isOver && 'ring-2 ring-indigo-400',
                dragging === href && 'opacity-40',
              )}
            >
              <Link
                href={href}
                className={cn(
                  'group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition',
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                {/* Only the handle is draggable, so a plain click anywhere else
                    still navigates instead of being eaten by the drag gesture. */}
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    // Firefox refuses to start a drag with no payload set.
                    e.dataTransfer.setData('text/plain', href);
                    setDragging(href);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  onClick={(e) => e.preventDefault()}
                  title="Kéo để đổi vị trí tab"
                  className={cn(
                    'shrink-0 cursor-grab active:cursor-grabbing',
                    active ? 'text-white/50 hover:text-white' : 'text-slate-300 hover:text-slate-500',
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </span>
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    active ? 'text-white' : 'text-slate-400 group-hover:text-slate-600',
                  )}
                />
                <span className="font-medium">{label}</span>
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-[11px] text-slate-400">
        <span>v0.2 · Phase 2 + Overview</span>
        {ready && order && (
          <button
            type="button"
            onClick={reset}
            title="Về lại thứ tự mặc định"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <RotateCcw className="h-3 w-3" />
            reset
          </button>
        )}
      </div>
    </aside>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  const { order, ready } = useNavOrder();
  // Follows whatever order the sidebar was reordered into. Dragging itself stays
  // desktop-only — a long-press drag here would fight with page scrolling.
  const items = ready ? applyOrder(NAV_ITEMS, order) : NAV_ITEMS;
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white">
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ href, label, shortLabel, Icon }) => {
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
