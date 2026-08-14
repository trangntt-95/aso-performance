'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, HeartPulse, Search, X } from 'lucide-react';
import { useSheetData } from '@/lib/hooks/useSheetData';
import { NoteCell } from '@/components/shared/NoteCell';
import { Sparkline } from '@/components/shared/Sparkline';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/utils/format';
import {
  analyseCampHealth,
  BUCKET_META,
  TONE_CLS,
  type CampHealthRow,
  type HealthBucket,
} from '@/lib/market/campHealth';
import { buildCampUrlIndex } from '@/lib/sheets/campUrl';
import {
  CAMP_NOTE_SCOPE,
  buildKeywordNotesByCamp,
  campNoteId,
  legacyCampNoteKeys,
  readCampNoteAt,
} from '@/lib/store/campNotes';
import { KeywordNotesForCamp } from '@/components/shared/KeywordNotesForCamp';
import { useNotesStore } from '@/lib/store/notesStore';
import { cn } from '@/lib/utils';

// Where the ad budget leaks. The overbid table asks whether a camp pays more per
// click than recommended; this asks the blunter question — is the money buying
// anything at all. Measured live 2026-08: 31% of 30-day spend went to camps with
// zero installs, which no existing view surfaced.

const money = (n: number | null) => (n == null ? '—' : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`);

type SortKey = 'atRisk' | 'spend' | 'prevSpend' | 'installs' | 'cpi' | 'cpc' | 'imp' | 'clicks' | 'ctr' | 'impDelta' | 'camp' | 'bucket';
type SortDir = 'asc' | 'desc';

function SortHead({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
  extra,
  title,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
  extra?: string;
  title?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      title={title}
      className={cn(
        'cursor-pointer select-none px-2 py-2 font-medium hover:text-slate-900',
        align === 'right' ? 'text-right' : 'text-left',
        active && 'text-indigo-700',
        extra,
      )}
    >
      <span className={cn('inline-flex items-center gap-0.5', align === 'right' && 'flex-row-reverse')}>
        {label}
        <span className="w-2 text-[9px] text-indigo-600">{active ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
      </span>
    </th>
  );
}

const ORDER: HealthBucket[] = ['burning', 'wasted-imp', 'losing-imp', 'pricey', 'idle', 'paused', 'rising', 'scale', 'ok'];

const WINDOWS = [7, 14, 30, 60, 90];

// Once a camp is noted it drops out of the working list for this many days so
// the list only shows what still needs doing — then it comes back so the fix
// gets checked. Same rule as the Overbid and Underbid tables.
const HIDE_DAYS = 5;
const DAY_MS = 86_400_000;

const dmy = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

type NoteView = 'active' | 'handled';

// The four questions worth a headline. Each is one bucket, promoted out of the
// chip row into its own card so the number is visible without filtering first.
const CARDS: { bucket: HealthBucket; title: string; sub: string }[] = [
  { bucket: 'burning', title: 'Click nhưng 0 install', sub: 'tiền ra, không có gì vào' },
  { bucket: 'wasted-imp', title: 'CTR có vấn đề', sub: 'hiển thị nhiều, gần như không ai bấm' },
  { bucket: 'losing-imp', title: 'Mất hiển thị mạnh', sub: 'đang thua đấu giá' },
  { bucket: 'rising', title: 'Có tiềm năng', sub: 'imp tăng + install tăng vs kỳ trước' },
];

// Cards share one plain surface; the tone shows up only on the number, so four
// cards side by side read as one panel instead of four competing blocks.
const TONE_TEXT: Record<string, string> = {
  bad: 'text-rose-700',
  warn: 'text-amber-700',
  good: 'text-emerald-700',
  neutral: 'text-slate-700',
};

export function CampHealthView() {
  const { data, isLoading, error } = useSheetData();
  const [search, setSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState<HealthBucket | 'all' | 'problems'>('problems');
  const [linkFilter, setLinkFilter] = useState<'all' | 'no-url'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('atRisk');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      // Text columns read best A→Z; every metric reads best worst-first.
      setSortDir(k === 'camp' || k === 'bucket' ? 'asc' : 'desc');
    }
  };
  // Comparison window, user-chosen. Everything (buckets, deltas, the four
  // headline cards) recomputes against the equal-length window before it.
  const [windowDays, setWindowDays] = useState(30);

  const result = useMemo(
    () =>
      analyseCampHealth(data?.shopifyDaily ?? [], {
        windowDays,
        canonicalNames: (data?.campLinks ?? []).map((c) => c.camp),
        pausedCamps: (data?.pausedKw ?? []).map((r) => r.camp),
      }),
    [data?.shopifyDaily, data?.campLinks, data?.pausedKw, windowDays],
  );
  const campUrl = useMemo(() => buildCampUrlIndex(data?.campLinks ?? []), [data?.campLinks]);
  // Camps the spend data knows about but Camp_Links doesn't. Not a fault of the
  // camp — it just means the row is missing from the sheet, which also costs it
  // its Geo, so it can't be checked against the exclude list either.
  const noUrlCount = useMemo(
    () => result.rows.filter((r) => !campUrl.get(r.camp)).length,
    [result.rows, campUrl],
  );
  // Keyword notes reach a campaign through the camps pinned on Underbid.
  const loadNotes = useNotesStore((st) => st.load);
  const allNotes = useNotesStore((st) => st.notes);
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);
  const kwNotesByCamp = useMemo(() => buildKeywordNotesByCamp(allNotes), [allNotes]);

  const notesLoaded = useNotesStore((st) => st.loaded);
  const noteTimes = useNotesStore((st) => st.updatedAt);
  // Snapshot the timestamps once when they first load: a camp noted in THIS
  // session must stay on screen while you're typing, and only drop out on the
  // next visit. Without this the row vanishes mid-sentence.
  const [noteSnapshot, setNoteSnapshot] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (notesLoaded && noteSnapshot === null) setNoteSnapshot(noteTimes);
  }, [notesLoaded, noteSnapshot, noteTimes]);

  const [noteView, setNoteView] = useState<NoteView>('active');

  // camp id → when it comes back into the working list.
  const hiddenUntil = useMemo(() => {
    const map = new Map<string, number>();
    if (!noteSnapshot) return map;
    const now = Date.now();
    for (const r of result.rows) {
      const at = readCampNoteAt(noteSnapshot, r.camp);
      if (at === null) continue;
      const until = at + HIDE_DAYS * DAY_MS;
      if (until > now) map.set(campNoteId(r.camp), until);
    }
    return map;
  }, [result.rows, noteSnapshot]);

  const counts = useMemo(() => {
    const m = new Map<HealthBucket, { n: number; risk: number }>();
    result.rows.forEach((r) => {
      const e = m.get(r.bucket) ?? { n: 0, risk: 0 };
      e.n++;
      e.risk += r.atRisk;
      m.set(r.bucket, e);
    });
    return m;
  }, [result.rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = result.rows.filter((r) => {
      const hidden = hiddenUntil.has(campNoteId(r.camp));
      // "Đã xử lý" is the mirror of the working list: exactly the camps sitting
      // inside their post-note window.
      if (noteView === 'handled' ? !hidden : hidden) return false;
      if (
        bucketFilter === 'problems' &&
        (r.bucket === 'ok' || r.bucket === 'scale' || r.bucket === 'rising' || r.bucket === 'paused')
      )
        return false;
      if (bucketFilter !== 'all' && bucketFilter !== 'problems' && r.bucket !== bucketFilter) return false;
      if (linkFilter === 'no-url' && campUrl.get(r.camp)) return false;
      if (q && !r.camp.toLowerCase().includes(q)) return false;
      return true;
    });
    const val = (r: CampHealthRow): number | string | null => {
      switch (sortKey) {
        case 'spend': return r.cur.spend;
        case 'prevSpend': return r.prev.spend;
        case 'installs': return r.cur.installs;
        case 'cpi': return r.cur.cpi;
        case 'cpc': return r.cur.cpc;
        case 'imp': return r.cur.impressions;
        case 'clicks': return r.cur.clicks;
        case 'ctr': return r.cur.ctr;
        case 'impDelta': return r.impDelta;
        case 'camp': return r.camp.toLowerCase();
        case 'bucket': return ORDER.indexOf(r.bucket);
        default: return r.atRisk;
      }
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...out].sort((a, b) => {
      const va = val(a), vb = val(b);
      // Rows with no value for the sorted column sink to the bottom either way,
      // so flipping the direction never promotes a blank above a real number.
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const base =
        typeof va === 'string' || typeof vb === 'string'
          ? String(va).localeCompare(String(vb))
          : (va as number) - (vb as number);
      return base * dir || b.atRisk - a.atRisk;
    });
  }, [result.rows, search, bucketFilter, linkFilter, campUrl, sortKey, sortDir, noteView, hiddenUntil]);

  const problemCount = useMemo(
    () =>
      result.rows.filter(
        (r) =>
          !['ok', 'scale', 'rising', 'paused'].includes(r.bucket) &&
          !hiddenUntil.has(campNoteId(r.camp)),
      ).length,
    [result.rows, hiddenUntil],
  );

  const totalRisk = useMemo(
    () =>
      result.rows
        .filter((r) => !['ok', 'scale', 'rising', 'paused'].includes(r.bucket))
        .filter((r) => !hiddenUntil.has(campNoteId(r.camp)))
        .reduce((s, r) => s + r.atRisk, 0),
    [result.rows, hiddenUntil],
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
        <div className="font-semibold">Couldn’t load data</div>
        <div className="text-sm text-slate-600">{(error as Error).message}</div>
      </div>
    );
  }

  if (!isLoading && result.rows.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <b>Chưa có dữ liệu chi tiêu theo ngày.</b> Trang này đọc export Shopify Ads theo ngày (tab{' '}
          <code className="text-[10px]">By campaign</code> của sheet &quot;Trang - shopify ad daily&quot;). Nếu biến môi
          trường <code className="text-[10px]">GOOGLE_SHEET_ID_SHOPIFY</code> chưa được cấu hình hoặc sheet chưa share
          cho service account thì bảng sẽ trống.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        <HeartPulse className="h-4 w-4 shrink-0 text-indigo-600 mt-0.5" />
        <div>
          <b>Sức khoẻ campaign</b> — lấy từ export Shopify theo ngày, so kỳ đang chọn với kỳ trước liền kề cùng độ
          dài. Bảng sắp theo <b>số tiền đang gặp vấn đề</b>, không phải theo tổng chi.
          <div className="mt-1">
            Tổng chi kỳ này <b>${formatNumber(Math.round(result.totalSpend))}</b> · CPI trung vị{' '}
            <b>{money(result.medianCpi)}</b> ·{' '}
            <span className="font-semibold text-rose-700">
              ${formatNumber(Math.round(totalRisk))} ({result.totalSpend > 0 ? Math.round((100 * totalRisk) / result.totalSpend) : 0}%) đang có vấn đề
            </span>
          </div>
        </div>
      </div>

      {/* Working list vs the camps already noted */}
      {!isLoading && (
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
          {([
            {
              id: 'active' as NoteView,
              label: '🔧 Cần xử lý',
              n: result.rows.length - hiddenUntil.size,
              title: `Camp chưa note, hoặc đã note quá ${HIDE_DAYS} ngày nên quay lại để kiểm tra.`,
            },
            {
              id: 'handled' as NoteView,
              label: '✅ Đã xử lý',
              n: hiddenUntil.size,
              title: `Camp bạn vừa ghi note — tạm ẩn ${HIDE_DAYS} ngày để bạn sửa, sau đó tự quay lại danh sách cần xử lý.`,
            },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setNoteView(t.id)}
              title={t.title}
              className={cn(
                'rounded-md px-2.5 py-1 font-medium transition',
                noteView === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {t.label}
              <span className={cn('ml-1 text-[10px]', noteView === t.id ? 'text-slate-300' : 'text-slate-400')}>
                {t.n}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Four headline dashboards — the questions worth answering at a glance */}
      {!isLoading && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {CARDS.map((c) => {
            const stat = counts.get(c.bucket);
            const n = stat?.n ?? 0;
            const risk = stat?.risk ?? 0;
            const active = bucketFilter === c.bucket;
            const top = result.rows.filter((r) => r.bucket === c.bucket).slice(0, 3);
            return (
              <button
                key={c.bucket}
                type="button"
                onClick={() => setBucketFilter(active ? 'problems' : c.bucket)}
                title={BUCKET_META[c.bucket].help}
                className={cn(
                  'rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-400',
                  active && 'ring-2 ring-slate-900 ring-offset-1',
                )}
              >
                <div className="text-[11px] font-semibold text-slate-700">{c.title}</div>
                <div className="text-[10px] text-slate-500">{c.sub}</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className={cn('text-xl font-bold', TONE_TEXT[BUCKET_META[c.bucket].tone])}>{n}</span>
                  <span className="text-[10px] text-slate-500">camp</span>
                  {risk > 0 && (
                    <span className="ml-auto font-mono text-[11px] font-semibold text-rose-700">
                      ${formatNumber(Math.round(risk))}
                    </span>
                  )}
                </div>
                {top.length > 0 ? (
                  <div className="mt-1 space-y-0.5 border-t border-slate-100 pt-1">
                    {top.map((r) => (
                      <div key={r.camp} className="truncate whitespace-nowrap text-[9px] text-slate-500" title={r.camp}>
                        {r.camp}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-slate-400">không có camp nào</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
          <div className="relative flex-1 min-w-[150px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm camp…" className="pl-7 h-7 text-xs" />
          </div>
          {/* One dropdown for every group, with its count — the chip row it
              replaced needed nine colours to say the same thing. */}
          <select
            value={bucketFilter}
            onChange={(e) => setBucketFilter(e.target.value as HealthBucket | 'all' | 'problems')}
            className="h-7 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            title="Nhóm vấn đề"
          >
            <option value="problems">Cần xử lý ({problemCount})</option>
            <option value="all">Tất cả ({result.rows.length})</option>
            {ORDER.map((b) => {
              const c = counts.get(b);
              if (!c || c.n === 0) return null;
              return (
                <option key={b} value={b}>
                  {BUCKET_META[b].label} ({c.n}
                  {c.risk > 0 ? ` · $${Math.round(c.risk)}` : ''})
                </option>
              );
            })}
          </select>
          <select
            value={linkFilter}
            onChange={(e) => setLinkFilter(e.target.value as 'all' | 'no-url')}
            className="h-7 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            title="Camp chưa có URL trong Camp_Links: không mở thẳng sang Apple Ads được, và cũng không có Geo để đối chiếu"
          >
            <option value="all">Mọi camp</option>
            <option value="no-url">Chưa có URL ({noUrlCount})</option>
          </select>
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="h-7 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            title="So kỳ này với kỳ trước liền kề cùng độ dài"
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                Kỳ: {w} ngày
              </option>
            ))}
          </select>
          {(search || bucketFilter !== 'problems' || linkFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => { setSearch(''); setBucketFilter('problems'); setLinkFilter('all'); setSortKey('atRisk'); setSortDir('desc'); }}
            >
              <X className="h-3 w-3" />
              Reset
            </Button>
          )}
          <span className="ml-auto text-[11px] text-slate-500">{filtered.length} camp</span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-white py-16 text-center text-sm text-slate-500">
          {noteView === 'handled'
            ? `Chưa có camp nào đang trong thời gian tạm ẩn. Ghi note vào một camp ở tab 🔧 Cần xử lý, nó sẽ chuyển sang đây ${HIDE_DAYS} ngày.`
            : 'Không có camp nào khớp bộ lọc.'}
        </div>
      ) : (
        <div className="max-h-[75vh] overflow-auto rounded-lg border bg-white">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-sm [&_th]:bg-slate-50">
              <tr>
                <SortHead label="Camp" col="camp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} extra="px-3 whitespace-nowrap" />
                <SortHead label="Nhóm" col="bucket" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Sắp theo mức nghiêm trọng của nhóm" />
                <SortHead label="$ có vấn đề" col="atRisk" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Số tiền đang gặp vấn đề ở camp này" />
                <SortHead
                  label="Spend"
                  col="spend"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  title="Chi tiêu trong kỳ đang chọn, kèm % thay đổi so với kỳ trước liền kề"
                />
                <SortHead
                  label="Spend kỳ trước"
                  col="prevSpend"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  title="Chi tiêu ở kỳ trước liền kề, để so trực tiếp"
                />
                <SortHead label="Imp" col="imp" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Clicks" col="clicks" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="CTR" col="ctr" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Clicks / Impressions trong kỳ" />
                <SortHead label="Inst" col="installs" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="CPC" col="cpc" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Chi / clicks trong kỳ" />
                <SortHead label="CPI" col="cpi" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Chi / installs trong kỳ" />
                <SortHead label="Xu hướng imp" col="impDelta" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} extra="min-w-[7rem]" title="Impressions/ngày so với kỳ trước" />
                <th className="px-2 py-2 text-left font-medium min-w-[18rem]">Vấn đề &amp; nên làm gì</th>
                <th className="px-2 py-2 text-left font-medium min-w-[9rem]">Note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const meta = BUCKET_META[r.bucket];
                const url = campUrl.get(r.camp);
                const hideTs = hiddenUntil.get(campNoteId(r.camp));
                const impTone = r.impDelta == null ? '' : r.impDelta <= -0.35 ? 'text-rose-600' : r.impDelta < 0 ? 'text-amber-600' : 'text-emerald-600';
                return (
                  <tr key={r.camp} className="border-t align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-indigo-600 hover:underline"
                        >
                          {r.camp}
                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="inline-flex items-baseline gap-1">
                          <span className="text-[12px] font-medium text-slate-800">{r.camp}</span>
                          <span
                            className="cursor-help rounded bg-slate-100 px-1 text-[9px] font-medium text-slate-500"
                            title="Chưa có dòng URL trong Camp_Links → không mở thẳng sang Apple Ads được, và cũng không có cột Geo để đối chiếu với danh sách exclude."
                          >
                            chưa có URL
                          </span>
                        </span>
                      )}
                      {hideTs && (
                        <div
                          className="mt-0.5 inline-block rounded bg-amber-100 px-1 text-[9px] font-semibold leading-[1.4] text-amber-700"
                          title={`Đã ghi note → tạm ẩn khỏi danh sách cần xử lý. Tự hiện lại ngày ${dmy(hideTs)} để kiểm tra thay đổi.`}
                        >
                          ẩn → hiện lại {dmy(hideTs)}
                        </div>
                      )}
                      {r.lastActive && (
                        <div className="text-[10px] text-slate-400">hoạt động cuối {r.lastActive}</div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={cn(
                          'inline-block cursor-help whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium',
                          TONE_CLS[meta.tone],
                        )}
                        title={meta.help}
                      >
                        {meta.short}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[11px] font-semibold text-rose-700">
                      {r.atRisk > 0 ? `$${Math.round(r.atRisk)}` : '—'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[11px] whitespace-nowrap">
                      <span className="font-semibold text-slate-800">${formatNumber(Math.round(r.cur.spend))}</span>
                      {r.spendDelta !== null && (
                        <span
                          className={cn(
                            'block text-[9px]',
                            // Spend moving is neither good nor bad on its own —
                            // it only means something next to what it bought,
                            // which is the columns beside it. Colour it neutral.
                            Math.abs(r.spendDelta) < 0.1 ? 'text-slate-400' : 'text-slate-500',
                          )}
                        >
                          {pct(r.spendDelta)} vs kỳ trước
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-500">
                      {r.prev.spend > 0 ? `$${formatNumber(Math.round(r.prev.spend))}` : '—'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-600">{formatNumber(Math.round(r.cur.impressions), { compact: true })}</td>
                    <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-600">{r.cur.clicks}</td>
                    <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-600">
                      {r.cur.ctr === null ? '—' : `${(r.cur.ctr * 100).toFixed(2)}%`}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-800">{r.cur.installs}</td>
                    <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-700">{money(r.cur.cpc)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap font-mono text-[11px]">
                      <span className={r.cur.cpi === null ? 'text-slate-300' : r.reliable ? 'text-slate-800' : 'text-slate-400'}>
                        {money(r.cur.cpi)}
                      </span>
                      {r.cur.cpi !== null && !r.reliable && (
                        <span className="ml-0.5 text-[9px] text-amber-600" title={`Chỉ ${r.cur.installs} install — CPI ở mức này là nhiễu, đọc tham khảo thôi.`}>?</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <Sparkline points={r.series} stroke={r.impDelta != null && r.impDelta <= -0.35 ? '#e11d48' : '#0891b2'} />
                        <span className={cn('font-mono text-[9px]', impTone)}>{pct(r.impDelta)}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-[10px] leading-snug text-slate-600">{r.reason}</td>
                    {/* Same campaign note the Overbid table edits. */}
                    <NoteCell
                      scope={CAMP_NOTE_SCOPE}
                      noteId={campNoteId(r.camp)}
                      fallbackKeys={legacyCampNoteKeys(r.camp)}
                      extra={<KeywordNotesForCamp items={kwNotesByCamp.get(campNoteId(r.camp)) ?? []} />}
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t px-3 py-2 text-[10px] text-slate-400">
            Mỗi camp chỉ vào <b>một nhóm</b> — vấn đề tốn tiền nhất thắng. Cột <b>$ có vấn đề</b>: nhóm đốt tiền / hiển
            thị phí / mất hiển thị tính bằng toàn bộ chi kỳ này; nhóm CPI cao chỉ tính phần vượt so với CPI trung vị.
            Camp đã ghi note tạm chuyển sang <b>✅ Đã xử lý</b> trong {HIDE_DAYS} ngày, sau đó tự quay lại{' '}
            <b>🔧 Cần xử lý</b> để bạn kiểm tra kết quả. Dấu <b>?</b> = dưới 3 install nên CPI chưa đáng tin. <b>Click tiêu đề cột để sắp xếp</b> — bấm lần nữa
            để đảo chiều; ô trống luôn nằm cuối. Tên camp bấm được để mở thẳng Shopify Ads.
          </div>
        </div>
      )}
    </div>
  );
}
