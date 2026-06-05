// Smoke test against the running dev server: verifies the new payload fields
// and re-checks the paused-camp exclusion logic on live data.
// Run: node scripts/verify-paid-coverage.mjs [port]
const port = process.argv[2] || '3457';
const res = await fetch(`http://localhost:${port}/api/sheets`);
if (!res.ok) {
  console.error(`API ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const p = await res.json();

console.log('pausedKw rows   :', p.pausedKw?.length);
console.log('campLinks rows  :', p.campLinks?.length);
console.log('masterKwLookup  :', p.masterKwLookup?.length);
console.log('allL365 rows    :', p.allL365?.length);

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

// Replicate buildPaidStatusIndex's camp-level pause rule to sanity-check counts.
const pausedCamps = new Set(p.pausedKw.map((r) => r.camp).filter(Boolean));
console.log('\nPaused camps    :', [...pausedCamps].length);

const staleMasterRows = p.masterKwLookup.filter((r) => pausedCamps.has(r.camp));
console.log('Stale Master rows (camp paused, previously counted In Paid):', staleMasterRows.length);

// Keywords that flip from "In Paid" → "Paused/Not in Paid" because their ONLY camps are paused:
const activeByKw = new Map();
for (const r of p.masterKwLookup) {
  if (!r.camp || pausedCamps.has(r.camp)) continue;
  const k = norm(r.keyword);
  activeByKw.set(k, (activeByKw.get(k) || 0) + 1);
}
const manualKw = new Set(p.kwAddedManual.map((r) => norm(r.keyword)));
const flipped = new Set();
for (const r of [...staleMasterRows, ...p.pausedKw]) {
  const k = norm(r.keyword);
  if (!activeByKw.has(k) && !manualKw.has(k)) flipped.add(k);
}
console.log('Keywords flipped In Paid → ⏸ Paused (no active camp left):', flipped.size);
console.log('  sample:', [...flipped].slice(0, 15).join(' · '));

// L365-only keywords that now enter the universe:
const inWindows = new Set(
  [...p.allL7, ...p.allL30, ...p.allL90].map((r) => norm(r.searchTerm)),
);
const l365Only = p.allL365.filter((r) => !inWindows.has(norm(r.searchTerm)));
const l365Kw = new Set(l365Only.map((r) => norm(r.searchTerm)));
console.log('\nL365-only keywords (previously INVISIBLE in drilldown):', l365Kw.size);
const negKw = new Set(p.negativeKw.map(norm));
const l365OnlyNotPaid = [...l365Kw].filter(
  (k) => !activeByKw.has(k) && !manualKw.has(k) && !negKw.has(k),
);
console.log('  …of which NOT bid (the ones Trang was missing):', l365OnlyNotPaid.length);
console.log('  sample:', l365OnlyNotPaid.slice(0, 15).join(' · '));
