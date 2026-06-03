/**
 * GA4 -> History_Daily : daily per-keyword x surface INSTALL snapshot.
 * Writes rows with source = 'ga4_daily' (only the Daily columns filled), so the
 * Install trend + date-mode page filter keep growing every day.
 */

// ===================== CONFIG ==============================================
var GA4_PROPERTY_ID = '348654457';
var KEYWORD_DIMENSION = 'customEvent:term';          // GA4 "Search term"
var SURFACE_DIMENSION = 'customEvent:surface_detail'; // GA4 "Surface detail" (search / search ads)
var SURFACE_DEFAULT = 'search';
var SURFACE_MAP = {
  'search': 'search',
  'organic': 'search',
  'search ads': 'search_ad',
  'search ad': 'search_ad',
  'apple search ads': 'search_ad',
  'paid': 'search_ad',
};
var INSTALL_EVENT = 'shopify_app_install'; // the install event in this GA4
var USERS_METRIC = '';                     // '' to skip a users metric

var TZ_GA4 = 'Asia/Ho_Chi_Minh';
var TARGET_TAB_GA4 = 'History_Daily';
var GA4_SOURCE_TAG = 'ga4_daily';
var HD_COLS = [
  'date', 'searchTerm', 'surface', 'usersL7D', 'getAppL7D', 'crL7D', 'posL7D',
  'usersDaily', 'getAppDaily', 'crDaily', 'posDaily', 'source',
];
// ===========================================================================

function yesterdayInTz_() {
  return Utilities.formatDate(new Date(Date.now() - 86400000), TZ_GA4, 'yyyy-MM-dd');
}

function daysAgoInTz_(n) {
  return Utilities.formatDate(new Date(Date.now() - n * 86400000), TZ_GA4, 'yyyy-MM-dd');
}

function mapSurface_(raw) {
  var key = String(raw || '').trim().toLowerCase();
  return SURFACE_MAP[key] || SURFACE_DEFAULT;
}

// DIAGNOSTIC: see how install splits by surface_detail + term over the last 28 days.
function probeInstall3() {
  var PID = 'properties/' + GA4_PROPERTY_ID;
  var start = daysAgoInTz_(28);
  var end = yesterdayInTz_();
  var events = ['shopify_app_install', 'click_get_app'];
  for (var j = 0; j < events.length; j++) {
    try {
      var r = AnalyticsData.Properties.runReport({
        dateRanges: [{ startDate: start, endDate: end }],
        dimensions: [
          { name: 'customEvent:surface_detail' },
          { name: 'customEvent:surface_type' },
          { name: 'customEvent:term' },
        ],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: events[j] } } },
        limit: 50,
      }, PID);
      Logger.log('=== ' + events[j] + ' :: surface_detail | surface_type | term | count ===');
      var rows = r.rows || [];
      for (var i = 0; i < rows.length; i++) {
        var d = rows[i].dimensionValues;
        Logger.log('  ' + d[0].value + ' | ' + d[1].value + ' | ' + d[2].value + ' = ' + rows[i].metricValues[0].value);
      }
    } catch (e) {
      Logger.log('ERROR ' + events[j] + ': ' + e.message);
    }
  }
}

// DIAGNOSTIC: which events carry surface_detail, and what values (last 28 days).
function probeSurface() {
  var PID = 'properties/' + GA4_PROPERTY_ID;
  var start = daysAgoInTz_(28);
  var end = yesterdayInTz_();
  var r = AnalyticsData.Properties.runReport({
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'eventName' }, { name: 'customEvent:surface_detail' }],
    metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 80,
  }, PID);
  Logger.log('=== eventName | surface_detail | count (28d) ===');
  var rows = r.rows || [];
  for (var i = 0; i < rows.length; i++) {
    var d = rows[i].dimensionValues;
    Logger.log('  ' + d[0].value + ' | ' + d[1].value + ' = ' + rows[i].metricValues[0].value);
  }
}

// Query install grouped by keyword (term) + surface, for one day.
function fetchGa4InstallsForDate_(dateStr) {
  var dimensions = [{ name: KEYWORD_DIMENSION }, { name: SURFACE_DIMENSION }];
  var metrics = [{ name: 'eventCount' }];
  if (USERS_METRIC) metrics.push({ name: USERS_METRIC });
  var request = {
    dateRanges: [{ startDate: dateStr, endDate: dateStr }],
    dimensions: dimensions,
    metrics: metrics,
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: INSTALL_EVENT } } },
    limit: 100000,
  };
  var resp = AnalyticsData.Properties.runReport(request, 'properties/' + GA4_PROPERTY_ID);
  var out = [];
  var rows = resp.rows || [];
  for (var i = 0; i < rows.length; i++) {
    var dim = rows[i].dimensionValues || [];
    var met = rows[i].metricValues || [];
    var term = String(dim[0] && dim[0].value || '').trim();
    if (!term || term === '(not set)' || term === '(not provided)') continue;
    var install = Number(met[0] && met[0].value) || 0;
    if (install === 0) continue;
    out.push({ searchTerm: term, surface: mapSurface_(dim[1] && dim[1].value), install: install });
  }
  return out;
}

// Append one day's GA4 installs into History_Daily (idempotent per day+source).
function runGa4InstallSnapshot() {
  var dateStr = yesterdayInTz_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dest = ss.getSheetByName(TARGET_TAB_GA4);
  if (!dest) {
    dest = ss.insertSheet(TARGET_TAB_GA4);
    dest.getRange(1, 1, 1, HD_COLS.length).setValues([HD_COLS]);
    dest.setFrozenRows(1);
  }
  var lastRow = dest.getLastRow();
  if (lastRow > 1) {
    var grid = dest.getRange(2, 1, lastRow - 1, HD_COLS.length).getValues();
    for (var g = 0; g < grid.length; g++) {
      if (String(grid[g][0]) === dateStr && String(grid[g][11]) === GA4_SOURCE_TAG) {
        Logger.log('GA4 install already written for ' + dateStr);
        return;
      }
    }
  }
  var data = fetchGa4InstallsForDate_(dateStr);
  if (data.length === 0) {
    Logger.log('GA4 returned no install rows for ' + dateStr);
    return;
  }
  var merged = {};
  for (var k = 0; k < data.length; k++) {
    var rr = data[k];
    var key = rr.searchTerm.toLowerCase() + '|' + rr.surface;
    if (!merged[key]) merged[key] = { searchTerm: rr.searchTerm, surface: rr.surface, install: 0 };
    merged[key].install += rr.install;
  }
  var out = [];
  Object.keys(merged).forEach(function (key) {
    var m = merged[key];
    out.push([dateStr, m.searchTerm, m.surface, '', '', '', '', '', m.install, '', '', GA4_SOURCE_TAG]);
  });
  dest.getRange(dest.getLastRow() + 1, 1, out.length, HD_COLS.length).setValues(out);
  Logger.log('Wrote ' + out.length + ' GA4 install rows for ' + dateStr);
}

function installGa4Trigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runGa4InstallSnapshot') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('runGa4InstallSnapshot').timeBased().atHour(8).everyDays(1).inTimezone(TZ_GA4).create();
  Logger.log('GA4 install trigger installed (08:00 ' + TZ_GA4 + ')');
}
