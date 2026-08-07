/**
 * PATCH cho history_daily_v2.gs — sửa 2 hàm, KHÔNG thêm hàm mới.
 *
 * Cách áp: mở history_daily_v2.gs trong Apps Script, thay thế NGUYÊN 2 hàm
 * `loadExistingKeys_` và `fetchAndWriteTrueDaily_` bằng bản dưới đây.
 * (Đừng paste thêm vào cuối file — trùng tên hàm, Apps Script lấy bản cuối,
 *  rất dễ nhầm khi đọc lại sau này.)
 *
 * ══ BUG 1 — key so sánh sai kiểu dữ liệu (nghiêm trọng) ══
 *
 * Cột A của History_Daily lưu Date THẬT (Sheets tự parse chuỗi 'YYYY-MM-DD'
 * khi setValues). Code cũ dựng key bằng:
 *
 *     String(idx[i][0]) + '|' + ...        →  "Mon Jul 13 2026 00:00:00 GMT+0700 (…)|…"
 *
 * rồi tra bằng:
 *
 *     dateStr + '|' + ...                  →  "2026-07-13|…"
 *
 * Hai chuỗi này KHÔNG BAO GIỜ bằng nhau → `rowIndex.has(key)` luôn false →
 * nhánh UPDATE chết hẳn, mọi thứ rơi vào INSERT:
 *
 *   - Cột 8-11 (usersDaily…) của dòng l7_snapshot không bao giờ được điền.
 *   - Mỗi lần backfill đẻ thêm một dòng TRÙNG key (date|term|surface).
 *     → đây là nguồn gốc History_Daily phình 50k dòng và chạm trần 10M cell.
 *
 * Bằng chứng trong data hiện tại: hàm update ghi source dạng `old + '+' + source`
 * (vd 'l7_snapshot+true_daily'), nhưng KHÔNG có một source nào chứa dấu '+'.
 * Nhánh update chưa từng chạy.
 *
 * Fix: chuẩn hoá date về 'yyyy-MM-dd' ở CẢ hai phía qua _dateKey_().
 *
 * ══ BUG 2 — 3 lệnh gọi Sheets API mỗi dòng (chậm → timeout) ══
 *
 * Code cũ, trong vòng lặp updateOps:
 *     dest.getRange(rowNum, 8, 1, 4).setValues(...)   // 1
 *     dest.getRange(rowNum, 12).getValue()            // 2  ← đọc lẻ từng dòng
 *     dest.getRange(rowNum, 12).setValue(...)         // 3
 *
 * ~130 dòng/ngày = ~390 lệnh gọi cho MỘT ngày. backfill 30-90 ngày thì luôn
 * đụng trần 6 phút của Apps Script → phải chạy đi chạy lại nhiều lần.
 *
 * Fix: đọc cột 8-12 một lần vào mảng, sửa trong bộ nhớ, ghi lại đúng một lần
 * (chỉ ghi khoảng dòng thực sự thay đổi). 2 lệnh gọi thay vì hàng trăm.
 */

/** Chuẩn hoá ô ngày về 'yyyy-MM-dd' bất kể Sheets trả Date, số serial hay chuỗi. */
function _dateKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  if (typeof v === 'number' && isFinite(v)) {
    // Serial Sheets (gốc 1899-12-30) → ms UTC. Format theo UTC để không bị
    // lệch 1 ngày do offset +07 khi giờ là 00:00.
    return Utilities.formatDate(new Date(Math.round((v - 25569) * 86400 * 1000)), 'UTC', 'yyyy-MM-dd');
  }
  return String(v || '').trim().slice(0, 10);
}

/** Key định danh 1 dòng History_Daily. Dùng CHUNG cho mọi chỗ tra cứu. */
function _rowKey_(dateVal, term, surface) {
  return _dateKey_(dateVal) + '|' + String(term || '').trim() + '|' + String(surface || '').trim().toLowerCase();
}

/**
 * Build Set<date|searchTerm|surface> của các dòng đã có, để check idempotent.
 * Returns { keys: Set, sourceMap: Map<key, source> }.
 */
