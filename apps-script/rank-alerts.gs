/**
 * ASO Rank Alert — phát hiện keyword top contribution bị tụt rank trên search ads
 * và gửi email + ghi vào tab AlertLog.
 *
 * Daily trigger 7am gọi runRankAlerts().
 *
 * Setup: paste full file này vào Apps Script project bound với sheet
 * (Extensions → Apps Script). Sau khi paste:
 *   1. Run 1 lần `runRankAlerts` thủ công để authorize MailApp + Spreadsheet
 *   2. Trigger: Triggers (icon đồng hồ) → Add Trigger → choose function `runRankAlerts`,
 *      event source "Time-driven", type "Day timer", time "7am to 8am"
 *
 * Tab AlertLog sẽ được auto-create lần đầu chạy nếu chưa tồn tại.
 */

const ALERT_CONFIG = {
  contributionWindows: ['L3', 'L7', 'L14', 'L30', 'L90'],
  topN: 20,
  rankCheckWindow: 'L7',          // Check rank drop trong COUNTRY_L7 (week-over-week)
  emailTo: 'trangnt@firegroup.io',
  emailSubjectPrefix: '⚠️ ASO Rank Alert',
  dashboardUrl: 'https://aso-performance.vercel.app',
  alertLogTab: 'AlertLog',
  // Đổi 2 hàm này nếu naming tab khác (vd: 'All_L7' vs 'ALL_L7')
  allTabName: function (w) { return 'ALL_' + w; },
  countryTabName: function (w) { return 'COUNTRY_' + w; },
};

function runRankAlerts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const topSet = collectTopContributorSet_(ss);
  if (topSet.size === 0) {
    Logger.log('No top contributors found — aborting');
    return;
  }
  Logger.log('Collected ' + topSet.size + ' top-contributor keywords');

  const drops = findRankDrops_(ss, topSet);
  if (drops.length === 0) {
    Logger.log('No rank drops detected — no email sent');
    return;
  }
  Logger.log('Detected ' + drops.length + ' rank drops');

  logAlerts_(ss, drops);
  sendAlertEmail_(drops);
}

/**
 * Map<keywordLower, Set<window>> — keyword vào top N theo usersL ở window nào.
 */
function collectTopContributorSet_(ss) {
  const map = new Map();
  for (let i = 0; i < ALERT_CONFIG.contributionWindows.length; i++) {
    const w = ALERT_CONFIG.contributionWindows[i];
    const tabName = ALERT_CONFIG.allTabName(w);
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      Logger.log('Tab ' + tabName + ' missing — skipping');
      continue;
    }
    const data = sheet.getDataRange().getValues();
    if (data.length < 4) continue;

    const headers = data[1].map(function (h) { return String(h).trim(); });
    const kwIx = colIndex_(headers, ['Search Term']);
    const usersLIx = colIndex_(headers, [/^Users L\d+D?$/, 'Users L', 'Users (L)']);
    if (kwIx < 0 || usersLIx < 0) {
      Logger.log('Missing required columns in ' + tabName);
      continue;
    }

    const dataRows = data.slice(3).filter(function (r) {
      const cell0 = String(r[0] || '').toUpperCase();
      return cell0 !== 'TOTAL' && String(r[kwIx] || '').trim() !== '';
    });

    dataRows.sort(function (a, b) {
      return Number(b[usersLIx] || 0) - Number(a[usersLIx] || 0);
    });

    const top = dataRows.slice(0, ALERT_CONFIG.topN);
    for (let j = 0; j < top.length; j++) {
      const kw = String(top[j][kwIx] || '').trim().toLowerCase();
      if (!kw) continue;
      if (!map.has(kw)) map.set(kw, new Set());
      map.get(kw).add(w);
    }
  }
  return map;
}

/**
 * Trả về list rank drops (paid only) cho các keyword trong topSet,
 * khi posL > posP ở rankCheckWindow.
 */
function findRankDrops_(ss, topSet) {
  const tabName = ALERT_CONFIG.countryTabName(ALERT_CONFIG.rankCheckWindow);
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    Logger.log('Tab ' + tabName + ' missing');
    return [];
  }
  const data = sheet.getDataRange().getValues();
  if (data.length < 4) return [];
  const headers = data[1].map(function (h) { return String(h).trim(); });

  const kwIx = colIndex_(headers, ['Search Term']);
  const countryIx = colIndex_(headers, ['Country']);
  const surfaceIx = colIndex_(headers, ['Surface Type', 'Surface']);
  const posLIx = colIndex_(headers, [/^Pos L\d+D?$/, 'Pos L', 'Pos (L)']);
  const posPIx = colIndex_(headers, [/^Pos P\d+D?$/, 'Pos P', 'Pos (P)']);
  const usersLIx = colIndex_(headers, [/^Users L\d+D?$/, 'Users L', 'Users (L)']);

  const required = [kwIx, countryIx, surfaceIx, posLIx, posPIx, usersLIx];
  if (required.indexOf(-1) >= 0) {
    Logger.log('Missing required columns in ' + tabName + ' — got indices ' + required.join(','));
    return [];
  }

  const drops = [];
  const dataRows = data.slice(3);
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    if (String(r[0] || '').toUpperCase() === 'TOTAL') continue;
    const kw = String(r[kwIx] || '').trim();
    if (!kw) continue;
    const kwLower = kw.toLowerCase();
    if (!topSet.has(kwLower)) continue;

    const surface = String(r[surfaceIx] || '').toLowerCase();
    const isPaid = surface === 'search_ad' || surface === 'paid';
    if (!isPaid) continue;

    const posL = Number(r[posLIx]);
    const posP = Number(r[posPIx]);
    if (!isFinite(posL) || !isFinite(posP)) continue;
    if (posL <= posP) continue; // pos thấp hơn = rank tốt hơn; chỉ alert khi posL > posP

    const country = String(r[countryIx] || '').trim();
    if (!country) continue;

    drops.push({
      keyword: kw,
      country: country,
      surface: 'paid',
      window: ALERT_CONFIG.rankCheckWindow,
      posL: posL,
      posP: posP,
      deltaPos: posL - posP,
      usersL: Number(r[usersLIx]) || 0,
      topContribWindows: Array.from(topSet.get(kwLower)).join(','),
    });
  }

  drops.sort(function (a, b) {
    return (b.usersL * b.deltaPos) - (a.usersL * a.deltaPos);
  });
  return drops;
}

