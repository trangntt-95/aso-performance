import { google } from 'googleapis';
import { TABS, LEGACY_TAB_NAMES, type TabName } from './tabs';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
// Read/write scope — only used by the bid-notes writer; needs the sheet shared
// with the service account as Editor.
const WRITE_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getAuth(scopes: string[] = SCOPES) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!email || !rawKey) {
    throw new Error(
      'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY env var',
    );
  }
  const key = rawKey.replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email,
    key,
    scopes,
  });
}

function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('Missing GOOGLE_SHEET_ID env var');
  return id;
}

export function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

export function getWriteSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth(WRITE_SCOPES) });
}

export { getSpreadsheetId };

/** Tên tab trong A1 notation: luôn có nháy, nháy trong tên thì nhân đôi. */
const a1Tab = (title: string): string => `'${title.replace(/'/g, "''")}'`;

export async function fetchTab(tabName: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    // Nháy quanh tên tab: A1 notation cần nó khi tên có dấu cách
    // ('Max bid cap', 'Countries performance').
    range: `${a1Tab(tabName)}!A:Z`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return (res.data.values || []) as string[][];
}

/** Excel serial → 'YYYY-MM-DD', or '' when the cell isn't a plausible date. */
function excelDateToIso(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 90000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? '').trim());
  return m ? m[0] : '';
}

/** A1 column letters for a zero-based index: 0 → A, 26 → AA. */
function colLetter(i: number): string {
  let n = i;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * Per-campaign, per-DAY rows from the separate Shopify Ads spreadsheet.
 *
 * Returned in the fixed shape the parser expects:
 *   [date, campaign, impressions, clicks, installs, spend]
 *
 * Reads the FIRST tab only, by position rather than by name. That tab is the raw
 * daily export ("Trueprofit 2026" at the time of writing); the tabs after it are
 * pivots and older years, and reading one of those is what caused the per-day
 * feed to silently return aggregate rows. Position survives the yearly rename
 * that a hardcoded name would not.
 *
 * The header is validated before anything is read, so a wrong first tab fails
 * with a named error instead of quietly yielding zero rows.
 */
export async function fetchShopifyDailyRows(): Promise<unknown[][]> {
  // Trimmed: a value set through a shell pipe can carry a trailing newline,
  // which the Sheets API rejects as a malformed spreadsheet id.
  const id = process.env.GOOGLE_SHEET_ID_SHOPIFY?.trim();
  if (!id) return [];
  const sheets = getSheetsClient();

  try {
    const info = await sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets.properties(title,index)',
    });
    const tabs = (info.data.sheets ?? [])
      .map((sh) => ({ title: sh.properties?.title ?? '', index: sh.properties?.index ?? 0 }))
      .filter((t) => t.title)
      .sort((a, b) => a.index - b.index);
    const tab = tabs[0]?.title;
    if (!tab) throw new Error('Sheet Shopify không có tab nào');

    const head = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `'${tab}'!A1:AZ1`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const header = ((head.data.values?.[0] ?? []) as unknown[]).map((h) =>
      String(h ?? '').trim().toLowerCase(),
    );
    const at = (...names: string[]): number => {
      for (const n of names) {
        const i = header.indexOf(n);
        if (i >= 0) return i;
      }
      return -1;
    };
    // 'Ad Name' is the campaign label the rest of the dashboard keys on;
    // 'Campaign' in this tab is the brand/non-brand grouping, not a camp name.
    const idx = {
      date: at('start date', 'date'),
      camp: at('ad name', 'campaign name'),
      impressions: at('impressions'),
      clicks: at('clicks'),
      installs: at('installs'),
      spend: at('spend'),
    };
    const missing = Object.entries(idx).filter(([, v]) => v < 0).map(([k]) => k);
    if (missing.length > 0) {
      throw new Error(`Tab đầu tiên ('${tab}') thiếu cột: ${missing.join(', ')}`);
    }
    // Vị trí và visibility là tuỳ chọn: export nào cũng có (cột U, V), nhưng
    // thiếu chúng thì bảng Overbid/Camp Health vẫn phải chạy — chỉ panel
    // "brand đã top" là tắt.
    const optional = {
      position: at('average position', 'avg position', 'position'),
      visibility: at('visibility'),
    };

    const order = ['date', 'camp', 'impressions', 'clicks', 'installs', 'spend'] as const;
    const optionalKeys = (Object.keys(optional) as (keyof typeof optional)[]).filter((k) => optional[k] >= 0);
    const colIdx = [...order.map((k) => idx[k]), ...optionalKeys.map((k) => optional[k])];
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: id,
      // Only the columns needed, so a 100k-row tab stays a small read.
      ranges: colIdx.map((c) => {
        const L = colLetter(c);
        return `'${tab}'!${L}2:${L}`;
      }),
      valueRenderOption: 'UNFORMATTED_VALUE',
      majorDimension: 'COLUMNS',
    });
    const cols = (res.data.valueRanges ?? []).map((vr) => (vr.values?.[0] ?? []) as unknown[]);
    if (cols.length !== colIdx.length) throw new Error('batchGet trả thiếu cột');
    const posCol = optionalKeys.indexOf('position');
    const visCol = optionalKeys.indexOf('visibility');

    const n = Math.max(...cols.map((c) => c.length));
    const out: unknown[][] = [];
    for (let i = 0; i < n; i++) {
      const iso = excelDateToIso(cols[0][i]);
      const camp = String(cols[1][i] ?? '').trim();
      if (!iso || !camp) continue;
      out.push([
        iso,
        camp,
        cols[2][i],
        cols[3][i],
        cols[4][i],
        cols[5][i],
        posCol >= 0 ? cols[order.length + posCol][i] : null,
        visCol >= 0 ? cols[order.length + visCol][i] : null,
      ]);
    }
    return out;
  } catch (e) {
    // No fallback to another tab on purpose: the other tabs hold pivots and
    // prior years, and silently reading one of those is the failure this
    // function exists to avoid. Empty here means the screens say "no data",
    // which is true, instead of showing numbers from the wrong table.
    console.error('fetchShopifyDailyRows failed:', (e as Error).message);
    return [];
  }
}

