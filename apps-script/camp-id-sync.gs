/**
 * Camp ID Sync — tự gắn Campaign ID cho tab Master KW Lookup từ tab Camp_Links.
 *
 * Vì sao: Trang đổi đuôi tên campaign trên Shopify liên tục ("… - Tier 2 - NL"
 * → "… - Tier 1 - NL", thêm "(CPI 41)", "- net value 64$"…). Tên là thứ hay
 * đổi, ID là thứ không đổi. Khi mỗi dòng Master mang Campaign ID thì dashboard
 * (và chính Trang) ghép keyword ↔ campaign theo ID, không còn nhầm vì tên.
 * (Trang 02/10/2026: "giúp t tự động gắn ID đi, để sau này campaign có đổi tên
 * vẫn giữ ID đó thì ko bị nhầm lẫn".)
 *
 * Nguồn ID: Camp_Links (cột Campaign ID; không có thì lấy số cuối URL
 * partners.shopify.com/…/ads/<id>). Tên cũ ở cột "Tên cũ (alias)" cũng ghép.
 *
 * Cách ghép tên Master → Camp_Links (cùng thứ tự với lib/sheets/campName.ts
 * của dashboard, để sheet và dashboard gọi cùng một camp giống nhau):
 *   1. bỏ "!" đầu tên, bỏ tag "(CPI nn)" / "- CPI nn", chuẩn hoá khoảng trắng
 *      quanh dấu gạch, so không phân biệt hoa thường
 *   2. khớp đúng tên hoặc tên cũ (alias)
 *   3. tên Master = tên Camp_Links + ghi chú ở ranh giới " - " hoặc " (" → lấy
 *      tên Camp_Links DÀI NHẤT khớp (không bao giờ gộp "… - Tier 1 - UK" vào
 *      "… - Tier 1", vì geo cũng ở ranh giới đó nên mỗi geo có dòng riêng)
 *   4. ngược lại: đúng MỘT tên Camp_Links = tên Master + đuôi giống ghi chú
 *   5. chỉ khác số tier ("Tier 1 - ES" ↔ "Tier 2 - ES") và kết quả là duy nhất
 *
 * Quy tắc ghi:
 *   - Ô Campaign ID đã có giá trị → KHÔNG đụng (ID là mỏ neo; tên đổi gì cũng
 *     giữ). Muốn gắn lại thì xoá ô ID rồi chạy lại.
 *   - Không ghép được → để trống, ghi vào log + báo ở hộp thoại để Trang bổ
 *     sung Camp_Links (hoặc thêm tên cũ vào cột alias).
 *   - Chưa có cột "Campaign ID" trong Master → tự thêm ở cuối hàng header.
 *
 * Cài đặt (một lần): dán file này vào Apps Script project của sheet ASO
 * (Extensions → Apps Script), rồi:
 *   1. Chạy tay `syncMasterCampaignIds` một lần để cấp quyền và gắn ID cho
 *      toàn bộ dòng hiện có.
 *   2. Chạy `installCampIdTriggers` một lần → tạo trigger "on edit" (gắn ID
 *      ngay khi gõ/dán tên camp vào Master) và trigger hằng ngày 6h (quét lại
 *      toàn bộ, bắt những dòng dán vào lúc trigger on-edit chưa chạy).
 *   Mở lại sheet sẽ thấy menu "🔗 Camp ID" để chạy tay bất cứ lúc nào.
 *   Nếu project đã có hàm onOpen ở file khác thì gộp dòng addMenu vào đó.
 */

var CAMP_ID_CONFIG = {
  masterTab: 'Master KW Lookup',
  campLinksTab: 'Camp_Links',
  // Master: header là dòng có cột A = "Category" và cột C = "KW" (như parser
  // của dashboard). Cột camp = B. Cột ID tìm theo tên header.
  masterCampCol: 2, // B (1-based)
  idHeader: 'Campaign ID',
  dailyHour: 6,
};

