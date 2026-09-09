'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { MONTH_ABBR } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// A date field that shows '08 Sep 2026' and accepts either that or '8/9/2026'.
//
// `<input type="date">` cannot do this: browsers render it in the OS locale and
// there is no attribute, CSS or property that overrides them. On an en-US
// machine it shows mm/dd/yyyy, which for the first twelve days of a month is not
// merely unfamiliar but genuinely ambiguous — 03/09 could be March or September
// and nothing on screen resolves it.
//
// A spelled month also cannot be misread by someone used to the other order,
// which the numeric form never fully solves.
//
// So the visible field is a text input, and the native picker stays reachable
// through the calendar button, which calls showPicker() on a hidden date input.
// That keeps both properties: the format is ours, the calendar is still one
// click away.
//
// The value in and out is always ISO 'YYYY-MM-DD'. Only the display is formatted
// — the rest of the app compares and sorts these strings, and a display format
// that leaked into state would break both.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const isoToText = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return '';
  const mi = Number(m[2]) - 1;
  return mi >= 0 && mi < 12 ? `${m[3]} ${MONTH_ABBR[mi]} ${m[1]}` : '';
};

/**
 * What the reader typed → ISO, or '' when it isn't a complete valid date.
 *
 * Both shapes are accepted, because the field PRINTS '08 Sep 2026' but typing
 * digits is faster: '8/9/2026' and '08 Sep 2026' both work, and so does
 * '8-9-2026'. Rejecting the numeric form would make the field slower to use than
 * the native one it replaced.
 *
 * The calendar check matters: 31/02/2026 is valid as three numbers and Date would
 * silently roll it to 03/03/2026, so the parsed date is read back and rejected
 * unless it round-trips.
 */
function textToIso(text: string): string {
  const t = (text ?? '').trim();
  if (!t) return '';
  let d = 0;
  let mo = 0;
  let y = 0;

  const named = /^(\d{1,2})[\s./-]+([A-Za-z]{3,})[\s./-]+(\d{4})$/.exec(t);
  if (named) {
    const mi = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase());
    if (mi < 0) return '';
    d = Number(named[1]);
    mo = mi + 1;
    y = Number(named[3]);
  } else {
    const numeric = /^(\d{1,2})[\s./-]+(\d{1,2})[\s./-]+(\d{4})$/.exec(t);
    if (!numeric) return '';
    d = Number(numeric[1]);
    mo = Number(numeric[2]);
    y = Number(numeric[3]);
  }

  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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
  const [text, setText] = useState(() => isoToText(value));
  const picker = useRef<HTMLInputElement>(null);

  // Follow the value when it changes from outside (a preset button, a reset),
  // but not while the field is mid-edit — that would fight the typing.
  useEffect(() => {
    setText((cur) => (textToIso(cur) === value ? cur : isoToText(value)));
  }, [value]);

  const commit = (next: string) => {
    setText(next);
    const iso = textToIso(next);
    if (iso) onChange(iso);
    else if (next.trim() === '') onChange('');
    // A partial like '09/' is left alone: reporting it as a change would clear
    // the filter on every keystroke.
  };

  const complete = textToIso(text) !== '';
  const outOfRange =
    complete && ((min && textToIso(text) < min) || (max && textToIso(text) > max));

  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <input
        type="text"
        value={text}
        placeholder="08 Sep 2026"
        onChange={(e) => commit(e.target.value)}
        onBlur={() => {
          // Snap back to the committed value rather than leaving a half-typed
          // date on screen looking like a filter that is applied.
          if (!complete) setText(isoToText(value));
        }}
        className={cn(
          'w-[112px] rounded border py-0.5 pl-1.5 pr-5 text-[11px] tabular-nums',
          outOfRange
            ? 'border-rose-300 bg-rose-50 text-rose-700'
            : 'border-slate-200 text-slate-700',
        )}
        title={
          outOfRange
            ? `Ngoài khoảng có data (${isoToText(min ?? '')} – ${isoToText(max ?? '')})`
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
          setText(isoToText(e.target.value));
          onChange(e.target.value);
        }}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />
    </span>
  );
}
