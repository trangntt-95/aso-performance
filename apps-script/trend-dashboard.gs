/**
 * Trend Dashboard — Google Sheet "Trang - shopify ad daily", tab "By categories".
 *
 * Opens a dialog with line charts of the nine metric blocks in that tab, per
 * category, with per-group metric toggles. Read-only: nothing here writes to the
 * sheet.
 *
 * ── The one rule this file obeys ──────────────────────────────────────────
 * No measurement is hardcoded. There is no category name, no metric value, and
 * no timepoint count anywhere below except inside CONFIG, and CONFIG holds only
 * structural facts (which tab, which column, how a ratio is derived) — never a
 * number read off the sheet. Everything measurable is parsed at run time, so the
 * dialog follows the sheet rather than a snapshot of it.
 *
 * ── Layout it reads (verified against the live sheet and the Aug-2026 export) ─
 *   A1              'Date range' + start + end
 *   A7:J…           summary table per category. NOT the chart source; kept only
 *                   as a cross-check when debugging.
 *   K…T, stacked    nine metric blocks. Each is: metric name in column L with
 *                   column K blank beside it, then a t1…t8 header row starting at
 *                   column L, then one row per category keyed in column K, then
 *                   (for some metrics) a totals row with column K blank.
 *
 * Blocks are found by that shape, never by row number, so inserting rows or
 * moving a block does not break parsing.
 */

// ===========================================================================
// CONFIG — the whole configuration surface. Nothing structural lives elsewhere.
// ===========================================================================

var CONFIG = {
  /** Tab holding the metric blocks. */
  SHEET_NAME: 'By categories',

  /** Zero-based columns of the block layout. K = 10, L = 11, so the category key
   *  sits one column left of where the values start. */
  CATEGORY_COL: 10,
  FIRST_VALUE_COL: 11,

  /** How far right to scan for timepoints before giving up. The real block is 8
   *  wide today; the cap only stops a runaway scan across a 60-column sheet. */
  MAX_SCAN_COLS: 60,

  /** How far down to scan for a block's totals row past its last category.
   *  Installs / Impressions / Clicks put it immediately below; Spend leaves one
   *  blank row first. A handoff note claiming only three blocks carry totals is
   *  wrong — Spend's is simply further down, and reading zero rows ahead is what
   *  loses it. */
  TOTAL_ROW_LOOKAHEAD: 2,

  /** Axis labels. 'raw' shows t1…t8; 'month' converts them using MONTH_ANCHOR. */
  AXIS_LABEL_MODE: 'month',
  /** One known timepoint → its calendar month. Everything else is counted from
   *  it, so the sheet rolling forward needs no code change. Confirmed by Trang:
   *  the columns are consecutive months and t4 is April 2026. */
  MONTH_ANCHOR: { n: 4, year: 2026, month: 4 },

  /** Prepend an aggregate "all categories" entry, and select it on open. */
  INCLUDE_TOTAL: true,
  TOTAL_LABEL: 'TOTAL',

  /** Metrics whose category values may simply be summed. */
  ADDITIVE: ['Installs', 'Impressions', 'Clicks', 'Spend'],

  /**
   * Ratios. These must NEVER be summed and must not be averaged plainly either:
   * the correct aggregate is recomputed from the summed parts.
   *
   * `weight` is the fallback when a part is missing — the older data has no Spend
   * for t1..t3, so CPI cannot be derived there and a weighted mean is the only
   * honest answer. The fallback is load-bearing, not decoration.
   */
  DERIVED: {
    CPI: { num: 'Spend', den: 'Installs', weight: 'Installs' },
    CPC: { num: 'Spend', den: 'Clicks', weight: 'Clicks' },
    CR: { num: 'Installs', den: 'Clicks', weight: 'Clicks' },
    CTR: { num: 'Clicks', den: 'Impressions', weight: 'Impressions' },
  },

  /** Metrics with no summable parts at all — a weighted mean is all there is. */
  WEIGHTED: {
    Pos: { weight: 'Impressions' },
  },

  /**
   * Minimum share of a timepoint's total weight that must actually carry a value
   * before a weighted result is reported. Below it, return nothing.
   *
   * Not a nicety. 'Test, others' is ~48% of impressions and its Pos is missing at
   * two timepoints in the older data; averaging the remaining 52% produced 2.14
   * then 2.64, which reads as a dip and a spike and is really just half the data
   * missing. A hole is better than a confident wrong number.
   */
  COVERAGE_MIN: 0.8,

  /** Metric name fixes. The sheet writes two of its block labels its own way;
   *  every other label is used exactly as the sheet spells it. */
  RENAME: { INSTALLS: 'Installs', CLICK: 'Clicks' },
};

