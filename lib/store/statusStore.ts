'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActionQueueRow, RowStatus, RowStatusRecord } from '@/lib/sheets/types';

export function rowKeyOf(row: Pick<ActionQueueRow, 'keyword' | 'surface' | 'country' | 'window'>): string {
  return `${row.keyword}||${row.surface}||${row.country}||${row.window}`;
}

interface StatusState {
  statuses: Record<string, RowStatusRecord>;
  notes: Record<string, string>;
  setStatus: (rowKey: string, status: RowStatus) => void;
  setNote: (rowKey: string, note: string) => void;
  getStatus: (rowKey: string) => RowStatus;
  clearAll: () => void;
}

export const useStatusStore = create<StatusState>()(
  persist(
    (set, get) => ({
      statuses: {},
      notes: {},
      setStatus: (rowKey, status) =>
        set((s) => ({
          statuses: {
            ...s.statuses,
            [rowKey]: {
              status,
              updatedAt: new Date().toISOString(),
              note: s.statuses[rowKey]?.note,
            },
          },
        })),
      setNote: (rowKey, note) =>
        set((s) => ({
          notes: { ...s.notes, [rowKey]: note },
        })),
      getStatus: (rowKey) => get().statuses[rowKey]?.status ?? 'new',
      clearAll: () => set({ statuses: {}, notes: {} }),
    }),
    { name: 'aso-status-storage' },
  ),
);
