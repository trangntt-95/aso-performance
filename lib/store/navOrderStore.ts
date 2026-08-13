'use client';

import { useEffect, useState } from 'react';

// Per-person sidebar layout: the order of the tabs and which ones are hidden.
//
// Deliberately NOT stored server-side like notes: this is a layout preference,
// and reading it over the network would render the default layout first and
// visibly reshuffle a moment later. localStorage has the same problem against
// SSR, so the hook returns the DEFAULT layout on the server and on the first
// client render, then swaps in the saved one after mount — identical markup on
// both sides, no hydration mismatch.

const KEY = 'asoNavOrderV1';

export interface NavLayout {
  order: string[];
  hidden: string[];
}

const EMPTY: NavLayout = { order: [], hidden: [] };

function read(): NavLayout | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // v1 stored a bare array of hrefs (order only). Keep reading those so an
    // existing reorder isn't thrown away when hiding was added.
    if (Array.isArray(parsed)) {
      return parsed.every((x) => typeof x === 'string') ? { order: parsed, hidden: [] } : null;
    }
    if (parsed && typeof parsed === 'object') {
      const order = Array.isArray(parsed.order) ? parsed.order.filter((x: unknown) => typeof x === 'string') : [];
      const hidden = Array.isArray(parsed.hidden) ? parsed.hidden.filter((x: unknown) => typeof x === 'string') : [];
      return { order, hidden };
    }
    return null;
  } catch {
    return null;
  }
}

function write(layout: NavLayout) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(layout));
    // The native `storage` event only fires in OTHER tabs, so without this the
    // sidebar and the mobile bar wouldn't see each other's changes.
    window.dispatchEvent(new CustomEvent(KEY));
  } catch {
    // Private mode / quota — the layout just won't persist.
  }
}

/**
 * Apply a saved order: saved entries first in their stored order, then anything
 * the save doesn't mention. That tail matters — without it a tab added after the
 * user last reordered would silently vanish from the nav.
 */
export function applyOrder<T extends { href: string }>(items: T[], order: string[] | null): T[] {
  if (!order || order.length === 0) return items;
  const byHref = new Map(items.map((i) => [i.href, i]));
  const out: T[] = [];
  for (const href of order) {
    const hit = byHref.get(href);
    if (hit) {
      out.push(hit);
      byHref.delete(href);
    }
  }
  for (const i of items) if (byHref.has(i.href)) out.push(i);
  return out;
}

/**
 * Drop hidden tabs — except the one currently open. Navigating to a page and
 * then finding no trace of it in the nav reads as a bug, so the active tab is
 * always present (the sidebar marks it as hidden).
 *
 * Also refuses to hide everything: if a save would empty the nav, it's ignored
 * rather than leaving no way back.
 */
export function applyHidden<T extends { href: string }>(
  items: T[],
  hidden: string[] | null,
  activeHref?: string,
): T[] {
  if (!hidden || hidden.length === 0) return items;
  const set = new Set(hidden);
  const kept = items.filter((i) => !set.has(i.href) || i.href === activeHref);
  return kept.length > 0 ? kept : items;
}

export function useNavLayout(): {
  layout: NavLayout;
  /** False until after mount — render the default layout while it's false. */
  ready: boolean;
  setOrder: (order: string[]) => void;
  toggleHidden: (href: string) => void;
  reset: () => void;
  /** True when anything has been customised (drives the reset button). */
  customised: boolean;
} {
  const [layout, setLayout] = useState<NavLayout>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLayout(read() ?? EMPTY);
    setReady(true);
    const sync = () => setLayout(read() ?? EMPTY);
    window.addEventListener('storage', sync);
    window.addEventListener(KEY, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(KEY, sync);
    };
  }, []);

  const save = (next: NavLayout) => {
    setLayout(next);
    write(next);
  };

  return {
    layout,
    ready,
    customised: layout.order.length > 0 || layout.hidden.length > 0,
    setOrder: (order) => save({ ...layout, order }),
    toggleHidden: (href) =>
      save({
        ...layout,
        hidden: layout.hidden.includes(href)
          ? layout.hidden.filter((h) => h !== href)
          : [...layout.hidden, href],
      }),
    reset: () => {
      setLayout(EMPTY);
      try {
        window.localStorage.removeItem(KEY);
        window.dispatchEvent(new CustomEvent(KEY));
      } catch {
        /* ignore */
      }
    },
  };
}
