// A tiny search syntax for the keyword boxes: several conditions at once, typed
// into the box that was already there.
//
// The alternative was a row of condition builders — a dropdown for
// contains/doesn't-contain, a text field, an "add condition" button. That is
// three clicks per condition and a lot of chrome sitting above every table for a
// feature used occasionally. The convention below is the one Gmail and GitHub
// already use, so it costs no clicks and nothing new on screen; what it does
// need is for the reader to SEE how their text was understood, which is why
// `describe` exists and the caller shows the parsed conditions back.
//
//   true profit        both words must appear      (AND, not OR)
//   -test              must NOT appear
//   !test              same as -test
//   "true profit"      the phrase, spaces included
//   -"low bid"         phrase must not appear
//
// AND is the default for a reason: with OR, adding a word widens the result,
// which is the opposite of what typing more into a search box is meant to do.

export interface KeywordQuery {
  /** Terms that must all appear. */
  include: string[];
  /** Terms that must not appear. */
  exclude: string[];
  /** True when nothing usable was typed — the caller should not filter at all. */
  empty: boolean;
}

/**
 * Split on whitespace, but keep quoted runs together.
 *
 * Written as a scanner rather than a regex because the leading `-` has to stay
 * attached to a quoted phrase (`-"low bid"` is one token), and expressing that
 * as one regex is where this kind of parser usually starts being wrong.
 */
function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export function parseKeywordQuery(input: string): KeywordQuery {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const raw of tokenize(input ?? '')) {
    const neg = raw.startsWith('-') || raw.startsWith('!');
    const term = (neg ? raw.slice(1) : raw).trim().toLowerCase();
    // A bare '-' is someone mid-typing, not a condition.
    if (!term) continue;
    (neg ? exclude : include).push(term);
  }
  return { include, exclude, empty: include.length === 0 && exclude.length === 0 };
}

/** Does `text` satisfy every condition? */
export function matchKeywordQuery(text: string, q: KeywordQuery): boolean {
  if (q.empty) return true;
  const t = (text ?? '').toLowerCase();
  for (const term of q.exclude) if (t.includes(term)) return false;
  for (const term of q.include) if (!t.includes(term)) return false;
  return true;
}

/** The conditions in words, for showing the reader how their text was read. */
export function describeKeywordQuery(q: KeywordQuery): { label: string; negated: boolean }[] {
  return [
    ...q.include.map((t) => ({ label: t, negated: false })),
    ...q.exclude.map((t) => ({ label: t, negated: true })),
  ];
}