function logAlerts_(ss, drops) {
  let sheet = ss.getSheetByName(ALERT_CONFIG.alertLogTab);
  if (!sheet) {
    sheet = ss.insertSheet(ALERT_CONFIG.alertLogTab);
    sheet.appendRow([
      'snapshot_date', 'keyword', 'country', 'window', 'surface',
      'pos_prior', 'pos_latest', 'delta_pos', 'users_l',
      'top_contrib_windows', 'email_sent',
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#f1f5f9');
    sheet.setFrozenRows(1);
  }
  const now = new Date();
  const rows = drops.map(function (d) {
    return [
      now,
      d.keyword,
      d.country,
      d.window,
      d.surface,
      d.posP,
      d.posL,
      d.deltaPos,
      d.usersL,
      d.topContribWindows,
      true,
    ];
  });
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function sendAlertEmail_(drops) {
  const tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
  const dateStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const subject = ALERT_CONFIG.emailSubjectPrefix + ' — ' + drops.length +
    ' keyword tụt rank (' + dateStr + ')';

  const top = drops.slice(0, 20);
  let html = '';
  html += '<p>Hi Trang,</p>';
  html += '<p>Trong số <b>top ' + ALERT_CONFIG.topN +
    ' keyword theo contribution</b> (union L3, L7, L14, L30, L90), ' +
    '<b>' + drops.length + '</b> dòng keyword × country đang ' +
    '<b>tụt rank</b> trong search ads (' + ALERT_CONFIG.rankCheckWindow +
    ' vs prior).</p>';
  html += '<table border="1" cellpadding="6" style="border-collapse:collapse;' +
    'font-family:Arial,sans-serif;font-size:13px;">';
  html += '<thead style="background:#f1f5f9;"><tr>';
  html += '<th>Keyword</th><th>Country</th><th>Pos P → L</th>' +
    '<th>Δ Pos</th><th>Users (' + ALERT_CONFIG.rankCheckWindow + ')</th>' +
    '<th>Top contrib at</th></tr></thead><tbody>';
  for (let i = 0; i < top.length; i++) {
    const d = top[i];
    html += '<tr>';
    html += '<td><b>' + escHtml_(d.keyword) + '</b></td>';
    html += '<td>' + escHtml_(d.country) + '</td>';
    html += '<td>' + d.posP.toFixed(1) + ' → ' + d.posL.toFixed(1) + '</td>';
    html += '<td style="color:#b91c1c;font-weight:600">+' +
      d.deltaPos.toFixed(1) + '</td>';
    html += '<td>' + Number(d.usersL).toLocaleString() + '</td>';
    html += '<td>' + escHtml_(d.topContribWindows) + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table>';
  if (drops.length > top.length) {
    html += '<p>… và ' + (drops.length - top.length) +
      ' rows khác (xem tab <b>' + ALERT_CONFIG.alertLogTab + '</b>)</p>';
  }
  html += '<p style="margin-top:16px;font-size:12px;color:#64748b">' +
    'Dashboard: <a href="' + ALERT_CONFIG.dashboardUrl + '">' +
    ALERT_CONFIG.dashboardUrl + '</a></p>';

  MailApp.sendEmail({
    to: ALERT_CONFIG.emailTo,
    subject: subject,
    htmlBody: html,
  });
}

function escHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return {
      '&': '&amp;', '<': '&lt;', '>': '&gt;',
      '"': '&quot;', "'": '&#39;',
    }[c];
  });
}

function colIndex_(headers, patterns) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').trim();
    for (let j = 0; j < patterns.length; j++) {
      const p = patterns[j];
      if (typeof p === 'string') {
        if (h === p) return i;
      } else if (p instanceof RegExp) {
        if (p.test(h)) return i;
      }
    }
  }
  return -1;
}

// Chạy thủ công 1 lần để authorize permission lần đầu (MailApp + Spreadsheet)
function testRankAlerts() {
  runRankAlerts();
}
