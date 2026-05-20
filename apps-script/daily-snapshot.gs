/**
 * Daily snapshot of L7 metrics per keyword × surface.
 * Reads `All_L7` once per day, appends to `History_Daily`.
 *
 * Schema of History_Daily:
 *   date | searchTerm | surface | usersL7D | getAppL7D | crL7D | posL7D
 *
 * Setup (one-time):
 *   1. Paste this file into Sheet → Extensions → Apps Script
 *   2. Run `installDailySnapshotTrigger()` once to set up the 7am trigger
 *   3. Optional: run `backfillFromHistory()` to copy past usersL7D + posL7D
 *      from the existing History tab into History_Daily. getAppL7D + crL7D
 *      stay empty for those past dates (install data isn't preserved
 *      historically anywhere in the sheet).
 *
 * The script is idempotent — running runDailySnapshot twice on the same day
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