function loadExistingKeys_(dest) {
  const lastRow = dest.getLastRow();
  const result = { keys: new Set(), sourceMap: new Map() };
  if (lastRow <= 1) return result;
  const data = dest.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const key = _rowKey_(row[0], row[1], row[2]);
    result.keys.add(key);
    result.sourceMap.set(key, String(row[11] || ''));
  }
  return result;
}

/**
 * Fetch TRUE daily metrics cho 1 ngày từ GA4 và ghi vào History_Daily.
 *   - dateStr: 'YYYY-MM-DD'
 *   - source:  nhãn cột 12 ('true_daily' | 'l30_backfill' | …)
 *
 * Dòng đã tồn tại (date, term, surface) → UPDATE cột 8-11 tại chỗ.
 * Chưa tồn tại → INSERT dòng mới, cột 1-7 để trống.
 */
function fetchAndWriteTrueDaily_(dest, dateStr, source) {
  if (typeof fetchGA4Data_ !== 'function') {
    throw new Error('fetchGA4Data_ not found — phải chạy script này trong CÙNG project với Code.gs');
  }

  const ga4Data = fetchGA4Data_(dateStr, dateStr);
  if (!ga4Data || ga4Data.length === 0) {
    Logger.log('No GA4 data for ' + dateStr);
    return 0;
  }
  Logger.log('GA4 fetched ' + ga4Data.length + ' (term, surface) tuples for ' + dateStr);

  const lastRow = dest.getLastRow();
  const nRows = Math.max(0, lastRow - 1);

  // Đọc gọn 2 vùng: khoá (cột 1-3) và vùng sẽ sửa (cột 8-12).
  const keyCols = nRows > 0 ? dest.getRange(2, 1, nRows, 3).getValues() : [];
  const block = nRows > 0 ? dest.getRange(2, 8, nRows, 5).getValues() : [];

  const rowIndex = new Map(); // key → chỉ số 0-based trong block
  for (let i = 0; i < keyCols.length; i++) {
    rowIndex.set(_rowKey_(keyCols[i][0], keyCols[i][1], keyCols[i][2]), i);
  }

  let minIdx = Infinity, maxIdx = -1, updated = 0;
  const insertOps = [];

  ga4Data.forEach(r => {
    const term = r.search_term;
    const surface = r.surface_type;
    if (!term || !surface) return;
    if (r.users === 0 && r.getApp === 0) return; // bỏ dòng rỗng

    const usersDaily = r.users;
    const getAppDaily = r.getApp;
    const crDaily = (typeof r.cr === 'number' && isFinite(r.cr)) ? r.cr : '';
    const posDaily = (typeof r.position === 'number' && isFinite(r.position)) ? r.position : '';

    const idx = rowIndex.get(_rowKey_(dateStr, term, surface));
    if (idx !== undefined) {
      block[idx][0] = usersDaily;
      block[idx][1] = getAppDaily;
      block[idx][2] = crDaily;
      block[idx][3] = posDaily;
      const old = String(block[idx][4] || '');
      block[idx][4] = old && old.indexOf(source) === -1 ? old + '+' + source : (old || source);
      if (idx < minIdx) minIdx = idx;
      if (idx > maxIdx) maxIdx = idx;
      updated++;
    } else {
      insertOps.push([
        dateStr, term, surface,
        '', '', '', '',
        usersDaily, getAppDaily, crDaily, posDaily,
        source,
      ]);
    }
  });

  // Ghi lại đúng một lần, chỉ khoảng dòng có thay đổi.
  if (maxIdx >= 0) {
    const slice = block.slice(minIdx, maxIdx + 1);
    dest.getRange(2 + minIdx, 8, slice.length, 5).setValues(slice);
  }
  if (insertOps.length > 0) {
    dest.getRange(dest.getLastRow() + 1, 1, insertOps.length, HEADERS.length).setValues(insertOps);
  }

  Logger.log(dateStr + ': updated ' + updated + ' rows, inserted ' + insertOps.length +
    ' rows (source=' + source + ')');
  return updated + insertOps.length;
}
