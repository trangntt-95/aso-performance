import type { FunnelBreakdown, KeywordRow, SheetPayload, Window } from '@/lib/sheets/types';

// Recompute Market Health's headline numbers from the SAME All_Lx tabs that
// Overview sums — so Users/Install match across pages instead of showing the
// Apps Script "core basket" subset. (The qualitative cause/action prose on
// Market Health still comes from Market_Index; only the numbers are realigned.)

function rowsForWindow(data: SheetPayload, window: Window): KeywordRow[] {
  switch (window) {
    case 'L3':
      return data.allL3 ?? [];
    case 'L7':
      return data.allL7 ?? [];
    case 'L14':
      return data.allL14 ?? [];
    case 'L30':
      return data.allL30 ?? [];
    case 'L90':
      return data.allL90 ?? [];
    default:
      return [];
  }
}

interface Cell {
  users: number;
  getapp: number;
  cr: number;
  pos: number | null;
}

// Sum a surface's rows for one period (L = latest, P = prior). Position is a
// users-weighted average over rows that have a position.
function aggregate(rows: KeywordRow[], period: 'L' | 'P'): Cell {
  let users = 0;
  let getapp = 0;
  let posNum = 0;
  let posDen = 0;
  for (const r of rows) {
    const u = period === 'L' ? r.usersL : r.usersP;
    const g = period === 'L' ? r.getAppL : r.getAppP;
    const p = period === 'L' ? r.posL : r.posP;
    users += u;
    getapp += g;
    if (p != null && u > 0) {
      posNum += p * u;
      posDen += u;
    }
  }
  return {
    users,
    getapp,
    cr: users > 0 ? getapp / users : 0,
    pos: posDen > 0 ? posNum / posDen : null,
  };
}

/** Funnel breakdown computed from All_Lx (all tracked keywords) — same scope as Overview. */
export function accountFunnel(data: SheetPayload, window: Window): FunnelBreakdown {
  const rows = rowsForWindow(data, window);
  const organicRows = rows.filter((r) => r.surface !== 'search_ad');
  const paidRows = rows.filter((r) => r.surface === 'search_ad');

  const organic = { L: aggregate(organicRows, 'L'), P: aggregate(organicRows, 'P') };
  const paid = { L: aggregate(paidRows, 'L'), P: aggregate(paidRows, 'P') };

  return {
    window,
    organic,
    paid,
    total: {
      L: { users: organic.L.users + paid.L.users, getapp: organic.L.getapp + paid.L.getapp },
      P: { users: organic.P.users + paid.P.users, getapp: organic.P.getapp + paid.P.getapp },
    },
  };
}

export interface AccountTotals {
  usersL: number;
  usersP: number;
  getAppL: number;
  getAppP: number;
  deltaUsersPct: number;
  deltaGetAppPct: number;
}

/** Whole-account (all tracked keywords) totals + deltas for a window. */
export function accountTotals(data: SheetPayload, window: Window): AccountTotals {
  const rows = rowsForWindow(data, window);
  let usersL = 0;
  let usersP = 0;
  let getAppL = 0;
  let getAppP = 0;
  for (const r of rows) {
    usersL += r.usersL;
    usersP += r.usersP;
    getAppL += r.getAppL;
    getAppP += r.getAppP;
  }
  return {
    usersL,
    usersP,
    getAppL,
    getAppP,
    deltaUsersPct: usersP > 0 ? (usersL - usersP) / usersP : 0,
    deltaGetAppPct: getAppP > 0 ? (getAppL - getAppP) / getAppP : 0,
  };
}
