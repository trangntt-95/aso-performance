import { google } from 'googleapis';
import { unstable_cache } from 'next/cache';
import type { NetValueRow } from '@/lib/sheets/types';
import { buildNetValueRows, parseLanding, type BqShop, type GaInstall } from '@/lib/market/netValueFromBq';

// IO cho net value tự động: GA4 Data API (install theo keyword) + BigQuery
// (nước, doanh thu, đơn của shop). Dùng CHÍNH service account đang đọc Google
// Sheets (GOOGLE_SERVICE_ACCOUNT_EMAIL / _KEY) — chỉ cần cấp thêm cho email đó:
//   - GA4 property 348654457 ("Shopify Store - GA4"): Viewer
//   - GCP project trueda: roles/bigquery.jobUser
//   - dataset trueda.trueprofit: roles/bigquery.dataViewer
// và đặt env BQ_PROJECT_ID=trueda, GA4_PROPERTY_ID=348654457. Thiếu env → trả
// null, /api/sheets rơi về tab 'Net value per install' như cũ; không bao giờ
// làm trắng dashboard vì một bên hỏng.
//
// Kết quả cache 24 giờ (unstable_cache) — số này đổi theo ngày, không theo
// lần bấm Refresh. Cron trong vercel.json gọi /api/net-value?refresh=1 mỗi
// sáng để làm ấm cache trước khi Trang mở dashboard.

const SCOPES = [
  'https://www.googleapis.com/auth/bigquery.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
];

export const NET_VALUE_FROM = '2026-01-01';

export interface NetValueAutoResult {
  rows: NetValueRow[];
  scope: string;
  asOf: string;
  stats: { installs: number; payingShops: number; netValue: number; shopsMissingCountry: number; testShopsDropped: number; gaRows: number; bqShops: number };
  computedAt: string;
}

export function netValueAutoConfigured(): boolean {
  return (
    (process.env.NET_VALUE_SOURCE ?? 'bigquery') !== 'sheet' &&
    !!process.env.BQ_PROJECT_ID?.trim() &&
    !!process.env.GA4_PROPERTY_ID?.trim() &&
    !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  );
}

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!email || !rawKey) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY');
  return new google.auth.JWT({ email, key: rawKey.replace(/\\n/g, '\n'), scopes: SCOPES });
}

const yesterdayIso = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

/** Install từ GA4: shop_id × landing page × tháng, chỉ event shopify_app_install trên search / search_ad. */
async function fetchGaInstalls(jwt: InstanceType<typeof google.auth.JWT>, to: string): Promise<GaInstall[]> {
  const property = `properties/${process.env.GA4_PROPERTY_ID!.trim()}`;
  const data = google.analyticsdata({ version: 'v1beta', auth: jwt });
  const out: GaInstall[] = [];
  let offset = 0;
  const limit = 100000;
  for (;;) {
    const res = await data.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate: NET_VALUE_FROM, endDate: to }],
        dimensions: [{ name: 'customEvent:shop_id' }, { name: 'landingPagePlusQueryString' }, { name: 'yearMonth' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'shopify_app_install' } } },
              { filter: { fieldName: 'landingPagePlusQueryString', stringFilter: { matchType: 'CONTAINS', value: 'surface_type=search' } } },
            ],
          },
        },
        limit: String(limit),
        offset: String(offset),
      },
    });
    const rows = res.data.rows ?? [];
    for (const r of rows) {
      const shopId = r.dimensionValues?.[0]?.value ?? '';
      const lp = r.dimensionValues?.[1]?.value ?? '';
      const yearMonth = r.dimensionValues?.[2]?.value ?? '';
      if (!shopId || shopId === '(not set)') continue;
      const { surface, keywordRaw } = parseLanding(lp);
      if ((surface !== 'search' && surface !== 'search_ad') || !keywordRaw) continue;
      out.push({ shopId, surface, keywordRaw, yearMonth });
    }
    const total = Number(res.data.rowCount ?? 0);
    offset += rows.length;
    if (rows.length === 0 || offset >= total) break;
  }
  return out;
}

