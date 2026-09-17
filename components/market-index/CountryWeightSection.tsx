'use client';

import { useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import type { SheetPayload } from '@/lib/sheets/types';
import {
  USER_WEIGHT_WINDOW,
  buildCountryWeights,
  weightMismatch,
  type WeightBasis,
} from '@/lib/market/countryWeighting';
import { CoreMarketCountries } from './CoreMarketCountries';
import { WeightMismatchNote } from './WeightMismatchNote';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// Nửa dưới trang Market Health: nước nào đáng nặng.
//
// Ranh giới với nửa trên là chủ đích. Nửa trên trả lời "toàn thị trường đang
// lên hay xuống" nên không cân gì; cân theo tiền ở đó sẽ đổi câu hỏi mà vẫn để
// nguyên cái tên, và người đọc tuần sau không nói được mình đã xem số nào.
// Từ đây xuống mới là chỗ trọng số có nghĩa, nên công tắc nằm ở đây.
//
// Công tắc có hai nấc chứ không phải ba: "thô" không thuộc về phần này — không
// cân gì thì đã là nửa trên rồi.

export function CountryWeightSection({ data: dataProp }: { data?: SheetPayload | undefined }) {
  const { data: fetched } = useSheetData();
  const data = dataProp ?? fetched;
  const [basis, setBasis] = useState<WeightBasis>('revenue');

  const weights = useMemo(() => buildCountryWeights(data), [data]);
  const mismatch = useMemo(() => weightMismatch(weights), [weights]);

  if (!weights) return null;
  const top = basis === 'revenue' ? weights.topByRevenue : weights.topByUsers;
  const topShare = top ? (basis === 'revenue' ? top.revenueShare : top.usersShare) : 0;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Scale className="h-4 w-4 text-indigo-600" />
            Trọng số quốc gia
            {weights.period && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-600" title="Kỳ của khối doanh thu trong tab Countries performance — cập nhật theo quý, không đổi theo cửa sổ ở nửa trên">
                📅 doanh thu {weights.period} · users L90
              </span>
            )}
          </h2>
          <p className="text-[11px] leading-snug text-slate-500">
            {basis === 'revenue' ? (
              <>
                Nước nào <b>mang tiền về nhiều</b> thì nặng · {weights.withRevenue} nước có doanh thu
                {weights.period ? ` (${weights.period})` : ''}
              </>
            ) : (
              <>
                Nước nào <b>nhiều người dùng</b> thì nặng · {weights.withUsers} nước có users
              </>
            )}
            {top && (
              <>
                {' · '}
                <span
                  title={
                    basis === 'revenue'
                      ? `Doanh thu $${formatNumber(Math.round(top.revenue))}`
                      : `${formatNumber(top.users)} users ${USER_WEIGHT_WINDOW}`
                  }
                >
                  {top.country} nặng nhất ({(topShare * 100).toFixed(0)}%)
                </span>
              </>
            )}
          </p>
        </div>
        <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-slate-200 text-[11px]">
          <button
            type="button"
            onClick={() => setBasis('revenue')}
            title="Trọng số = share doanh thu của nước trong block Countries performance (cập nhật theo quý)"
            className={cn(
              'px-2 py-0.5 font-medium transition',
              basis === 'revenue' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            Cân theo doanh thu
          </button>
          <button
            type="button"
            onClick={() => setBasis('users')}
            title="Trọng số = share users của nước, theo cửa sổ đang chọn trong bảng"
            className={cn(
              'border-l border-slate-200 px-2 py-0.5 font-medium transition',
              basis === 'users' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            Cân theo user
          </button>
        </div>
      </div>

      <WeightMismatchNote report={mismatch} />
      <CoreMarketCountries data={data} weightBasis={basis} weights={weights} />
    </section>
  );
}
