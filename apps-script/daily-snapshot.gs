/**
 * Daily snapshot of L7 metrics per keyword x surface.
 * Reads `All_L7` once per day, appends to `History_Daily`.
 *
 * Schema of History_Daily:
 *   date | searchTerm | surface | usersL7D | getAppL7D | crL7D | posL7D
 *
 * Setup (one-time):
 *   1. Paste this file into Sheet -> Extensions -> Apps Script
 *   2. Run `installDailySnapshotTrigger()` once to set up the 7am trigger
 *   3. Optional: run `backfillFromHistory()` to copy past usersL7D + posL7D
 *      from the existing History tab into History_Daily. getAppL7D + crL7D
 *      stay empty for those past dates (install data isn't preserved
 *      historically anywhere in the sheet).
 *
 * The script is idempotent - running runDailySnapshot twice on the same day
 * does nothing the second time.
 */

const TZ = 'Asia/Ho_Chi_Minh';
const TARGET_TAB = 'History_Daily';
const SOURCE_TAB = 'All_L7';
const LEGACY_HISTORY_TAB = 'History';
const HEADERS = ['date', 'searchTerm', 'surface', 'usersL7D', 'getAppL7D', 'crL7D', 'posL7D'];

function getOrCreateTab_(ss) {
  let dest = ss.getSheetByName(TARGET_TAB);
  if (!dest) {
    dest = ss.insertSheet(TARGET_TAB);
    dest.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    dest.setFrozenRows(1);
  }
  return dest;
}

function todayInTz_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function runDailySnapshot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const today = todayInTz_();

  const src = ss.getSheetByName(SOURCE_TAB);
  if (!src) throw new Error('Missing tab: ' + SOURCE_TAB);
  const rows = src.getDataRange().getValues();

  const dest = getOrCreateTab_(ss);

  // Idempotent: skip if today already snapshotted.
  const lastRow = dest.getLastRow();
  if (lastRow > 1) {
    const dates = dest.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < dates.length; i++) {
      if (String(dates[i][0]) === today) {
        Logger.log('Today already snapshotted: ' + today);
        return;
      }
    }
  }

  // All_L7 layout (per the dashboard parser):
  //   row 1 = title, row 2 = headers, row 3 = TOTAL, row 4+ = data
  //   cols: Category, Search Term, Surface Type, Users L, Users P,
  //         Get App L, Get App P, CR L, CR P, Pos L, Pos P, ...
  const out = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    const term = String(r[1] || '').trim();
    if (!term || term.toUpperCase() === 'TOTAL') continue;
    const surface = String(r[2] || '').toLowerCase();
    const usersL = Number(r[3]) || 0;
    const getAppL = Number(r[5]) || 0;
    const crLRaw = r[7];
    const posLRaw = r[9];
    if (usersL === 0 && getAppL === 0) continue;
    const crL = typeof crLRaw === 'number' && isFinite(crLRaw) ? crLRaw : '';
    const posL = typeof posLRaw === 'number' && isFinite(posLRaw) ? posLRaw : '';
    out.push([today, term, surface, usersL, getAppL, crL, posL]);
  }

  if (out.length === 0) {
    Logger.log('No rows to write for ' + today);
    return;
  }

  dest.getRange(dest.getLastRow() + 1, 1, out.length, HEADERS.length).setValues(out);
  Logger.log('Wrote ' + out.length + ' rows for ' + today);
}

function installDailySnapshotTrigger() {
  // Remove any existing handlers to avoid duplicate triggers.
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runDailySnapshot') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('runDailySnapshot')
    .timeBased()
    .atHour(7)
    .everyDays(1)
    .inTimezone(TZ)
    .create();
  Logger.log('Daily snapshot trigger installed (07:00 ' + TZ + ')');
}

function backfillFromHistory() {
  // One-time: copy past usersL7D + posL7D from the legacy `History` tab into
  // History_Daily so the dashboard's daily trend has historical Users + Pos
  // on day 1. GetApp and CR stay empty for past dates (no historical install
  // data is stored anywhere in the sheet).
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(LEGACY_HISTORY_TAB);
  if (!src) throw new Error('Missing tab: ' + LEGACY_HISTORY_TAB);
  const dest = getOrCreateTab_(ss);

  // Existing (date, kw, surface) keys to avoid double-writing.
  const existing = {};
  const lastRow = dest.getLastRow();
  if (lastRow > 1) {
    const data = dest.getRange(2, 1, lastRow - 1, 3).getValues();
    for (let i = 0; i < data.length; i++) {
      const key = String(data[i][0]) + '|' + String(data[i][1]) + '|' + String(data[i][2]);
      existing[key] = true;
    }
  }

  // Legacy History columns (per parseHistory):
  //   snapshotDate | searchTerm | surface | usersL7D | posL7D | alert
  const srcRows = src.getDataRange().getValues();
  const out = [];
  for (let i = 0; i < srcRows.length; i++) {
    const row = srcRows[i];
    const rawDate = row[0];
    const term = String(row[1] || '').trim();
    if (!rawDate || !term) continue;

    // Skip header-ish rows (non-numeric date that isn't an ISO string)
    let dateStr;
    if (rawDate instanceof Date) {
      dateStr = Utilities.formatDate(rawDate, TZ, 'yyyy-MM-dd');
    } else if (typeof rawDate === 'number' && isFinite(rawDate)) {
      const dt = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
      dateStr = Utilities.formatDate(dt, TZ, 'yyyy-MM-dd');
    } else {
      const s = String(rawDate);
      if (!/^\d{4}-\d{2}-\d{2}/.test(s)) continue;
      dateStr = s.slice(0, 10);
    }

    const surface = String(row[2] || '').toLowerCase();
    const usersL7D = Number(row[3]) || 0;
    if (usersL7D === 0) continue;
    const posRaw = row[4];
    const posL7D = typeof posRaw === 'number' && isFinite(posRaw) ? posRaw : '';

    const key = dateStr + '|' + term + '|' + surface;
    if (existing[key]) continue;

    // getAppL7D + crL7D left empty for past dates.
    out.push([dateStr, term, surface, usersL7D, '', '', posL7D]);
  }

  if (out.length === 0) {
    Logger.log('Nothing to backfill');
    return;
  }
  dest.getRange(dest.getLastRow() + 1, 1, out.length, HEADERS.length).setValues(out);
  Logger.log('Backfilled ' + out.length + ' rows from History');
}