// ===========================================================================
// Pure helpers — no SpreadsheetApp, so they can be unit-tested off-platform.
// ===========================================================================

function tdText(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

/**
 * Cell → number, or null when there is nothing usable.
 *
 * Percent cells are the trap: the sheet shows 43% while the stored value is 0.43.
 * Everything downstream treats the decimal as the true value, so a literal '43%'
 * string is divided back down to keep the two paths identical.
 */
function tdNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v instanceof Date) return null;
  var s = String(v).trim();
  if (s === '') return null;
  // Spreadsheet error values ('#DIV/0!', '#VALUE!') are absences, not zeros.
  if (s.charAt(0) === '#') return null;
  var pct = s.charAt(s.length - 1) === '%';
  if (pct) s = s.slice(0, -1);
  s = s.replace(/[$,\s]/g, '');
  if (s === '') return null;
  var n = Number(s);
  if (!isFinite(n)) return null;
  return pct ? n / 100 : n;
}

/**
 * Recognise a timepoint header and give it a sortable key.
 *
 * The key matters more than it looks: sorting these as text yields t10, t11, t12,
 * t8, t9 — the trend line jumps backwards from October onward. Anything that
 * orders timepoints must order by `key`.
 */
function tdParseTimepoint(v) {
  if (v instanceof Date) {
    return {
      raw: v,
      key: v.getFullYear() * 12 + v.getMonth(),
      n: null,
      prefix: 'date',
      date: v,
    };
  }
  var s = tdText(v);
  if (!s) return null;
  var m = /^([a-zA-Z])(\d{1,3})$/.exec(s);
  if (m) {
    return { raw: s, key: Number(m[2]), n: Number(m[2]), prefix: m[1].toLowerCase() };
  }
  // '2026-04' and '04/2026'
  m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (m) {
    return {
      raw: s,
      key: Number(m[1]) * 12 + (Number(m[2]) - 1),
      n: null,
      prefix: 'ym',
      year: Number(m[1]),
      month: Number(m[2]),
    };
  }
  m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    return {
      raw: s,
      key: Number(m[2]) * 12 + (Number(m[1]) - 1),
      n: null,
      prefix: 'my',
      year: Number(m[2]),
      month: Number(m[1]),
    };
  }
  return null;
}

/** Two digits, so month labels line up. */
function tdPad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/**
 * Timepoint → axis label. In 'month' mode a t<n> is offset from MONTH_ANCHOR,
 * carrying into the next year properly: anchored at t4 = 04/2026, t13 is 01/2027,
 * not 13/2026.
 */
function tdAxisLabel(tp, cfg) {
  cfg = cfg || CONFIG;
  if (tp.prefix === 'date' && tp.date) {
    return tdPad2(tp.date.getMonth() + 1) + '/' + tp.date.getFullYear();
  }
  if (tp.year && tp.month) return tdPad2(tp.month) + '/' + tp.year;
  if (cfg.AXIS_LABEL_MODE !== 'month' || tp.n === null) return String(tp.raw);
  var a = cfg.MONTH_ANCHOR;
  // Months since year 0, so the arithmetic cannot go wrong across a year edge.
  var months = a.year * 12 + (a.month - 1) + (tp.n - a.n);
  return tdPad2((months % 12) + 1) + '/' + Math.floor(months / 12);
}