/**
 * Tab names + sizes of the Shopify Ads spreadsheet.
 *
 * fetchShopifyDailyRows reads the first tab, so a reordered tab list, a
 * re-created file or a lost share all produce the same empty array. This
 * distinguishes them — the list is in tab order.
 */
export async function listShopifyTabs(): Promise<
  { title: string; rows: number; cols: number }[] | { error: string }
> {
  const id = process.env.GOOGLE_SHEET_ID_SHOPIFY?.trim();
  if (!id) return { error: 'GOOGLE_SHEET_ID_SHOPIFY chưa được set' };
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets.properties(title,gridProperties)',
    });
    return (res.data.sheets ?? []).map((sh) => ({
      title: sh.properties?.title ?? '',
      rows: sh.properties?.gridProperties?.rowCount ?? 0,
      cols: sh.properties?.gridProperties?.columnCount ?? 0,
    }));
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Mọi tab của sheet CHÍNH, kèm kích thước lưới.
 *
 * TABS là danh sách tab dashboard MUỐN đọc; đây là danh sách tab thật sự có.
 * Khi hai cái lệch nhau — tab đổi tên, tab mới thêm — không nhìn được cái sau
 * thì chỉ còn cách đoán tên, và đoán sai trông y hệt tab rỗng.
 */
export async function listMainTabs(): Promise<
  { title: string; rows: number; cols: number }[] | { error: string }
