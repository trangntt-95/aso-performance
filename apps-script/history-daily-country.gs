/**
 * History_Daily_Country — TRUE daily metrics, split by country, Tier 1 only.
 *
 * WHY A SEPARATE TAB, AND WHY ONLY 10 COUNTRIES
 *
 * The dashboard's date filter sums History_Daily, which is keyed
 * (date | searchTerm | surface) — no country. So picking a date range and a
 * country silently ignored the country. Adding a country column to
 * History_Daily was rejected: it breaks that tab's key (every existing reader
 * dedupes on it) and, more importantly, GA4 hides low-volume rows on granular
 * queries. Measured 2026-08: a single-day query already returns per-day numbers
 * for only ~26 of ~158 keywords (83% withheld), and even at a 30-day window
 * adding the country dimension loses 9% of users (All_L30 835 vs Country_L30
 * 758). Splitting a single day across 129 countries would produce a column that
 * is mostly empty AND silently under-counts.
 *
 * Restricting to the ~10 Tier 1 markets keeps each cell's sample large enough
 * for GA4 to actually return it, caps growth (~1 extra row per keyword-day),
 * and covers the markets bid decisions are actually made for.
 *
 * SCHEMA
 *   date | country | searchTerm | surface | usersDaily | installDaily
 *        | crDaily | posDaily | source
 *
 * All four metric columns are TRUE per-day (date range = one day), never
 * rolling — so they can be summed across a date range. There is deliberately no
 * L7D block here: rolling values can't be summed, and History_Daily already
 * carries them for the account total.
 *
 * SETUP
 *   1. Paste into the same Apps Script project as Code.gs (needs
 *      fetchGA4DataByCountry_) and history_daily_v2.gs (needs TZ).
 *   2. Run installCountryDailyTrigger()  → daily 07:15 VN, writes yesterday.
 *   3. Run backfillCountryDaily(90)      → fill the last 90 days. Re-run until
 *      the log says ALL DONE (Apps Script caps a run at 6 minutes).
 *
 * Idempotent: re-running a date UPDATES that date's rows in place rather than
 * appending. Keys are normalised through _cdDateKey_ so a Date cell and a
 * 'YYYY-MM-DD' string match — the exact bug that inflated History_Daily to 50k
 * rows before.
 */

const CD_TAB = 'History_Daily_Country';
const CD_TZ = 'Asia/Ho_Chi_Minh';

/**
 * Markets worth per-day country detail. Spelling must match the Country_L*
 * tabs exactly, since the dashboard joins on the country name.
 * Source: Trang's Tier 1 Premium + Tier 1 Strong + Tier 1.5, 2026-08.
 */
const CD_COUNTRIES = [
  'Hong Kong',
  'Japan',
  'United States',
  'Australia',
  'Canada',
  'Switzerland',
  'Austria',
  'United Kingdom',
  'Germany',
  'Italy',
  'Greece',
];

const CD_HEADERS = [
  'date', 'country', 'searchTerm', 'surface',
  'usersDaily', 'installDaily', 'crDaily', 'posDaily',
  'source',
];

function _cdSheet_(ss) {
  let sh = ss.getSheetByName(CD_TAB);
  if (!sh) {
    sh = ss.insertSheet(CD_TAB);
    sh.getRange(1, 1, 1, CD_HEADERS.length).setValues([CD_HEADERS])
      .setFontWeight('bold').setBackground('#2E75B6').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 100);
    sh.setColumnWidth(2, 140);
    sh.setColumnWidth(3, 240);
    Logger.log('Created tab ' + CD_TAB);
    return sh;
  }
  const hdr = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), CD_HEADERS.length)).getValues()[0];
  let sync = false;
  for (let i = 0; i < CD_HEADERS.length; i++) {
    if (String(hdr[i] || '').trim() !== CD_HEADERS[i]) { sync = true; break; }
  }
  if (sync) {
    sh.getRange(1, 1, 1, CD_HEADERS.length).setValues([CD_HEADERS]);
    Logger.log('Header synced');
  }
  return sh;
}

