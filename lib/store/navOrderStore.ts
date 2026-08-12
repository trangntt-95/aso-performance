'use client';

import { useEffect, useState } from 'react';

// User-chosen order of the sidebar tabs, kept in localStorage.
//
// Deliberately NOT stored server-side like notes: nav order is a per-person
// layout preference, and reading it over the network would render the default
// order first and visibly reshuffle a moment later. localStorage has the same
// problem against SSR, so the hook below returns the DEFAULT order on the
// server and on the first client render, then swaps in the saved one after
// mount — that keeps the markup identical on both sides and avoids a hydration
// mismatch.

const KEY = 'asoNavOrderV1';

function read(): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === 'string') ? parsed : null;
  } catch {
    return null;
  }
}

function write(order: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(order));
    // Same-tab listeners: the native `storage` event only fires in OTHER tabs,
    // so the sidebar and the mobile bar wouldn't see each other's changes.
    window.dispatchEvent(new CustomEvent(KEY));
  } catch {
    // Private mode / quota — ordering just won't persist.
  }
}

/**
 * Apply a saved order to a list of hrefs: saved entries first, in their stored
 * order, then anything the save doesn't mention. That last part matters —
 * without it a tab added after the user last reordered would silently vanish
 * from the nav.
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
  // Whatever the stored order didn't cover keeps its original relative position.
  for (const i of items) if (byHref.has(i.href)) out.push(i);
  return out;
}

export function useNavOrder(): {
  order: string[] | null;
  setOrder: (o: string[]) => void;
  reset: () => void;
  /** False until after mount — render the default order while it's false. */
  ready: boolean;
} {
  const [order, setOrderState] = useState<string[] | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOrderState(read());
    setReady(true);
    const sync = () => setOrderState(read());
    window.addEventListener('storage', sync);
    window.addEventListener(KEY, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(KEY, sync);
    };
  }, []);

  return {
    order,
    ready,
    setOrder: (o: string[]) => {
      setOrderState(o);
      write(o);
    },
    reset: () => {
      setOrderState(null);
      try {
        window.localStorage.removeItem(KEY);
        window.dispatchEvent(new CustomEvent(KEY));
      } catch {
        /* ignore */
      }
    },
  };
}