// ===========================================================================
// Entry points
// ===========================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔗 Camp ID')
    .addItem('Gắn Campaign ID cho Master (dòng còn trống)', 'syncMasterCampaignIds')
    .addItem('Cài trigger tự động (on edit + hằng ngày)', 'installCampIdTriggers')
    .addToUi();
}

/** Quét toàn bộ Master, điền ID cho mọi dòng còn trống. Chạy tay hoặc theo giờ. */
function syncMasterCampaignIds() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = fillMasterIds_(ss, null);
  var msg = campIdSummary_(result);
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert('Camp ID Sync', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // chạy theo trigger thì không có UI
  }
}

/** Trigger on edit (installable): chỉ xử lý các dòng vừa sửa trong Master. */
function onEditFillCampId(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== CAMP_ID_CONFIG.masterTab) return;
  var first = e.range.getRow();
  var last = first + e.range.getNumRows() - 1;
  fillMasterIds_(sheet.getParent(), [first, last]);
}

function installCampIdTriggers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    var h = existing[i].getHandlerFunction();
    if (h === 'onEditFillCampId' || h === 'syncMasterCampaignIds') ScriptApp.deleteTrigger(existing[i]);
  }
  ScriptApp.newTrigger('onEditFillCampId').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('syncMasterCampaignIds').timeBased().everyDays(1).atHour(CAMP_ID_CONFIG.dailyHour).create();
  try {
    SpreadsheetApp.getUi().alert(
      'Camp ID Sync',
      'Đã cài 2 trigger:\n• on edit — gắn ID ngay khi gõ/dán tên camp vào Master\n• hằng ngày ' + CAMP_ID_CONFIG.dailyHour + 'h — quét lại toàn bộ',
      SpreadsheetApp.getUi().ButtonSet.OK,
    );
  } catch (err) {}
}

// ===========================================================================
// Sheet work
// ===========================================================================

/**
 * Điền ID cho Master. rowSpan = [first,last] (1-based) để chỉ xử lý một
 * khoảng (on edit), null = toàn bộ.
 */
function fillMasterIds_(ss, rowSpan) {
  var master = ss.getSheetByName(CAMP_ID_CONFIG.masterTab);
  var links = ss.getSheetByName(CAMP_ID_CONFIG.campLinksTab);
  if (!master || !links) throw new Error('Thiếu tab ' + (master ? CAMP_ID_CONFIG.campLinksTab : CAMP_ID_CONFIG.masterTab));

  var index = buildCampIdIndex_(links.getDataRange().getValues());
  var headerRow = findMasterHeaderRow_(master);
  if (headerRow < 0) throw new Error('Không thấy hàng header của Master (cột A = "Category", cột C = "KW")');
  var idCol = ensureIdColumn_(master, headerRow);

  var lastRow = master.getLastRow();
  var first = Math.max(headerRow + 1, rowSpan ? rowSpan[0] : headerRow + 1);
  var last = rowSpan ? Math.min(lastRow, rowSpan[1]) : lastRow;
  var result = { filled: 0, kept: 0, unresolved: [], scanned: 0 };
  if (last < first) return result;

  var n = last - first + 1;
  var camps = master.getRange(first, CAMP_ID_CONFIG.masterCampCol, n, 1).getValues();
  var ids = master.getRange(first, idCol, n, 1).getValues();
  var out = [];
  var changed = false;
  var unresolvedSet = {};
  for (var i = 0; i < n; i++) {
    var camp = String(camps[i][0] || '').trim();
    var cur = String(ids[i][0] || '').trim();
    out.push([ids[i][0]]);
    if (!camp) continue;
    result.scanned++;
    if (cur) { result.kept++; continue; }
    var id = resolveCampId_(camp, index);
    if (id) {
      out[i] = [id];
      result.filled++;
      changed = true;
    } else {
      unresolvedSet[camp] = true;
    }
  }
  if (changed) master.getRange(first, idCol, n, 1).setValues(out);
  result.unresolved = Object.keys(unresolvedSet);
  return result;
}

