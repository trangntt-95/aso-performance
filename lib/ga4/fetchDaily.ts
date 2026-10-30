import { google } from 'googleapis';

// Kéo GA4 gốc theo ngày từ GA4 Data API bằng service account và gom thành đúng
// định dạng mà scripts/net-value/build-ga4-daily.mjs / build-ga4-windows.mjs nhận
// (bản TypeScript của scripts/net-value/fetch-ga4.mjs để chạy trong route Vercel):
//   daily   : {date:'YYYYMMDD', surface, kw_raw, users, sessions, pos, installs}
//   country : {date, country, surface, kw_raw, users, pos, installs}

export interface Ga4DailyRow { date: string; surface: string; kw_raw: string; users: number; sessions: number; pos: number | null; installs: number }
export interface Ga4CountryRow { date: string; country: string; surface: string; kw_raw: string; users: number; pos: number | null; installs: number }
export interface Ga4FetchResult { startDate: string; endDate: string; daily: Ga4DailyRow[]; country: Ga4CountryRow[]; quotaRemaining: number | null; log: string[] }

const LP = 'landingPagePlusQueryString';
const searchFilter = { filter: { fieldName: LP, stringFilter: { matchType: 'CONTAINS', value: 'surface_type=search' } } };
const installFilter = {
  andGroup: { expressions: [
    { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'shopify_app_install' } } },
    searchFilter,
  ] },
};

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!email || !rawKey) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY');
  return new google.auth.JWT({ email, key: rawKey.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const param = (lp: string, key: string) => {
  const m = lp.match(new RegExp(`[?&]${key}=([^&]+)`));
  return m ? m[1] : null;
};

type Row = Record<string, string | number>;

export async function fetchGa4Daily(opts: { days?: number; endDate?: string; propertyId?: string } = {}): Promise<Ga4FetchResult> {
  const propertyId = opts.propertyId ?? process.env.GA4_PROPERTY_ID ?? '348654457';
  const days = opts.days ?? 370;
  const endDate = opts.endDate ?? iso(new Date(Date.now() - 86400000));
  const startDate = iso(new Date(Date.parse(endDate) - (days - 1) * 86400000));
  const ga = google.analyticsdata({ version: 'v1beta', auth: auth() });
  const log: string[] = [];
  let quotaRemaining: number | null = null;

  async function runReport(dimensions: string[], metrics: string[], dimensionFilter: unknown, label: string): Promise<Row[]> {
    const PAGE = 100000;
    let offset = 0;
    const rows: Row[] = [];
    for (;;) {
      const res = await ga.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: dimensions.map((name) => ({ name })),
          metrics: metrics.map((name) => ({ name })),
          dimensionFilter: dimensionFilter as never,
          limit: String(PAGE),
          offset: String(offset),
          returnPropertyQuota: true,
        },
      });
      const data = res.data;
      const got = data.rows ?? [];
      for (const r of got) {
        const o: Row = {};
        dimensions.forEach((d, i) => { o[d] = r.dimensionValues?.[i]?.value ?? ''; });
        metrics.forEach((m, i) => { o[m] = Number(r.metricValues?.[i]?.value) || 0; });
        rows.push(o);
      }
      offset += got.length;
      const total = data.rowCount ?? 0;
      const q = data.propertyQuota?.tokensPerDay?.remaining;
      if (typeof q === 'number') quotaRemaining = q;
      if (got.length === 0 || offset >= total) {
        log.push(`${label}: ${rows.length}/${total} rows`);
        return rows;
      }
    }
  }

  type Acc = { date: string; country?: string; surface: string; kw_raw: string; users: number; sessions: number; posW: number; posN: number; installs: number };
  function aggregate(userRows: Row[], installRows: Row[], withCountry: boolean): Acc[] {
    const acc = new Map<string, Acc>();
    const keyOf = (r: Row, s: string, k: string) => (withCountry ? `${r.date}|${r.country}|${s}|${k}` : `${r.date}|${s}|${k}`);
    const base = (r: Row, s: string, k: string): Acc => ({ date: String(r.date), ...(withCountry ? { country: String(r.country) } : {}), surface: s, kw_raw: k, users: 0, sessions: 0, posW: 0, posN: 0, installs: 0 });
    for (const r of userRows) {
      const lp = String(r[LP]);
      const s = param(lp, 'surface_type');
      const k = param(lp, 'surface_detail');
      if (!s || !k || (s !== 'search' && s !== 'search_ad')) continue;
      const e = acc.get(keyOf(r, s, k)) ?? base(r, s, k);
      const u = Number(r.totalUsers) || 0;
      e.users += u;
      e.sessions += Number(r.sessions) || 0;
      const p = Number(param(lp, 'surface_intra_position'));
      if (Number.isFinite(p) && p > 0 && u > 0) { e.posW += p * u; e.posN += u; }
      acc.set(keyOf(r, s, k), e);
    }
    for (const r of installRows) {
      const lp = String(r[LP]);
      const s = param(lp, 'surface_type');
      const k = param(lp, 'surface_detail');
      if (!s || !k || (s !== 'search' && s !== 'search_ad')) continue;
      const e = acc.get(keyOf(r, s, k)) ?? base(r, s, k);
      e.installs += Number(r.eventCount) || 0;
      acc.set(keyOf(r, s, k), e);
    }
    return Array.from(acc.values()).sort((a, b) => a.date.localeCompare(b.date) || a.surface.localeCompare(b.surface) || a.kw_raw.localeCompare(b.kw_raw));
  }

  const lp = await runReport(['date', LP], ['totalUsers', 'sessions'], searchFilter, 'users');
  const inst = await runReport(['date', LP], ['eventCount'], installFilter, 'installs');
  const lpC = await runReport(['date', 'country', LP], ['totalUsers'], searchFilter, 'users×country');
  const instC = await runReport(['date', 'country', LP], ['eventCount'], installFilter, 'installs×country');

  const pos = (e: Acc) => (e.posN > 0 ? Math.round((e.posW / e.posN) * 10000) / 10000 : null);
  const daily: Ga4DailyRow[] = aggregate(lp, inst, false).map((e) => ({ date: e.date, surface: e.surface, kw_raw: e.kw_raw, users: e.users, sessions: e.sessions, pos: pos(e), installs: e.installs }));
  const country: Ga4CountryRow[] = aggregate(lpC, instC, true).map((e) => ({ date: e.date, country: e.country ?? '', surface: e.surface, kw_raw: e.kw_raw, users: e.users, pos: pos(e), installs: e.installs }));
  return { startDate, endDate, daily, country, quotaRemaining, log };
}