/** Normalise a date cell to 'yyyy-MM-dd' whether Sheets hands back a Date,
 *  a serial number or a string. Keys MUST go through this on both sides. */
function _cdDateKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CD_TZ, 'yyyy-MM-dd');
  if (typeof v === 'number' && isFinite(v)) {
    return Utilities.formatDate(new Date(Math.round((v - 25569) * 86400 * 1000)), 'UTC', 'yyyy-MM-dd');
  }
  return String(v || '').trim().slice(0, 10);
}

function _cdKey_(dateVal, country, term, surface) {
  return _cdDateKey_(dateVal) + '|' + String(country || '').trim() + '|' +
    String(term || '').trim() + '|' + String(surface || '').trim().toLowerCase();
}

/**
 * Fetch one day of country-split GA4 data and write the Tier 1 rows.
 * Returns how many rows were touched.
 */
function _cdWriteDay_(sh, dateStr, source) {
  if (typeof fetchGA4DataByCountry_ !== 'function') {
    throw new Error('fetchGA4DataByCountry_ not found — paste this into the SAME project as Code.gs');
  }
  const wanted = {};
  CD_COUNTRIES.forEach(function (c) { wanted[c] = true; });

  const all = fetchGA4DataByCountry_(dateStr, dateStr) || [];
  const rows = all.filter(function (r) {
    return r.country && wanted[r.country] && ((r.users || 0) > 0 || (r.getApp || 0) > 0);
  });
  if (rows.length === 0) {
    Logger.log('  ' + dateStr + ' — 0 Tier 1 rows (GA4 trả ' + all.length + ' dòng tổng)');
    return 0;
  }

  // Read existing keys + the mutable block once. Per-row getRange/setValue is
  // what made the old backfill blow the 6-minute limit.
  const lastRow = sh.getLastRow();
  const n = Math.max(0, lastRow - 1);
  const keyCols = n > 0 ? sh.getRange(2, 1, n, 4).getValues() : [];
  const block = n > 0 ? sh.getRange(2, 5, n, 5).getValues() : []; // cols 5..9

  const index = {};
  for (let i = 0; i < keyCols.length; i++) {
    index[_cdKey_(keyCols[i][0], keyCols[i][1], keyCols[i][2], keyCols[i][3])] = i;
  }

  let minIdx = Infinity, maxIdx = -1, updated = 0;
  const inserts = [];
  rows.forEach(function (r) {
    const cr = (typeof r.cr === 'number' && isFinite(r.cr)) ? r.cr : '';
    const pos = (typeof r.position === 'number' && isFinite(r.position)) ? r.position : '';
    const k = _cdKey_(dateStr, r.country, r.search_term, r.surface_type);
    const idx = index[k];
    if (idx !== undefined) {
      block[idx][0] = r.users;
      block[idx][1] = r.getApp;
      block[idx][2] = cr;
      block[idx][3] = pos;
      block[idx][4] = source;
      if (idx < minIdx) minIdx = idx;
      if (idx > maxIdx) maxIdx = idx;
      updated++;
    } else {
      inserts.push([dateStr, r.country, r.search_term, r.surface_type,
        r.users, r.getApp, cr, pos, source]);
    }
  });

  if (maxIdx >= 0) {
    const slice = block.slice(minIdx, maxIdx + 1);
    sh.getRange(2 + minIdx, 5, slice.length, 5).setValues(slice);
  }
  if (inserts.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, inserts.length, CD_HEADERS.length).setValues(inserts);
  }
  Logger.log('  ' + dateStr + ' — updated ' + updated + ', inserted ' + inserts.length);
  return updated + inserts.length;
}

/** Daily job: write yesterday (today isn't closed yet, same as History_Daily). */
function runCountryDailyYesterday() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = _cdSheet_(ss);
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const dateStr = Utilities.formatDate(d, CD_TZ, 'yyyy-MM-dd');
  _cdWriteDay_(sh, dateStr, 'country_daily');
}

/**
 * Backfill the last `days` days (default 90), newest first so a timeout still
 * leaves you with the most useful data. Skips days already written.
 * Re-run until the log says ALL DONE.
 */
