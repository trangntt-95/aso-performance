'use client';

import { Fragment, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';

// Ghi chú có định dạng nhẹ, lưu dạng chữ thường trong App_Notes nên mọi tab đọc
// được, export sheet vẫn đọc được (Trang 30/09/2026: "cho t viết chữ cơ bản:
// thay màu, đậm nhạt"). Cú pháp:
//   **đậm**   _nghiêng_   ~~gạch~~   ==nền vàng==   {red|chữ đỏ}
// Màu: red · green · blue · amber · gray · violet. Không lồng nhau.

export const RICH_COLORS = ['red', 'green', 'blue', 'amber', 'violet', 'gray'] as const;
export type RichColor = (typeof RICH_COLORS)[number];

const COLOR_CLS: Record<RichColor, string> = {
  red: 'text-rose-600',
  green: 'text-emerald-700',
  blue: 'text-sky-700',
  amber: 'text-amber-700',
  violet: 'text-violet-700',
  gray: 'text-slate-400',
};
export const COLOR_DOT: Record<RichColor, string> = {
  red: 'bg-rose-500',
  green: 'bg-emerald-500',
  blue: 'bg-sky-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  gray: 'bg-slate-400',
};

// Một token: **x** | _x_ | ~~x~~ | ==x== | {color|x}
const TOKEN = /\*\*([^*]+?)\*\*|_([^_\n]+?)_|~~([^~]+?)~~|==([^=]+?)==|\{(red|green|blue|amber|violet|gray)\|([^}]+?)\}/g;

/** Chữ có định dạng → React nodes. Không có markup thì trả nguyên chuỗi. */
export function renderRichText(text: string): ReactNode {
  if (!text || !/[*_~={]/.test(text)) return text;
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `t${i++}`;
    if (m[1] !== undefined) out.push(<strong key={key} className="font-semibold">{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={key}>{m[2]}</em>);
    else if (m[3] !== undefined) out.push(<s key={key} className="text-slate-400">{m[3]}</s>);
    else if (m[4] !== undefined) out.push(<mark key={key} className="rounded bg-yellow-100 px-0.5 text-inherit">{m[4]}</mark>);
    else if (m[5] !== undefined) out.push(<span key={key} className={cn('font-medium', COLOR_CLS[m[5] as RichColor])}>{m[6]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length === 1 ? out[0] : out.map((n, k) => <Fragment key={k}>{n}</Fragment>);
}

/** Bỏ markup — cho tooltip, nhãn biểu đồ, export. */
export function stripRichText(text: string): string {
  return (text ?? '').replace(TOKEN, (_m, b, i, s, h, _c, col) => b ?? i ?? s ?? h ?? col ?? '');
}

function wrapSelection(el: HTMLTextAreaElement | HTMLInputElement, open: string, close: string, value: string): { next: string; cursor: number } {
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const sel = value.slice(start, end) || 'chữ';
  const next = value.slice(0, start) + open + sel + close + value.slice(end);
  return { next, cursor: start + open.length + sel.length + close.length };
}

/**
 * Thanh nút định dạng cho một ô nhập: bọc đoạn đang bôi đen bằng markup.
 * Dùng chung cho Changelog (và ô note khác nếu cần).
 */
export function RichToolbar({
  inputRef,
  value,
  onChange,
  className,
}: {
  inputRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const apply = (open: string, close: string) => {
    const el = inputRef.current;
    if (!el) {
      onChange(value + open + 'chữ' + close);
      return;
    }
    const { next, cursor } = wrapSelection(el, open, close, value);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      try {
        el.setSelectionRange(cursor, cursor);
      } catch {
        /* input type không hỗ trợ */
      }
    });
  };
  const btn = 'rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] leading-none text-slate-700 hover:border-slate-400 hover:bg-slate-50';
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)} onMouseDown={(e) => e.preventDefault()}>
      <button type="button" className={cn(btn, 'font-bold')} title="Đậm: **chữ**" onClick={() => apply('**', '**')}>B</button>
      <button type="button" className={cn(btn, 'italic')} title="Nghiêng: _chữ_" onClick={() => apply('_', '_')}>I</button>
      <button type="button" className={cn(btn, 'line-through')} title="Gạch: ~~chữ~~" onClick={() => apply('~~', '~~')}>S</button>
      <button type="button" className={cn(btn, 'bg-yellow-100')} title="Nền vàng: ==chữ==" onClick={() => apply('==', '==')}>H</button>
      <span className="mx-0.5 h-3 w-px bg-slate-200" />
      {RICH_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={cn('h-4 w-4 rounded-full border border-white shadow-sm ring-1 ring-slate-200 hover:ring-slate-400', COLOR_DOT[c])}
          title={`Màu ${c}: {${c}|chữ}`}
          onClick={() => apply(`{${c}|`, '}')}
        />
      ))}
    </div>
  );
}
