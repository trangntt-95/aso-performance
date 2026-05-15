import Link from 'next/link';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { KeywordTrendSheet } from '@/components/keyword-trend/KeywordTrendSheet';
import { CountryDetailSheet } from '@/components/overview/CountryDetailSheet';
import { CategoryDetailSheet } from '@/components/overview/CategoryDetailSheet';

export default function ExecLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 px-4 md:px-6 py-3">
          <Link href="/exec" className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center text-white font-bold shrink-0">
              T
            </div>
            <div className="min-w-0">
              <div className="font-semibold leading-tight text-slate-900 truncate">
                TrueProfit ASO
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                Executive view
              </div>
            </div>
          </Link>
          <RefreshButton />
        </div>
      </header>
      <main className="px-4 md:px-6 py-5 md:py-8">{children}</main>
      <KeywordTrendSheet />
      <CountryDetailSheet />
      <CategoryDetailSheet />
    </div>
  );
}