function findMasterHeaderRow_(sheet) {
  var top = sheet.getRange(1, 1, Math.min(10, sheet.getLastRow()), 3).getValues();
  for (var i = 0; i < top.length; i++) {
    if (String(top[i][0]).trim() === 'Category' && String(top[i][2]).trim() === 'KW') return i + 1;
  }
  return -1;
}

/** Cột "Campaign ID" (1-based) trong hàng header; chưa có thì thêm sau cột cuối. */
function ensureIdColumn_(sheet, headerRow) {
  var lastCol = Math.max(1, sheet.getLastColumn());
  var header = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  for (var c = 0; c < header.length; c++) {
    if (String(header[c]).trim().toLowerCase() === CAMP_ID_CONFIG.idHeader.toLowerCase()) return c + 1;
  }
  // Cột trống đầu tiên sau header cuối cùng (không chen vào giữa: dashboard
  // đọc Category/Camp/KW/Bid theo vị trí cố định A/B/C/E).
  var col = header.length;
  while (col > 0 && String(header[col - 1]).trim() === '') col--;
  col += 1;
  if (col > sheet.getMaxColumns()) sheet.insertColumnAfter(sheet.getMaxColumns());
  sheet.getRange(headerRow, col).setValue(CAMP_ID_CONFIG.idHeader);
  return col;
}

function campIdSummary_(r) {
  var lines = [
    'Đã quét ' + r.scanned + ' dòng có tên camp.',
    'Gắn mới: ' + r.filled + ' · đã có ID (giữ nguyên): ' + r.kept + ' · không ghép được: ' + r.unresolved.length,
  ];
  if (r.unresolved.length) {
    lines.push('');
    lines.push('Camp chưa có trong Camp_Links (thêm dòng, hoặc ghi tên này vào cột "Tên cũ (alias)" của camp tương ứng):');
    var show = r.unresolved.slice(0, 40);
    for (var i = 0; i < show.length; i++) lines.push('  • ' + show[i]);
    if (r.unresolved.length > show.length) lines.push('  … và ' + (r.unresolved.length - show.length) + ' camp nữa (xem Logger)');
  }
  return lines.join('\n');
}

// ===========================================================================
// Pure name matching — no SpreadsheetApp, so it can be tested in Node
// (apps-script/test/camp-id-sync.test.mjs).
// ===========================================================================

