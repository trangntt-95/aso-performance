'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ChevronRight, AlertCircle } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CATEGORY_ORDER, categoryStyle } from '@/lib/utils/colors';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/sheets/types';

export function CategoriesIndex() {
  const { data, isLoading, error } = useSheetData();

  const stats = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { count: number; users: number; getApp: number; alerts: number }>();
    data.allL7.forEach((r) => {
      const k = r.category;
      const cur = map.get(k) ?? { count: 0, users: 0, getApp: 0, alerts: 0 };
      cur.count += 1;
      cur.users += r.usersL;
      cur.getApp += r.getAppL;
      if (r.alert && r.alert !== 'OK') cur.alerts += 1;
      map.set(k, cur);
    });
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c as Category,
      ...(map.get(c) as { count: number; users: number; getApp: number; alerts: number }),
    }));
  }, [data]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
        <div className="font-semibold">Couldn’t load categories</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Drill into a category to inspect keyword performance across L7 / L30 / L90 windows.
      </p>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : stats.length === 0 ? (
        <div className="border rounded-lg bg-white py-16 text-center text-sm text-slate-500">
          No category data.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stats.map(({ category, count, users, getApp, alerts }) => {
            const s = categoryStyle(category);
            return (
              <Link key={category} href={`/categories/${encodeURIComponent(category)}`}>
                <Card className="hover:shadow-md transition cursor-pointer">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium',
                          s.bg,
                          s.text,
                        )}
                      >
                        <span>{s.emoji}</span>
                        {category}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px]">
                      <div className="text-slate-500">Keywords</div>
                      <div className="font-mono text-right">{count}</div>
                      <div className="text-slate-500">Users L7</div>
                      <div className="font-mono text-right">{formatNumber(users, { compact: true })}</div>
                      <div className="text-slate-500">Install L7</div>
                      <div className="font-mono text-right">{formatNumber(getApp, { compact: true })}</div>
                      <div className="text-slate-500">Alerts</div>
                      <div className={cn('font-mono text-right', alerts > 0 ? 'text-red-700 font-semibold' : 'text-slate-400')}>
                        {alerts}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
