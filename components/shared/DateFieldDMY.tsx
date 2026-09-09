'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

// A date field that shows and accepts dd/mm/yyyy.
//
// `<input type="date">` cannot do this: browsers render it in the OS locale and
// there is no attribute, CSS or property that overrides them. On an en-US
// machine it shows mm/dd/yyyy, which for the first twelve days of a month is not
// merely unfamiliar but genuinely ambiguous — 03/09 could be March or September
// and nothing on screen resolves it.
//
// So the visible field is a text input, and the native picker stays reachable
// through the calendar button, which calls showPicker() on a hidden date input.
// That keeps both properties: the format is ours, the calendar is still one
// click away.
//
// The value in and out is always ISO 'YYYY-MM-DD'. Only the display is dd/mm —
// the rest of the app compares and sorts these strings, and a display format
// that leaked into state would break both.

const isoToDmy = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/**
 * 'dd/mm/yyyy' → ISO, or '' when incomplete or not a real date.
 *
 * The calendar check matters: 31/02/2026 parses fine as numbers and would
 * silently become 03/03/2026 through Date's rollover, so the parsed date is read
 * back and rejected unless it round-trips.
 */
function dmyToIso(text: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((text ?? '').trim());
  if (!m) return '';
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Insert the slashes as the user types, without fighting a deletion. */
function autoSlash(raw: string, previous: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  // Deleting should not immediately re-add the separator it just removed.
  if (raw.length < previous.length && /[/]$/.test(previous.slice(0, raw.length + 1))) {
    return raw;
  }
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function DateFieldDMY({
  value,
  min,
  max,
  onChange,
  title,
  className,
}: {
  /** ISO 'YYYY-MM-DD', or '' for empty. */
  value: string;
  min?: string;
  max?: string;
  /** Called with ISO, or '' when the field is cleared. Never with a partial. */
  onChange: (iso: string) => void;
  title?: string;
  className?: string;
}) {
  const [text, setText] = useState(() => isoToDmy(value));
  const picker = useRef<HTMLInputElement>(null);

  // Follow the value when it changes from outside (a preset button, a reset),
  // but not while the field is mid-edit — that would fight the typing.
  useEffect(() => {
    setText((cur) => (dmyToIso(cur) === value ? cur : isoToDmy(value)));
  }, [value]);

  const commit = (next: string) => {
    setText(next);
    const iso = dmyToIso(next);
    if (iso) onChange(iso);
    else if (next.trim() === '') onChange('');
    // A partial like '09/' is left alone: reporting it as a change would clear
    // the filter on every keystroke.
  };

  const complete = dmyToIso(text) !== '';
  const outOfRange =
    complete && ((min && dmyToIso(text) < min) || (max && dmyToIso(text) > max));

  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        placeholder="dd/mm/yyyy"
        onChange={(e) => commit(autoSlash(e.target.value, text))}
        onBlur={() => {
          // Snap back to the committed value rather than leaving a half-typed
          // date on screen looking like a filter that is applied.
          if (!complete) setText(isoToDmy(value));
        }}
        className={cn(
          'w-[86px] rounded border py-0.5 pl-1.5 pr-5 text-[11px] tabular-nums',
          outOfRange
            ? 'border-rose-300 bg-rose-50 text-rose-700'
            : 'border-slate-200 text-slate-700',
        )}
        title={
          outOfRange
            ? `Ngoài khoảng có data (${isoToDmy(min ?? '')} – ${isoToDmy(max ?? '')})`
            : title
        }
      />
      <button
        type="button"
        onClick={() => picker.current?.showPicker?.()}
        className="absolute right-1 text-slate-400 hover:text-slate-700"
        title="Mở lịch chọn ngày"
        tabIndex={-1}
      >
        <CalendarDays className="h-3 w-3" />
      </button>
      {/* The native input exists only to provide the calendar. It is not shown,
          so its OS-locale format never reaches the screen. */}
      <input
        ref={picker}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          setText(isoToDmy(e.target.value));
          onChange(e.target.value);
        }}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />
    </span>
  );
}
