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
  Megaphone,
  GripVertical,
  RotateCcw,
  Eye,
  EyeOff,
  Settings2,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { applyHidden, applyOrder, useNavLayout } from '@/lib/store/navOrderStore';
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
  { href: '/google-ads', label: 'Google Ads', Icon: Megaphone, shortLabel: 'GAds' },
  { href: '/bid-cap', label: 'Bid Recommendations', Icon: DollarSign, shortLabel: 'Bids' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { layout, ready, setOrder, toggleHidden, reset, customised } = useNavLayout();
  // Until the saved layout has been read (after mount) render the default, so
  // the server and the first client render produce identical markup.
  const ordered = ready ? applyOrder(NAV_ITEMS, layout.order) : NAV_ITEMS;
  // Edit mode lists every tab, including hidden ones, so they can be brought
  // back — hiding a tab must never be a one-way door.
  const [editing, setEditing] = useState(false);
  const items = editing ? ordered : applyHidden(ordered, ready ? layout.hidden : [], pathname);

  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const move = (fromHref: string, toHref: string) => {
    if (fromHref === toHref) return;
    const hrefs = ordered.map((i) => i.href);
    const from = hrefs.indexOf(fromHref);
    const to = hrefs.indexOf(toHref);
    if (from < 0 || to < 0) return;
    hrefs.splice(to, 0, hrefs.splice(from, 1)[0]);
    setOrder(hrefs);
  };

  const hiddenSet = new Set(ready ? layout.hidden : []);
  const visibleCount = ordered.filter((i) => !hiddenSet.has(i.href)).length;

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
          const isHidden = hiddenSet.has(href);
          // The last visible tab can't be hidden — an empty nav would leave no
          // way to navigate or to get back into edit mode.
          const canHide = !isHidden ? visibleCount > 1 : true;
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
                'flex items-center gap-1 rounded-lg transition',
                isOver && 'ring-2 ring-indigo-400',
                dragging === href && 'opacity-40',
              )}
            >
              <Link
                href={href}
                className={cn(
                  'group flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-sm transition',
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  editing && isHidden && 'opacity-45',
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
                <span className="truncate font-medium">{label}</span>
                {/* Only reachable for the page you're standing on. */}
                {!editing && isHidden && (
                  <span
                    className="ml-auto shrink-0 opacity-60"
                    title="Tab này đang ẩn — vẫn hiện vì bạn đang ở trang đó"
                  >
                    <EyeOff className="h-3 w-3" />
                  </span>
                )}
              </Link>
              {editing && (
                <button
                  type="button"
                  onClick={() => canHide && toggleHidden(href)}
                  disabled={!canHide}
                  title={
                    !canHide
                      ? 'Không thể ẩn tab cuối cùng còn lại'
                      : isHidden
                        ? 'Hiện lại tab này'
                        : 'Ẩn tab này khỏi menu'
                  }
                  className={cn(
                    'shrink-0 rounded p-1 transition',
                    canHide ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700' : 'text-slate-200',
                  )}
                >
                  {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-slate-200 px-3 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={cn(
              'inline-flex flex-1 items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition',
              editing
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
            )}
          >
            {editing ? <Check className="h-3 w-3" /> : <Settings2 className="h-3 w-3" />}
            {editing ? 'Xong' : 'Ẩn / sắp xếp tab'}
          </button>
          {ready && customised && (
            <button
              type="button"
              onClick={reset}
              title="Về lại mặc định (thứ tự + hiện lại mọi tab)"
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
        {ready && layout.hidden.length > 0 && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full text-left text-[10px] text-slate-400 hover:text-slate-600"
          >
            {layout.hidden.length} tab đang ẩn — bấm để sửa
          </button>
        )}
        <div className="text-[10px] text-slate-400">v0.2 · Phase 2 + Overview</div>
      </div>
    </aside>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  const { layout, ready } = useNavLayout();
  // Follows the same layout the sidebar was given. Reordering and hiding are
  // desktop-only: a long-press drag here would fight with page scrolling.
  const ordered = ready ? applyOrder(NAV_ITEMS, layout.order) : NAV_ITEMS;
  const items = applyHidden(ordered, ready ? layout.hidden : [], pathname);
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