function backfillCountryDaily(days) {
  const total = days || 90;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = _cdSheet_(ss);
  const start = Date.now();
  const BUDGET_MS = 5 * 60 * 1000;

  const done = {};
  const lastRow = sh.getLastRow();
  if (lastRow > 1) {
    const dates = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < dates.length; i++) done[_cdDateKey_(dates[i][0])] = true;
  }
  Logger.log('backfillCountryDaily — đã có ' + Object.keys(done).length + ' ngày, cần ' + total);

  let processed = 0, skipped = 0, empty = 0;
  for (let i = 1; i <= total; i++) {
    if (Date.now() - start > BUDGET_MS) {
      Logger.log('⏱ Hết time budget ở ngày thứ ' + i + '/' + total + ' — chạy lại để tiếp tục.');
      Logger.log('Còn ~' + (total - Object.keys(done).length - processed) + ' ngày.');
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = Utilities.formatDate(d, CD_TZ, 'yyyy-MM-dd');
    if (done[dateStr]) { skipped++; continue; }
    try {
      const n = _cdWriteDay_(sh, dateStr, 'country_backfill');
      processed++;
      if (n === 0) empty++;
      Utilities.sleep(500); // gentle on the GA4 quota
    } catch (e) {
      Logger.log('  ✗ ' + dateStr + ' FAILED: ' + e);
    }
  }
  Logger.log('───────────────');
  Logger.log('🎉 ALL DONE — processed ' + processed + ', skipped ' + skipped + ', empty ' + empty);
  Logger.log('Chạy checkCountryDailyCoverage() để xem độ phủ.');
}

/** Daily trigger at 07:15 VN — after runTrueDailyToday (07:00) so the two
 *  GA4-heavy jobs don't collide. */
function installCountryDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runCountryDailyYesterday') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runCountryDailyYesterday')
    .timeBased().atHour(7).nearMinute(15).everyDays(1).inTimezone(CD_TZ).create();
  Logger.log('✓ Trigger runCountryDailyYesterday — hằng ngày ~07:15 ' + CD_TZ);
}

/** How much of the window actually has data, and which markets are thin. */
function checkCountryDailyCoverage() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CD_TAB);
  if (!sh) { Logger.log('❌ Chưa có tab ' + CD_TAB); return; }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) { Logger.log('Tab rỗng'); return; }
  const data = sh.getRange(2, 1, lastRow - 1, CD_HEADERS.length).getValues();

  const days = {}, byCountry = {}, dayCountry = {};
  let users = 0;
  data.forEach(function (r) {
    const d = _cdDateKey_(r[0]); if (!d) return;
    days[d] = true;
    const c = String(r[1] || '');
    byCountry[c] = (byCountry[c] || 0) + 1;
    dayCountry[c] = dayCountry[c] || {};
    dayCountry[c][d] = true;
    users += Number(r[4]) || 0;
  });
  const dayList = Object.keys(days).sort();
  Logger.log('Tab ' + CD_TAB + ': ' + (lastRow - 1) + ' dòng · ' + dayList.length + ' ngày · ' +
    Math.round(users) + ' users');
  Logger.log('  khoảng: ' + dayList[0] + ' → ' + dayList[dayList.length - 1]);
  Logger.log('  Độ phủ từng nước (số ngày có ít nhất 1 dòng):');
  CD_COUNTRIES.forEach(function (c) {
    const nd = dayCountry[c] ? Object.keys(dayCountry[c]).length : 0;
    const pct = dayList.length ? (100 * nd / dayList.length).toFixed(0) : 0;
    const tag = nd === 0 ? '   ⚠️ KHÔNG có data — GA4 giấu hết, cân nhắc bỏ khỏi CD_COUNTRIES'
      : (pct < 50 ? '   ⚠️ thưa' : '');
    Logger.log('    ' + c + ': ' + nd + '/' + dayList.length + ' ngày (' + pct + '%) · ' +
      (byCountry[c] || 0) + ' dòng' + tag);
  });
}