/** Bỏ "!" đầu tên và các tag CPI; giữ nguyên geo trong ngoặc như "(-IN, US)". */
function campIdNormalizeName_(name) {
  var x = String(name == null ? '' : name).trim().replace(/^[!\s]+/, '');
  for (var i = 0; i < 6; i++) {
    var y = x
      .replace(/\s*\([^()]*CPI[^()]*\)/gi, ' ')
      .replace(/\s*[-–]\s*CPI\s*[\d.]+\s*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (y === x) break;
    x = y;
  }
  return x;
}

/** Khoá so sánh: chữ thường, mọi dấu gạch viết thành " - ", gộp khoảng trắng. */
function campIdLooseKey_(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*[-–]\s*/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

var CAMP_ID_NOTE_BOUNDARY = /^\s*[-–(]/;
var CAMP_ID_NOTE_LIKE =
  /^\s*\(|\b(cpi|bid|ins|inst|install|test|maintain|good|ok|watch|pause|paused|off|rev|roas|imp|clean|check|focus|foucs|original|new|till|since|low|high|excl|no ins|no rev|k có|không|thấp|cao|ít|nhỏ|cân nhắc|chưa|hạ|tăng|theo dõi)\b/i;
var CAMP_ID_TIER_TOKEN = /tier\s*\d+(?:[.,]\d+)?(?:\s*premium)?/gi;

function campIdTierAgnostic_(lc) {
  return lc.replace(CAMP_ID_TIER_TOKEN, 'tier#').replace(/\s{2,}/g, ' ').trim();
}

function campIdFromUrl_(url) {
  var m = String(url || '').match(/\/ads\/(\d+)(?!\d)/);
  return m ? m[1] : '';
}

/**
 * Chỉ mục từ Camp_Links (getValues của cả tab). Tìm header: cột A = "Category",
 * cột C = "Campaign ID". Cột alias tìm theo tên header ("Tên cũ" / "alias").
 * Trả về { byKey: {looseKey → id}, keysByLen: [...], byTierless: {t → [key]} }.
 */
function buildCampIdIndex_(rows) {
  var headerIdx = -1;
  for (var i = 0; i < Math.min(rows.length, 10); i++) {
    if (String(rows[i][0]).trim() === 'Category' && String(rows[i][2]).trim() === 'Campaign ID') { headerIdx = i; break; }
  }
  var index = { byKey: {}, keysByLen: [], byTierless: {}, tierlessByLen: [] };
  if (headerIdx < 0) return index;
  var header = rows[headerIdx];
  var aliasCol = -1;
  for (var c = 0; c < header.length; c++) {
    if (/^tên cũ|alias/i.test(String(header[c]).trim())) { aliasCol = c; break; }
  }
  var add = function (name, id) {
    var k = campIdLooseKey_(campIdNormalizeName_(name));
    if (!k || !id) return;
    if (!index.byKey[k]) index.byKey[k] = String(id);
  };
  for (var r = headerIdx + 1; r < rows.length; r++) {
    var row = rows[r];
    var camp = String(row[1] || '').trim();
    if (!camp) continue;
    var id = String(row[2] || '').trim() || campIdFromUrl_(row[3]);
    if (!id) continue;
    add(camp, id);
    if (aliasCol >= 0) {
      var aliases = String(row[aliasCol] || '').split('|');
      for (var a = 0; a < aliases.length; a++) add(aliases[a], id);
    }
  }
  index.keysByLen = Object.keys(index.byKey).sort(function (x, y) { return y.length - x.length; });
  for (var k2 in index.byKey) {
    var t = campIdTierAgnostic_(k2);
    if (t === k2) continue;
    if (!index.byTierless[t]) index.byTierless[t] = [];
    index.byTierless[t].push(k2);
  }
  index.tierlessByLen = Object.keys(index.byTierless).sort(function (x, y) { return y.length - x.length; });
  return index;
}

/** ID cho một tên camp trong Master, hoặc '' nếu không ghép được. */
function resolveCampId_(name, index) {
  var lc = campIdLooseKey_(campIdNormalizeName_(name));
  if (!lc) return '';
  var rawLc = campIdLooseKey_(String(name || '').trim().replace(/^[!\s]+/, ''));

  // 1–3. đúng tên / alias, hoặc tên Camp_Links dài nhất mà tên này nối thêm ghi chú
  var hit = campIdMatchIn_(lc, index.byKey, index.keysByLen);
  if (!hit && rawLc !== lc) hit = campIdMatchIn_(rawLc, index.byKey, index.keysByLen);
  if (hit) return index.byKey[hit];

  // 4. ngược: đúng một tên Camp_Links = tên này + đuôi giống ghi chú
  var rev = null;
  for (var i = 0; i < index.keysByLen.length; i++) {
    var base = index.keysByLen[i];
    if (base.length > lc.length && base.indexOf(lc) === 0 && CAMP_ID_NOTE_BOUNDARY.test(base.slice(lc.length))) {
      if (!CAMP_ID_NOTE_LIKE.test(base.slice(lc.length))) continue;
      if (rev !== null) { rev = null; break; }
      rev = base;
    }
  }
  if (rev) return index.byKey[rev];

  // 5. chỉ khác số tier, và duy nhất
  var tierless = campIdTierAgnostic_(lc);
  if (tierless !== lc) {
    var th = campIdMatchIn_(tierless, index.byTierless, index.tierlessByLen);
    if (th && index.byTierless[th].length === 1) return index.byKey[index.byTierless[th][0]];
  }
  return '';
}

function campIdMatchIn_(lc, exact, byLen) {
  if (Object.prototype.hasOwnProperty.call(exact, lc)) return lc;
  for (var i = 0; i < byLen.length; i++) {
    var base = byLen[i];
    if (lc.length > base.length && lc.indexOf(base) === 0 && CAMP_ID_NOTE_BOUNDARY.test(lc.slice(base.length))) return base;
  }
  return null;
}
