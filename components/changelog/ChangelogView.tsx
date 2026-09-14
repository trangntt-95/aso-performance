'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useNotesStore } from '@/lib/store/notesStore';
import { useSheetData } from '@/lib/hooks/useSheetData';
import {
  CHANGELOG_SCOPE,
  CHANNELS,
  TAG_LABEL,
  makeEntryId,
  readChangelog,
  type ChangeEntry,
  type ChangeTagKind,
  type Channel,
} from '@/lib/store/changelog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DateFieldDMY } from '@/components/shared/DateFieldDMY';
import { AutoGrowTextarea } from '@/components/shared/AutoGrowTextarea';
import { formatDMY, formatDMYTime } from '@/lib/utils/format';

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
//
// Channel (Shopify / Google / Microsoft Ads) was added 9/2026: the account runs
// on three ad platforms and "hạ bid brand" means a different thing on each.
// Editing rewrites the row: date / scope / channel live in the row KEY, so a
// change to any of them writes a new key and blanks the old one (the notes
// store treats '' as delete); a text-only change keeps the key.

const KINDS: ChangeTagKind[] = ['account', 'category', 'country', 'camp', 'keyword'];

const TAG_CLS: Record<ChangeTagKind, string> = {
  account: 'bg-slate-800 text-white',
  category: 'bg-indigo-100 text-indigo-800',
  country: 'bg-teal-100 text-teal-800',
  camp: 'bg-amber-100 text-amber-800',
  keyword: 'bg-violet-100 text-violet-800',
};