// ============================================================================
// PER-DAY snapshot (added 2026-06-03)
// ----------------------------------------------------------------------------
// Writes the TRUE per-day columns (usersDaily/getAppDaily/crDaily/posDaily +
// source) so the dashboard's date filter + daily trend keep advancing past the
// 26/05 backfill end. The backfill only went to 26/05 and the L7D snapshot is
// rolling-7d (not per-day) - this fills the per-day gap going forward.
//
// REQUIRES fetchGA4Data_(startDate, endDate) from the main tracker Code.gs in
// the SAME Apps Script project. Queries GA4 for a single day = real per-day
// users + attributed install (shopify_app_install w/ surface) per kw x surface.
//
// History_Daily 12-col layout (live):
//   date | searchTerm | surface | usersL7D | getAppL7D | crL7D | posL7D
//        | usersDaily | getAppDaily | crDaily | posDaily | source
//
// Setup: run `installPerDayTrigger()` once. Optionally `backfillPerDay('2026-05-27','<yesterday>')`
// to fill the current gap. NOTE: GA4 may threshold per-day totalUsers when data
// is sparse, so very-low-traffic days can under-report users slightly.
// ============================================================================

var PERDAY_SOURCE = 'daily_perday';
var PERDAY_COLS = 12;
var PERDAY_TAB = 'History_Daily';
var PERDAY_TZ = 'Asia/Ho_Chi_Minh';

function writePerDayFor_(ss, dateStr) {
  if (typeof fetchGA4Data_ !== 'function') {
    throw new Error('fetchGA4Data_ not found - run inside the project that has Code.gs (main tracker).');
  }
  const dest = ss.getSheetByName(PERDAY_TAB);
  if (!dest) throw new Error('Missing tab: ' + PERDAY_TAB);

  // Idempotent on (date + source).
  const lastRow = dest.getLastRow();
  if (lastRow > 1) {
    const vals = dest.getRange(2, 1, lastRow - 1, PERDAY_COLS).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) === dateStr && String(vals[i][11]) === PERDAY_SOURCE) {
        Logger.log('Per-day already written: ' + dateStr);
        return 0;
      }
    }
  }

  const data = fetchGA4Data_(dateStr, dateStr); // single calendar day
  const out = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const surface = String(r.surface_type || '').toLowerCase();
    if (surface !== 'search' && surface !== 'search_ad') continue;
    const users = Number(r.users) || 0;
    const getApp = Number(r.getApp) || 0;
    if (users === 0 && getApp === 0) continue;
    const cr = users > 0 ? getApp / users : '';
    const pos = (r.position !== null && r.position !== undefined && isFinite(r.position)) ? r.position : '';
    // L7D cols empty (4-7), per-day cols filled (8-11), source (12).
    out.push([dateStr, r.search_term, surface, '', '', '', '', users, getApp, cr, pos, PERDAY_SOURCE]);
  }
  if (out.length === 0) { Logger.log('No per-day rows for ' + dateStr); return 0; }
  dest.getRange(dest.getLastRow() + 1, 1, out.length, PERDAY_COLS).setValues(out);
  Logger.log('Per-day: wrote ' + out.length + ' rows for ' + dateStr);
  return out.length;
}

// Daily trigger target - writes YESTERDAY per-day rows.
function runDailyPerDaySnapshot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  writePerDayFor_(ss, Utilities.formatDate(y, PERDAY_TZ, 'yyyy-MM-dd'));
}

// One-time gap fill. Eg: backfillPerDay('2026-05-27', '2026-06-02')
function backfillPerDay(startStr, endStr) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const start = new Date(startStr + 'T00:00:00Z');
  const end = new Date(endStr + 'T00:00:00Z');
  let total = 0;
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const ds = Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
    try { total += writePerDayFor_(ss, ds); } catch (e) { Logger.log('skip ' + ds + ': ' + e); }
  }
  Logger.log('Backfill per-day done: ' + total + ' rows');
}

function installPerDayTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runDailyPerDaySnapshot') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('runDailyPerDaySnapshot')
    .timeBased()
    .atHour(8) // after the 7am L7D snapshot
    .everyDays(1)
    .inTimezone(PERDAY_TZ)
    .create();
  Logger.log('Per-day snapshot trigger installed (08:00 ' + PERDAY_TZ + ')');
}