/** Nước, doanh thu từ 01/01/2026, đơn 30 ngày, cờ test — cho đúng các shop đã cài. */
async function fetchBqShops(jwt: InstanceType<typeof google.auth.JWT>, shopIds: string[]): Promise<Map<string, BqShop>> {
  const projectId = process.env.BQ_PROJECT_ID!.trim();
  const bq = google.bigquery({ version: 'v2', auth: jwt });
  const sql = `
    WITH ids AS (SELECT id FROM UNNEST(@ids) AS id),
    tx AS (
      SELECT shop_id, SUM(net_amount) AS net, SUM(gross_amount) AS gross,
        COUNTIF(kind = 'AppSubscriptionSale' AND gross_amount > 0) AS paid_tx
      FROM \`trueda.trueprofit.partner_transactions\`
      WHERE DATE(TIMESTAMP_ADD(created_at, INTERVAL 7 HOUR)) >= @from AND shop_id IN (SELECT id FROM ids)
      GROUP BY shop_id
    ),
    o30 AS (
      SELECT CAST(ShopID AS STRING) AS shop_id, SUM(TotalOrder) AS orders30
      FROM \`trueda.trueprofit.shop_insights\`
      WHERE Date >= FORMAT_DATE('%Y-%m-%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
        AND CAST(ShopID AS STRING) IN (SELECT id FROM ids)
      GROUP BY 1
    )
    SELECT ids.id AS shop_id, s.CountryName AS country,
      IFNULL(tx.net, 0) AS net, IFNULL(tx.gross, 0) AS gross, IFNULL(tx.paid_tx, 0) > 0 AS paying,
      IFNULL(o30.orders30, 0) AS orders30, t.shop_id IS NOT NULL AS is_test
    FROM ids
    LEFT JOIN \`trueda.trueprofit.shops\` s ON CAST(s.ID AS STRING) = ids.id
    LEFT JOIN tx ON tx.shop_id = ids.id
    LEFT JOIN o30 ON o30.shop_id = ids.id
    LEFT JOIN \`trueda.trueprofit.testing_shops\` t ON t.shop_id = ids.id`;
  const res = await bq.jobs.query({
    projectId,
    requestBody: {
      query: sql,
      useLegacySql: false,
      maxResults: 100000,
      timeoutMs: 60000,
      queryParameters: [
        { name: 'ids', parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } }, parameterValue: { arrayValues: shopIds.map((v) => ({ value: v })) } },
        { name: 'from', parameterType: { type: 'DATE' }, parameterValue: { value: NET_VALUE_FROM } },
      ],
    },
  });
  if (!res.data.jobComplete) throw new Error('BigQuery job chưa hoàn tất trong 60s');
  const fields = (res.data.schema?.fields ?? []).map((f) => f.name ?? '');
  const out = new Map<string, BqShop>();
  for (const r of res.data.rows ?? []) {
    const rec: Record<string, string | null> = {};
    (r.f ?? []).forEach((cell, i) => { rec[fields[i]] = (cell.v as string | null) ?? null; });
    const id = rec.shop_id ?? '';
    if (!id) continue;
    out.set(id, {
      shopId: id,
      country: rec.country,
      net: Number(rec.net ?? 0),
      gross: Number(rec.gross ?? 0),
      paying: rec.paying === 'true',
      orders30: Number(rec.orders30 ?? 0),
      isTest: rec.is_test === 'true',
    });
  }
  return out;
}

async function computeNetValueAuto(clusterOf?: (kw: string) => string | undefined): Promise<NetValueAutoResult> {
  const jwt = auth();
  const to = yesterdayIso();
  const installs = await fetchGaInstalls(jwt, to);
  const ids = Array.from(new Set(installs.map((i) => i.shopId)));
  const shops = ids.length > 0 ? await fetchBqShops(jwt, ids) : new Map<string, BqShop>();
  const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const built = buildNetValueRows(installs, shops, { fromLabel: dmy(NET_VALUE_FROM), toLabel: dmy(to), clusterOf });
  return {
    rows: built.rows,
    scope: built.scope,
    asOf: to,
    stats: { ...built.stats, gaRows: installs.length, bqShops: shops.size },
    computedAt: new Date().toISOString(),
  };
}

/**
 * Bản cache 24 giờ. Tag 'net-value' để cron / ?refresh=1 làm mới. `clusterOf`
 * không vào cache key: cluster chỉ là nhãn, lấy từ tab cũ lúc gọi.
 */
export const getNetValueAuto = unstable_cache(
  async () => computeNetValueAuto(),
  ['net-value-auto', NET_VALUE_FROM],
  { revalidate: 86400, tags: ['net-value'] },
);

/** Gắn cluster từ tab cũ vào kết quả cache (không tính lại). */
export function withClusters(result: NetValueAutoResult, clusterOf: (kw: string) => string | undefined): NetValueAutoResult {
  return { ...result, rows: result.rows.map((r) => (r.cluster ? r : { ...r, cluster: clusterOf(r.keywordDecoded || r.keyword) ?? '' })) };
}