const CHANNEL_CLS: Record<string, string> = {
  'Shopify Ads': 'bg-emerald-100 text-emerald-800',
  'Google Ads': 'bg-sky-100 text-sky-800',
  'Microsoft Ads': 'bg-orange-100 text-orange-800',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const selectCls =
  'h-7 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500';

interface Draft {
  date: string;
  kind: ChangeTagKind;
  value: string;
  channel: Channel;
  text: string;
}

const draftOf = (e: ChangeEntry): Draft => ({
  date: e.date,
  kind: e.tag.kind,
  value: e.tag.value,
  channel: e.channel,
  text: e.text,
});

const draftValid = (d: Draft): boolean =>
  d.text.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && (d.kind === 'account' || d.value.trim().length > 0);

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

  const [draft, setDraft] = useState<Draft>({ date: todayIso(), kind: 'account', value: '', channel: '', text: '' });
  const [filter, setFilter] = useState<'all' | ChangeTagKind>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | Channel>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);

  // Suggestions for the tag value, so it matches what the rest of the dashboard
  // keys on instead of a free-typed near-miss.
  const optionsFor = (kind: ChangeTagKind): string[] => {
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
  };
  const options = useMemo(() => optionsFor(draft.kind), [draft.kind, data?.campLinks, data?.perGeoRevenue, data?.marketTiers]); // eslint-disable-line react-hooks/exhaustive-deps
  const editOptions = useMemo(() => (edit ? optionsFor(edit.kind) : []), [edit?.kind, data?.campLinks, data?.perGeoRevenue, data?.marketTiers]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = () => {
    if (!draftValid(draft)) return;
    const id = makeEntryId(draft.date, { kind: draft.kind, value: draft.kind === 'account' ? '' : draft.value.trim() }, draft.channel);
    setNote(CHANGELOG_SCOPE, id, draft.text.trim());
    setDraft((d) => ({ ...d, value: '', text: '' }));
  };

  const remove = (id: string) => {
    // The notes store treats an empty string as a delete.
    setNote(CHANGELOG_SCOPE, id, '');
    if (editingId === id) {
      setEditingId(null);
      setEdit(null);
    }
  };

  const startEdit = (e: ChangeEntry) => {
    setEditingId(e.id);
    setEdit(draftOf(e));
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEdit(null);
  };
  const saveEdit = (e: ChangeEntry) => {
    if (!edit || !draftValid(edit)) return;
    const value = edit.kind === 'account' ? '' : edit.value.trim();
    const keyChanged =
      edit.date !== e.date || edit.kind !== e.tag.kind || value !== e.tag.value || edit.channel !== e.channel;
    if (keyChanged) {
      // Date / scope / channel are part of the row key: write the new row first,
      // then blank the old one, so a failed write never loses the entry.
      const id = makeEntryId(edit.date, { kind: edit.kind, value }, edit.channel);
      setNote(CHANGELOG_SCOPE, id, edit.text.trim());
      setNote(CHANGELOG_SCOPE, e.id, '');
    } else if (edit.text.trim() !== e.text) {
      setNote(CHANGELOG_SCOPE, e.id, edit.text.trim());
    }
    cancelEdit();
  };

  const shown = entries.filter(
    (e) => (filter === 'all' || e.tag.kind === filter) && (channelFilter === 'all' || e.channel === channelFilter),
  );

  const channelCount = (c: Channel) => entries.filter((e) => e.channel === c).length;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        <b>Change log</b> — ghi lại <b>bạn đã đổi gì</b> và <b>thấy gì sau đó</b>. Khác với note trên từng camp: những
        thay đổi làm số chạy mạnh nhất thường không thuộc một camp nào (nâng trần CPI, exclude một nước, đổi format
        export). Không ghi lại thì tuần sau CPI nhảy mà không biết là do quyết định hay do đấu giá.
        <div className="mt-1">
          Ngày nhập là <b>ngày thay đổi thật sự xảy ra</b>, không phải ngày bạn gõ — nhờ vậy vạch mốc trên biểu đồ theo
          ngày rơi đúng chỗ. <b>Kênh</b> = thay đổi thuộc Shopify / Google / Microsoft Ads, bỏ trống nếu không riêng kênh
          nào. Lưu vào tab <code className="text-[10px]">App_Notes</code> nên xem/sửa được cả trong sheet. Bấm ✎ để sửa
          mục đã ghi.
        </div>
      </div>

      {/* Add form */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Ngày thay đổi</span>
            <DateFieldDMY value={draft.date} max={todayIso()} onChange={(v) => setDraft((d) => ({ ...d, date: v }))} className="h-7" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Kênh</span>
            <select value={draft.channel} onChange={(e) => setDraft((d) => ({ ...d, channel: e.target.value as Channel }))} className={selectCls}>
              <option value="">— không riêng kênh —</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Phạm vi</span>
            <select
              value={draft.kind}
              onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as ChangeTagKind, value: '' }))}
              className={selectCls}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {TAG_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          {draft.kind !== 'account' && (
            <label className="flex min-w-[10rem] flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">{TAG_LABEL[draft.kind]} nào</span>
              <input
                list="changelog-options"
                value={draft.value}
                onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
                placeholder={draft.kind === 'keyword' ? 'gõ keyword…' : 'chọn hoặc gõ…'}
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
              value={draft.text}
              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
              }}
              placeholder="vd: nâng trần CPI Brand từ $15 lên $35 ở 4 nước Tier 1"
              className="h-7 text-xs"
            />
          </label>
          <Button size="sm" className="h-7 gap-1 text-xs" disabled={!draftValid(draft)} onClick={add}>
            <Plus className="h-3 w-3" />
            Thêm
          </Button>
        </div>
      </div>

      {/* Filters + list */}
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
                filter === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-400',
              )}
            >
              {k === 'all' ? 'Tất cả' : TAG_LABEL[k]} ({n})
            </button>
          );
        })}
        {entries.some((e) => e.channel) && (
          <>
            <span className="mx-1 h-4 w-px bg-slate-200" />
            {(['all', ...CHANNELS, ''] as const).map((c) => {
              const n = c === 'all' ? entries.length : channelCount(c);
              if (c !== 'all' && n === 0) return null;
              return (
                <button
                  key={c || 'none'}
                  type="button"
                  onClick={() => setChannelFilter(c)}
                  className={cn(
                    'rounded border px-2 py-0.5 text-[11px] font-medium transition',
                    channelFilter === c ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-400',
                  )}
                >
                  {c === 'all' ? 'Mọi kênh' : c === '' ? 'Không riêng kênh' : c} ({n})
                </button>
              );
            })}
          </>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-[12px] text-slate-400">
          {loaded ? 'Chưa có mục nào. Ghi thay đổi đầu tiên ở trên.' : 'Đang tải…'}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((e) =>
            editingId === e.id && edit ? (
              <li key={e.id} className="rounded-lg border border-indigo-300 bg-indigo-50/40 px-3 py-2">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Ngày</span>
                    <DateFieldDMY value={edit.date} max={todayIso()} onChange={(v) => setEdit((d) => (d ? { ...d, date: v } : d))} className="h-7" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Kênh</span>
                    <select value={edit.channel} onChange={(ev) => setEdit((d) => (d ? { ...d, channel: ev.target.value as Channel } : d))} className={selectCls}>
                      <option value="">— không riêng kênh —</option>
                      {CHANNELS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Phạm vi</span>
                    <select
                      value={edit.kind}
                      onChange={(ev) => setEdit((d) => (d ? { ...d, kind: ev.target.value as ChangeTagKind, value: '' } : d))}
                      className={selectCls}
                    >
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {TAG_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {edit.kind !== 'account' && (
                    <label className="flex min-w-[10rem] flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">{TAG_LABEL[edit.kind]} nào</span>
                      <input
                        list="changelog-edit-options"
                        value={edit.value}
                        onChange={(ev) => setEdit((d) => (d ? { ...d, value: ev.target.value } : d))}
                        className="h-7 rounded border border-slate-200 px-2 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <datalist id="changelog-edit-options">
                        {editOptions.slice(0, 400).map((o) => (
                          <option key={o} value={o} />
                        ))}
                      </datalist>
                    </label>
                  )}
                </div>
                <label className="mt-2 flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">Đổi gì / thấy gì</span>
                  <AutoGrowTextarea
                    value={edit.text}
                    onChange={(ev) => setEdit((d) => (d ? { ...d, text: ev.target.value } : d))}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Escape') cancelEdit();
                      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) saveEdit(e);
                    }}
                    rows={2}
                    autoFocus
                    className="w-full resize-y rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" className="h-7 gap-1 text-xs" disabled={!draftValid(edit)} onClick={() => saveEdit(e)}>
                    <Check className="h-3 w-3" />
                    Lưu
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={cancelEdit}>
                    <X className="h-3 w-3" />
                    Huỷ
                  </Button>
                  <span className="text-[10px] text-slate-400">Ctrl+Enter để lưu · Esc để huỷ · đổi ngày/kênh/phạm vi sẽ ghi lại thành dòng mới trong App_Notes</span>
                </div>
              </li>
            ) : (
              <li key={e.id} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <span className="w-20 shrink-0 font-mono text-[11px] text-slate-500">{formatDMY(e.date)}</span>
                {e.channel && (
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', CHANNEL_CLS[e.channel] ?? 'bg-slate-100 text-slate-700')} title="Kênh">
                    {e.channel}
                  </span>
                )}
                <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', TAG_CLS[e.tag.kind])} title={TAG_LABEL[e.tag.kind]}>
                  {e.tag.kind === 'account' ? 'toàn bộ' : e.tag.value}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap text-[12px] leading-snug text-slate-800">{e.text}</span>
                {e.writtenAt && (
                  <span className="shrink-0 cursor-help text-[9px] text-slate-300" title={`Ghi lúc ${formatDMYTime(e.writtenAt)}`}>
                    ✎
                  </span>
                )}
                <button type="button" onClick={() => startEdit(e)} title="Sửa mục này" className="shrink-0 text-slate-300 transition hover:text-indigo-600">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => remove(e.id)} title="Xoá mục này" className="shrink-0 text-slate-300 transition hover:text-rose-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="text-[10px] leading-snug text-slate-400">
        Mục gắn <b>Toàn tài khoản</b> sẽ hiện ở mọi màn hình liên quan, vì một thay đổi cấp tài khoản ảnh hưởng tất cả.
        Mục gắn category / nước / camp chỉ hiện ở đúng chỗ đó. Mục ghi trước 9/2026 không có kênh — sửa (✎) để gắn kênh.
      </div>
    </div>
  );
}