/**
 * Block label → the metric name used everywhere else.
 *
 * Only the two labels in RENAME are rewritten; the rest keep the sheet's own
 * casing, which is what leaves CPI / CPC / CTR / CR upper-case and Pos as Pos.
 * An earlier version upper-cased anything four characters or shorter, on the
 * theory that short names are acronyms — that turned Pos into POS, and since the
 * metric name is the key every lookup uses, the Pos series then could not be
 * found at all.
 *
 * A fully lower-case label gets its first letter capitalised, so a block titled
 * 'spend' still reads as Spend.
 */
function tdNormaliseMetric(raw, cfg) {
  cfg = cfg || CONFIG;
  var s = tdText(raw);
  if (!s) return '';
  var renamed = cfg.RENAME[s.toUpperCase()];
  if (renamed) return renamed;
  if (s === s.toLowerCase()) return s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

// ===========================================================================
// Parsing
// ===========================================================================

/**
 * Find every metric block in a 2-D value grid.
 *
 * A block is recognised structurally: a label in the value column, column K blank
 * on that same row, and a valid timepoint directly below. That triple is what
 * makes row inserts, deletions and block reordering harmless — and it is why no
 * row number appears in this function.
 */
function tdParseBlocks(grid, cfg) {
  cfg = cfg || CONFIG;
  var out = [];
  for (var i = 0; i < grid.length; i++) {
    var row = grid[i] || [];
    var label = tdText(row[cfg.FIRST_VALUE_COL]);
    if (!label) continue;
    if (tdText(row[cfg.CATEGORY_COL])) continue;
    var headerRow = grid[i + 1] || [];
    if (!tdParseTimepoint(headerRow[cfg.FIRST_VALUE_COL])) continue;

    // Timepoints run right until the first cell that isn't one — that cell is
    // '% growth', which must never be read as a period.
    var tps = [];
    var limit = Math.min(headerRow.length, cfg.FIRST_VALUE_COL + cfg.MAX_SCAN_COLS);
    for (var c = cfg.FIRST_VALUE_COL; c < limit; c++) {
      var tp = tdParseTimepoint(headerRow[c]);
      if (!tp) break;
      tp.col = c;
      tps.push(tp);
    }
    if (!tps.length) continue;

    // Categories run down until column K goes blank, which also excludes the
    // block's own totals row.
    var cats = [];
    var r = i + 2;
    for (; r < grid.length; r++) {
      var name = tdText((grid[r] || [])[cfg.CATEGORY_COL]);
      if (!name) break;
      cats.push({ row: r, name: name });
    }
    if (!cats.length) continue;

    // The totals row: column K blank, but values present. Searched a couple of
    // rows ahead because Spend leaves a blank row before its own.
    var totals = null;
    for (var t = r; t < Math.min(grid.length, r + cfg.TOTAL_ROW_LOOKAHEAD); t++) {
      var tr = grid[t] || [];
      if (tdText(tr[cfg.CATEGORY_COL])) break;
      var vals = [];
      var any = false;
      for (var k = 0; k < tps.length; k++) {
        var v = tdNum(tr[tps[k].col]);
        vals.push(v);
        if (v !== null) any = true;
      }
      if (any) {
        totals = vals;
        break;
      }
    }

    var series = {};
    for (var ci = 0; ci < cats.length; ci++) {
      var vrow = grid[cats[ci].row] || [];
      var vs = [];
      for (var q = 0; q < tps.length; q++) vs.push(tdNum(vrow[tps[q].col]));
      series[cats[ci].name] = vs;
    }

    out.push({
      metric: tdNormaliseMetric(label, cfg),
      rawLabel: label,
      labelRow: i,
      timepoints: tps,
      categories: cats.map(function (c) { return c.name; }),
      series: series,
      sheetTotals: totals,
    });
  }
  return out;
}

// ===========================================================================
// TOTAL across categories
// ===========================================================================

/** Sum, treating a missing value as missing rather than as zero. Null when no
 *  category reported anything at that timepoint. */
function tdSumAt(byCat, cats, idx) {
  var sum = 0;
  var seen = false;
  for (var i = 0; i < cats.length; i++) {
    var v = (byCat[cats[i]] || [])[idx];
    if (v === null || v === undefined) continue;
    sum += v;
    seen = true;
  }
  return seen ? sum : null;
}

/**
 * Weighted mean, refusing to answer when too little of the weight is covered.
 *
 * The refusal is the point — see CONFIG.COVERAGE_MIN.
 */
function tdWeightedAt(values, weights, cats, idx, coverageMin) {
  var num = 0;
  var den = 0;
  var total = 0;
  for (var i = 0; i < cats.length; i++) {
    var w = (weights[cats[i]] || [])[idx];
    if (w === null || w === undefined || !(w > 0)) continue;
    total += w;
    var v = (values[cats[i]] || [])[idx];
    if (v === null || v === undefined) continue;
    num += v * w;
    den += w;
  }
  if (!(den > 0) || !(total > 0)) return null;
  if (den / total < coverageMin) return null;
  return num / den;
}

/**
 * Add the aggregate category to every block.
 *
 * Three routes, and which one a metric takes is a correctness question, not a
 * preference: sums for counts, recomputation from summed parts for ratios,
 * weighted means for the rest. Averaging a ratio across categories, or summing
 * one, both produce a number that looks fine and is wrong.
 *
 * A metric absent from all three CONFIG lists is summed, because that is the safe
 * default for the counts this sheet mostly holds — but a NEW ratio block added to
 * the sheet must be declared in DERIVED, or its aggregate is a meaningless
 * running total.
 */
function tdAddTotals(blocks, cfg) {
  cfg = cfg || CONFIG;
  if (!cfg.INCLUDE_TOTAL) return blocks;
  var label = cfg.TOTAL_LABEL;

  var byMetric = {};
  // The category list BEFORE the aggregate is added, captured for every block up
  // front. This is load-bearing: a ratio recomputes from another block's summed
  // parts, and blocks are processed in sheet order, so by the time CPI is reached
  // the Installs block has already had TOTAL appended to its own category list.
  // Summing over that list counted the aggregate a second time, doubling ΣInstalls
  // and reporting exactly half the real CPI — a number that looks entirely
  // plausible and is wrong by a factor of two.
  var baseCats = {};
  for (var i = 0; i < blocks.length; i++) {
    byMetric[blocks[i].metric] = blocks[i];
    baseCats[blocks[i].metric] = blocks[i].categories.slice();
  }

  for (var b = 0; b < blocks.length; b++) {
    var blk = blocks[b];
    var cats = baseCats[blk.metric];
    var n = blk.timepoints.length;
    var vals = [];
    var derived = cfg.DERIVED[blk.metric];
    var weighted = cfg.WEIGHTED[blk.metric];

    for (var t = 0; t < n; t++) {
      if (derived) {
        var numBlk = byMetric[derived.num];
        var denBlk = byMetric[derived.den];
        var num = numBlk ? tdSumAt(numBlk.series, baseCats[derived.num], t) : null;
        var den = denBlk ? tdSumAt(denBlk.series, baseCats[derived.den], t) : null;
        if (num !== null && den !== null && den !== 0) {
          vals.push(num / den);
          continue;
        }
        // Parts unavailable — fall back to the weighted mean of the ratio itself.
        var wBlk = byMetric[derived.weight];
        vals.push(
          wBlk ? tdWeightedAt(blk.series, wBlk.series, cats, t, cfg.COVERAGE_MIN) : null,
        );
        continue;
      }
      if (weighted) {
        var wb = byMetric[weighted.weight];
        vals.push(wb ? tdWeightedAt(blk.series, wb.series, cats, t, cfg.COVERAGE_MIN) : null);
        continue;
      }
      vals.push(tdSumAt(blk.series, cats, t));
    }

    blk.series[label] = vals;
    blk.categories = [label].concat(cats);
    // baseCats intentionally left untouched — later blocks still need the
    // pre-aggregate list.

  }
  return blocks;
}

// ===========================================================================
// Assembly
// ===========================================================================

/**
 * Everything the dialog needs, in one payload.
 *
 * Timepoints are unioned across blocks and sorted by key, so a block that is one
 * column behind the others still lines up instead of shifting the whole series.
 */
function tdBuildPayload(grid, cfg) {
  cfg = cfg || CONFIG;
  var blocks = tdAddTotals(tdParseBlocks(grid, cfg), cfg);

  var seen = {};
  var tps = [];
  for (var b = 0; b < blocks.length; b++) {
    for (var t = 0; t < blocks[b].timepoints.length; t++) {
      var tp = blocks[b].timepoints[t];
      var k = String(tp.key);
      if (seen[k]) continue;
      seen[k] = true;
      tps.push(tp);
    }
  }
  tps.sort(function (x, y) { return x.key - y.key; });

  var labels = [];
  var raws = [];
  for (var i = 0; i < tps.length; i++) {
    labels.push(tdAxisLabel(tps[i], cfg));
    raws.push(typeof tps[i].raw === 'string' ? tps[i].raw : tdAxisLabel(tps[i], cfg));
  }

  // Category order: whatever the sheet lists, with the aggregate first.
  var cats = [];
  var catSeen = {};
  for (var c = 0; c < blocks.length; c++) {
    for (var d = 0; d < blocks[c].categories.length; d++) {
      var nm = blocks[c].categories[d];
      if (catSeen[nm]) continue;
      catSeen[nm] = true;
      cats.push(nm);
    }
  }

  // Re-index every series onto the unioned timepoint axis.
  var data = {};
  var points = 0;
  for (var m = 0; m < blocks.length; m++) {
    var blk = blocks[m];
    var index = {};
    for (var z = 0; z < blk.timepoints.length; z++) index[String(blk.timepoints[z].key)] = z;
    data[blk.metric] = {};
    for (var ci = 0; ci < blk.categories.length; ci++) {
      var cat = blk.categories[ci];
      var src = blk.series[cat] || [];
      var row = [];
      for (var ti = 0; ti < tps.length; ti++) {
        var at = index[String(tps[ti].key)];
        var v = at === undefined ? null : src[at];
        row.push(v === undefined ? null : v);
        if (v !== null && v !== undefined && cat !== cfg.TOTAL_LABEL) points++;
      }
      data[blk.metric][cat] = row;
    }
  }

  var head = grid[0] || [];
  return {
    sheetName: cfg.SHEET_NAME,
    dateRange: { from: tdText(head[1]), to: tdText(head[2]) },
    metrics: blocks.map(function (x) { return x.metric; }),
    categories: cats,
    timepoints: raws,
    labels: labels,
    data: data,
    totalLabel: cfg.TOTAL_LABEL,
    // Counted excluding the aggregate, so the figure describes the sheet rather
    // than this script's own arithmetic — which is what makes it useful for
    // spotting that something upstream broke.
    dataPoints: points,
    readAt: new Date().toISOString(),
  };
}

// ===========================================================================
// Apps Script entry points
// ===========================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📈 Trend Dashboard')
    .addItem('Mở dashboard', 'showTrendDashboard')
    .addToUi();
}

function showTrendDashboard() {
  var html = HtmlService.createHtmlOutputFromFile('trend-dashboard')
    .setWidth(1180)
    .setHeight(860);
  SpreadsheetApp.getUi().showModalDialog(html, 'Trend Dashboard');
}

/**
 * Called by the dialog on open and on every refresh.
 *
 * Apps Script cannot push into an open dialog, so the sheet is re-read here each
 * time it asks. The dialog says as much on screen — a number that looks live but
 * is twenty minutes old is worse than one labelled with the time it was read.
 */
function getTrendData() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    return { error: 'Không tìm thấy tab "' + CONFIG.SHEET_NAME + '"' };
  }
  var grid = sheet.getDataRange().getValues();
  try {
    return tdBuildPayload(grid, CONFIG);
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}