> {
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.get({
      spreadsheetId: getSpreadsheetId(),
      fields: 'sheets.properties(title,gridProperties)',
    });
    return (res.data.sheets ?? []).map((sh) => ({
      title: sh.properties?.title ?? '',
      rows: sh.properties?.gridProperties?.rowCount ?? 0,
      cols: sh.properties?.gridProperties?.columnCount ?? 0,
    }));
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Chụp thô một tab của sheet chính — để đọc layout thật thay vì đoán. */
export async function probeMainTab(
  tab: string,
  range = 'A1:AB14',
): Promise<unknown> {
  try {
    const sheets = getSheetsClient();
    const a1 = range.replace(/[^A-Za-z0-9:]/g, '') || 'A1:AB14';
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: `${a1Tab(tab)}!${a1}`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const rows = (res.data.values ?? []) as unknown[][];
    return {
      tab,
      returnedRows: rows.length,
      widestRow: rows.reduce((w, r) => Math.max(w, (r ?? []).length), 0),
      sample: rows.map((r, i) => ({
        row: i + 1,
        cells: (r ?? []).slice(0, 28).map((c) => (c === '' || c == null ? null : String(c).slice(0, 24))),
      })),
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * A wide, shallow read of the Shopify 'By campaign' tab.
 *
 * Diagnostic only. The tab's grid is ~101k rows while the A:F read returns a few
 * hundred, which means the per-day table no longer starts in column A — this
 * shows what each column actually holds so the real range can be targeted.
 */
export async function probeShopifyWide(tab?: string, range?: string): Promise<unknown> {
  const id = process.env.GOOGLE_SHEET_ID_SHOPIFY?.trim();
  if (!id) return { error: 'GOOGLE_SHEET_ID_SHOPIFY chưa được set' };
  try {
    const sheets = getSheetsClient();
    // Default to the first tab — the one the daily reader actually uses.
    let target = tab;
    if (!target) {
      const info = await sheets.spreadsheets.get({
        spreadsheetId: id,
        fields: 'sheets.properties(title,index)',
      });
      const tabs = (info.data.sheets ?? [])
        .map((sh) => ({ title: sh.properties?.title ?? '', index: sh.properties?.index ?? 0 }))
        .filter((t) => t.title)
        .sort((a, b) => a.index - b.index);
      target = tabs[0]?.title ?? '';
    }
    if (!target) return { error: 'không tìm được tab nào' };
    // A1:T25 is the default because the per-day tab's header is all that usually
    // matters. The pivot tabs are much wider and taller ('By categories' is 64 ×
    // 1017), so an explicit range can be passed to look at one of those instead
    // of being told 20 columns is everything there is.
    const a1 = (range ?? 'A1:T25').replace(/[^A-Za-z0-9:]/g, '');
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `'${target}'!${a1 || 'A1:T25'}`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const rows = (res.data.values ?? []) as unknown[][];
    return {
      tab: target,
      returnedRows: rows.length,
      // Only the first 20 columns, trimmed, so the shape is readable.
      sample: rows.map((r, i) => ({
        row: i + 1,
        cells: (r ?? []).slice(0, 20).map((c) => (c === '' || c == null ? null : String(c).slice(0, 26))),
      })),
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}


/**
 * Tên tab đã khai → tên tab CÓ THẬT trong spreadsheet.
 *
 * Một lượt gọi metadata, và nó thay cho cả nhánh dự phòng cũ: tab bị đổi tên
 * hay bị xoá thì đơn giản là không được xin, thay vì làm hỏng cả batch rồi kéo
 * mọi request xuống đường 28 lượt gọi.
 *
 * Khớp không phân biệt hoa thường và bỏ khoảng trắng thừa, vì đây đúng là chỗ
 * người ta gõ tay: 'Countries performance' với 'Countries Performance' là cùng
 * một tab, và im lặng trả 0 dòng vì một chữ hoa là kiểu hỏng tệ nhất.
 */
async function resolveTabTitles(): Promise<Map<TabName, string> | null> {
  try {
    const sheets = getSheetsClient();
    const info = await sheets.spreadsheets.get({
      spreadsheetId: getSpreadsheetId(),
      fields: 'sheets.properties(title)',
    });
    const real = new Map<string, string>();
    for (const sh of info.data.sheets ?? []) {
      const t = sh.properties?.title;
      if (t) real.set(t.trim().toLowerCase(), t);
    }
    const out = new Map<TabName, string>();
    for (const tab of TABS) {
      const names = [tab, ...(LEGACY_TAB_NAMES[tab] ?? [])];
      for (const n of names) {
        const hit = real.get(n.trim().toLowerCase());
        if (hit) {
          out.set(tab, hit);
          break;
        }
      }
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Tab nào đọc ra rỗng thì thử tên cũ của nó.
 *
 * Chỉ còn dùng khi không đọc được metadata. Chạy sau khi đã đọc xong nên tab
 * còn tên hiện tại không tốn thêm lượt nào.
 */
async function fillFromLegacyNames(result: Record<string, string[][]>): Promise<void> {
  await Promise.all(
    (Object.entries(LEGACY_TAB_NAMES) as [TabName, string[]][]).map(async ([tab, olds]) => {
      if ((result[tab]?.length ?? 0) > 0) return;
      for (const old of olds) {
        try {
          const rows = await fetchTab(old);
          if (rows.length > 0) {
            result[tab] = rows;
            return;
          }
        } catch {
          // Tên cũ không còn — đúng như mong đợi sau khi đổi tên xong.
        }
      }
    }),
  );
}

/** Tab đã khai nhưng không có trong spreadsheet, từ lần đọc gần nhất. */
let lastMissingTabs: string[] = [];
export const getMissingTabs = (): string[] => [...lastMissingTabs];

export async function fetchAllTabs(): Promise<Record<string, string[][]>> {
  const sheets = getSheetsClient();
  const result: Record<string, string[][]> = {};
  const titles = await resolveTabTitles();

  // Chỉ xin tab có thật. Tab không có thì để mảng rỗng — parser nào đọc nó sẽ
  // trả về rỗng, và DataGapNote báo 'nguồn rỗng' đúng như nó vốn làm.
  const wanted: { tab: TabName; title: string }[] = titles
    ? TABS.flatMap((t) => {
        const title = titles.get(t);
        return title ? [{ tab: t, title }] : [];
      })
    : TABS.map((t) => ({ tab: t, title: t }));
  lastMissingTabs = titles ? TABS.filter((t) => !titles.has(t)) : [];
  for (const t of TABS) result[t] = [];

  try {
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: getSpreadsheetId(),
      ranges: wanted.map((w) => `${a1Tab(w.title)}!A:Z`),
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    (res.data.valueRanges || []).forEach((vr, i) => {
      const w = wanted[i];
      if (w) result[w.tab] = (vr.values || []) as string[][];
    });
    if (!titles) await fillFromLegacyNames(result);
    return result;
  } catch {
    // Chỉ tới đây khi chính batchGet hỏng (quota, mạng) — không còn vì một tab
    // sai tên nữa.
    await Promise.all(
      wanted.map(async (w) => {
        try {
          result[w.tab] = await fetchTab(w.title);
        } catch {
          result[w.tab] = [];
        }
      }),
    );
    if (!titles) await fillFromLegacyNames(result);
    return result;
  }
}

/**
 * The 'By categories' pivot of the Shopify Ads spreadsheet — a dashboard Trang
 * built there by hand (Apps Script), read so it can be shown alongside the rest.
 *
 * Deliberately read, never recomputed. The numbers are hers; this dashboard's job
 * is to display them, the same rule the 'Max bid cap' screens follow. Recomputing
 * would produce a second set of figures that disagrees with her sheet in small
 * ways and leaves nobody sure which is right.
 *
 * Layout (verified live 2026-09-08, re-checked 2026-09-11): data occupied
 * A1:T111 in August; in September the pivot grew a t9 column so '% growth'
 * moved to U and a free-text note sits in V. Read to AD so the next month's
 * column lands inside the range instead of being read as '% growth' — which
 * is exactly what happened to t9 for three days.
 *   A1        'Date range' + two Excel serials — the window the left block covers
 *   A7:J15    left block: one row per category, current-window snapshot
 *   K/L..T    right block: nine metric tiers stacked down the sheet, each with a
 *             't1…t8 | % growth' header and one row per category
 * Row positions are NOT hardcoded — tiers are found by their label in column L,
 * so inserting a row above them doesn't silently shift every reading by one.
 */
export async function fetchShopifyByCategoryRows(): Promise<unknown[][]> {
  const id = process.env.GOOGLE_SHEET_ID_SHOPIFY?.trim();
  if (!id) return [];
  try {
    const sheets = getSheetsClient();
    // Located by NAME here, unlike the per-day reader which takes the first tab
    // by position: this is a specific pivot, not "whatever the current year is".
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `'By categories'!A1:AD120`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    return (res.data.values ?? []) as unknown[][];
  } catch (e) {
    // A renamed or deleted tab must not take the whole payload down with it —
    // every other screen still works without this one.
    console.error('fetchShopifyByCategoryRows failed:', (e as Error).message);
    return [];
  }
}
