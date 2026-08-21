'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useNotesStore } from '@/lib/store/notesStore';
import { useSheetData } from '@/lib/hooks/useSheetData';
import {
  CHANGELOG_SCOPE,
  TAG_LABEL,
  makeEntryId,
  readChangelog,
  type ChangeTagKind,
} from '@/lib/store/changelog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// What was changed, and what happened after.
//
// The point of separating this from camp notes: the changes that move the numbers
// most aren't scoped to one campaign. Raising the Brand CPI cap, excluding a
// country, switching an export format — each shifted a whole screen and had
// nowhere to be recorded. A week later the CPI has moved and nothing says whether
// that was a decision or the auction.
//
// Entries carry the date the change HAPPENED, not the date it was typed, so the
// daily-trend markers land on the right day when you log Tuesday's change on
// Wednesday.

const KINDS: ChangeTagKind[] = ['account', 'category', 'country', 'camp', 'keyword'];

const TAG_CLS: Record<ChangeTagKind, string> = {
  account: 'bg-slate-800 text-white',
  category: 'bg-indigo-100 text-indigo-800',
  country: 'bg-teal-100 text-teal-800',
  camp: 'bg-amber-100 text-amber-800',
  keyword: 'bg-violet-100 text-violet-800',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export function ChangelogView() {
  const { data } = useSheetData();
  const notes = useNotesStore((s) => s.notes);
  const updatedAt = useNotesStore((s) => s.updatedAt);
  const loaded = useNotesStore((s) => s.loaded);
  const load = useNotesStore((s) => s.load);
  const setNote = useNotesStore((s) => s.setNote);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const entries = useMemo(() => readChangelog(notes, updatedAt), [notes, updatedAt]);

  const [date, setDate] = useState(todayIso);
  const [kind, setKind] = useState<ChangeTagKind>('account');
  const [value, setValue] = useState('');
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<'all' | ChangeTagKind>('all');

  // Suggestions for the tag value, so it matches what the rest of the dashboard
  // keys on instead of a free-typed near-miss.
  const options = useMemo(() => {
    if (kind === 'category') {
      return Array.from(new Set((data?.campLinks ?? []).map((c) => c.category).filter(Boolean))).sort();
    }
    if (kind === 'country') {
      const fromRev = (data?.perGeoRevenue ?? []).map((r) => r.country);
      const fromTier = (data?.marketTiers ?? []).flatMap((t) => t.countries.map((c) => c.country));
      return Array.from(new Set([...fromRev, ...fromTier].filter(Boolean))).sort();
    }
    if (kind === 'camp') {
      return Array.from(new Set((data?.campLinks ?? []).map((c) => c.camp).filter(Boolean))).sort();
    }
    return [];
  }, [kind, data?.campLinks, data?.perGeoRevenue, data?.marketTiers]);

  const canAdd = text.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && (kind === 'account' || value.trim());

  const add = () => {
    if (!canAdd) return;
    const id = makeEntryId(date, { kind, value: kind === 'account' ? '' : value.trim() });
    setNote(CHANGELOG_SCOPE, id, text.trim());
    setText('');
    setValue('');
  };

  const remove = (id: string) => {
    // The notes store treats an empty string as a delete.
    setNote(CHANGELOG_SCOPE, id, '');
  };

  const shown = filter === 'all' ? entries : entries.filter((e) => e.tag.kind === filter);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        <b>Change log</b> — ghi lại <b>bạn đã đổi gì</b> và <b>thấy gì sau đó</b>. Khác với note trên từng camp: những
        thay đổi làm số chạy mạnh nhất thường không thuộc một camp nào (nâng trần CPI, exclude một nước, đổi format
        export). Không ghi lại thì tuần sau CPI nhảy mà không biết là do quyết định hay do đấu giá.
        <div className="mt-1">
          Ngày nhập là <b>ngày thay đổi thật sự xảy ra</b>, không phải ngày bạn gõ — nhờ vậy vạch mốc trên biểu đồ theo
          ngày rơi đúng chỗ. Lưu vào tab <code className="text-[10px]">App_Notes</code> nên xem/sửa được cả trong sheet.
        </div>
      </div>

      {/* Add form */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Ngày thay đổi</span>
            <input
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
              className="h-7 rounded border border-slate-200 px-2 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Phạm vi</span>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as ChangeTagKind);
                setValue('');
              }}
              className="h-7 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {TAG_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          {kind !== 'account' && (
            <label className="flex min-w-[10rem] flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">{TAG_LABEL[kind]} nào</span>
              <input
                list="changelog-options"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={kind === 'keyword' ? 'gõ keyword…' : 'chọn hoặc gõ…'}
                className="h-7 rounded border border-slate-200 px-2 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <datalist id="changelog-options">
                {options.slice(0, 400).map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
          )}
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Đổi gì / thấy gì</span>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
              }}
              placeholder="vd: nâng trần CPI Brand từ $15 lên $35 ở 4 nước Tier 1"
              className="h-7 text-xs"
            />
          </label>
          <Button size="sm" className="h-7 gap-1 text-xs" disabled={!canAdd} onClick={add}>
            <Plus className="h-3 w-3" />
            Thêm
          </Button>
        </div>
      </div>

      {/* Filter + list */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(['all', ...KINDS] as const).map((k) => {
          const n = k === 'all' ? entries.length : entries.filter((e) => e.tag.kind === k).length;
          if (k !== 'all' && n === 0) return null;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cn(
                'rounded border px-2 py-0.5 text-[11px] font-medium transition',
                filter === k
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-slate-400',
              )}
            >
              {k === 'all' ? 'Tất cả' : TAG_LABEL[k]} ({n})
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-[12px] text-slate-400">
          {loaded ? 'Chưa có mục nào. Ghi thay đổi đầu tiên ở trên.' : 'Đang tải…'}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <span className="w-20 shrink-0 font-mono text-[11px] text-slate-500">{e.date}</span>
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                  TAG_CLS[e.tag.kind],
                )}
                title={TAG_LABEL[e.tag.kind]}
              >
                {e.tag.kind === 'account' ? 'toàn bộ' : e.tag.value}
              </span>
              <span className="min-w-0 flex-1 text-[12px] leading-snug text-slate-800">{e.text}</span>
              {e.writtenAt && (
                <span
                  className="shrink-0 cursor-help text-[9px] text-slate-300"
                  title={`Ghi lúc ${new Date(e.writtenAt).toLocaleString('vi-VN')}`}
                >
                  ✎
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(e.id)}
                title="Xoá mục này"
                className="shrink-0 text-slate-300 transition hover:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="text-[10px] leading-snug text-slate-400">
        Mục gắn <b>Toàn tài khoản</b> sẽ hiện ở mọi màn hình liên quan, vì một thay đổi cấp tài khoản ảnh hưởng tất cả.
        Mục gắn category / nước / camp chỉ hiện ở đúng chỗ đó.
      </div>
    </div>
  );
}
