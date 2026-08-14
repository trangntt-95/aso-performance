import { google } from 'googleapis';
import {
  EMPTY_GOOGLE_ADS,
  type AdDestination,
  type GoogleAdsPayload,
} from './googleAdsTypes';

/** Percent columns arrive as 0–1 from Google, but a stray 0–100 export would
 *  silently multiply every rate by a hundred — clamp to the fraction form. */
function pct(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[%,]/g, ''));
  if (!Number.isFinite(n)) return null;
  return n > 1.0000001 ? n / 100 : n;
}

// Reader + parser for the Google Ads export spreadsheet.
//
// Kept apart from lib/sheets/client.ts because it targets a different file with
// a different schema, and because every one of its tabs is optional: a missing
// or unreadable sheet must degrade to an empty payload, never break /api/sheets.

// Every tab the export script is known to be able to write. Which of them
// actually exist varies by run, so the reader asks the spreadsheet what it has
// rather than assuming: batchGet rejects the WHOLE request if a single range
// names a missing sheet, so one absent tab used to cost us all of them.
const TABS = [
  'campaign_daily',
  'campaign_share_daily',
  'search_term_daily',
  'conv_action_daily',
  'landing_page_expanded',
  'landing_page_daily',
  'keyword_daily',
  'keyword_quality_daily',
  'adgroup_daily',
  'adgroup_share_daily',
  'campaign_device_daily',
  'campaign_bidding_daily',
  'country_daily',
  'dim_country',
  'change_history',
  'rsa_asset_daily',
  'asset_fieldtype_daily',
  '_meta',
] as const;

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!email || !rawKey) return null;
  return new google.auth.JWT({
    email,
    key: rawKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

/** Rows keyed by tab name; empty when the sheet isn't configured or readable. */
export async function fetchGoogleAdsTabs(): Promise<Record<string, unknown[][]>> {
  // Trimmed: a value set through a shell pipe can carry a trailing newline,
  // which the Sheets API rejects as a malformed spreadsheet id.
  const id = process.env.GOOGLE_SHEET_ID_GADS?.trim();
  const jwt = auth();
  if (!id || !jwt) return {};
  try {
    const sheets = google.sheets({ version: 'v4', auth: jwt });
    // Ask first, read second.
    const info = await sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets.properties.title',
    });
    const present = new Set(
      (info.data.sheets ?? [])
        .map((sh) => sh.properties?.title?.trim() ?? '')
        .filter(Boolean),
    );
    const wanted = TABS.filter((t) => present.has(t));
    if (wanted.length === 0) return {};
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: id,
      // Widened from A:P — keyword_quality_daily and country_daily carry more
      // columns than the first five tabs did.
      ranges: wanted.map((t) => `${t}!A:Z`),
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const out: Record<string, unknown[][]> = {};
    (res.data.valueRanges ?? []).forEach((vr, i) => {
      out[wanted[i]] = (vr.values ?? []) as unknown[][];
    });
    return out;
  } catch (e) {
    console.error('fetchGoogleAdsTabs failed:', (e as Error).message);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Dates arrive either as ISO text or as an Excel serial, depending on the cell. */
function isoDate(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 90000) {
    return new Date(EXCEL_EPOCH_MS + v * 86400000).toISOString().slice(0, 10);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(v));
  return m ? m[0] : null;
}

/** Column index by header name, so a reordered export doesn't shift the data. */
function indexer(header: unknown[]): (name: string) => number {
  const map = new Map<string, number>();
  header.forEach((h, i) => {
    const k = str(h).toLowerCase();
    if (k && !map.has(k)) map.set(k, i);
  });
  return (name) => map.get(name.toLowerCase()) ?? -1;
}

function rowsOf(raw: unknown[][] | undefined): { at: (n: string) => number; body: unknown[][] } | null {
  if (!raw || raw.length < 2) return null;
  return { at: indexer(raw[0]), body: raw.slice(1) };
}

/**
 * Bucket a landing page by where it sent the click. This is the one real join
 * to the rest of the dashboard: about half of Google Ads spend goes straight to
 * the Shopify app listing that every ASO table already measures.
 */
function destinationOf(url: string): AdDestination {
  const u = url.toLowerCase();
  if (u.includes('apps.shopify.com')) return 'appstore';
  if (u.includes('trueprofit.io')) return 'website';
  return 'other';
}

export function parseGoogleAds(raw: Record<string, unknown[][]>): GoogleAdsPayload {
  if (!raw || Object.keys(raw).length === 0) return EMPTY_GOOGLE_ADS;
  const out: GoogleAdsPayload = {
    ...EMPTY_GOOGLE_ADS,
    campaigns: [],
    share: [],
    searchTerms: [],
    convActions: [],
    landing: [],
    keywords: [],
    countries: [],
    bidding: [],
    devices: [],
    assets: [],
  };

  const camp = rowsOf(raw['campaign_daily']);
  if (camp) {
    const { at, body } = camp;
    for (const r of body) {
      const date = isoDate(r[at('date')]);
      const name = str(r[at('campaign_name')]);
      if (!date || !name) continue;
      out.campaigns.push({
        date,
        campaignId: str(r[at('campaign_id')]),
        campaignName: name,
        status: str(r[at('status')]),
        channel: str(r[at('channel')]),
        budget: num(r[at('budget')]),
        impressions: num(r[at('impressions')]),
        clicks: num(r[at('clicks')]),
        cost: num(r[at('cost')]),
        conversions: num(r[at('conversions')]),
        convValue: num(r[at('conv_value')]),
      });
    }
  }

  const share = rowsOf(raw['campaign_share_daily']);
  if (share) {
    const { at, body } = share;
    // Header names are imp_share / lost_budget / lost_rank. The earlier guesses
    // ('is', 'is_lost_budget', 'is_lost_rank') matched no column, so every one
    // of these read null and the impression-loss diagnosis could never fire.
    for (const r of body) {
      const date = isoDate(r[at('date')]);
      const name = str(r[at('campaign_name')]);
      if (!date || !name) continue;
      out.share.push({
        date,
        campaignName: name,
        is: pct(r[at('imp_share')]),
        isLostBudget: pct(r[at('lost_budget')]),
        isLostRank: pct(r[at('lost_rank')]),
        absTopIs: pct(r[at('abs_top_is')]),
        topIs: pct(r[at('top_is')]),
        clickShare: pct(r[at('click_share')]),
        exactMatchIs: pct(r[at('exact_match_is')]),
        impressions: num(r[at('impressions')]),
        clicks: num(r[at('clicks')]),
        cost: num(r[at('cost')]),
      });
    }
  }

  const term = rowsOf(raw['search_term_daily']);
  if (term) {
    const { at, body } = term;
    for (const r of body) {
      const date = isoDate(r[at('date')]);
      const t = str(r[at('search_term')]);
      if (!date || !t) continue;
      out.searchTerms.push({
        date,
        campaignName: str(r[at('campaign_name')]),
        adgroupName: str(r[at('adgroup_name')]),
        searchTerm: t,
        termStatus: str(r[at('term_status')]),
        impressions: num(r[at('impressions')]),
        clicks: num(r[at('clicks')]),
        cost: num(r[at('cost')]),
        conversions: num(r[at('conversions')]),
      });
    }
  }

  const conv = rowsOf(raw['conv_action_daily']);
  if (conv) {
    const { at, body } = conv;
    for (const r of body) {
      const date = isoDate(r[at('date')]);
      const action = str(r[at('action_name')]);
      if (!date || !action) continue;
      out.convActions.push({
        date,
        campaignName: str(r[at('campaign_name')]),
        actionName: action,
        actionCat: str(r[at('action_cat')]),
        conversions: num(r[at('conversions')]),
        convValue: num(r[at('conv_value')]),
      });
    }
  }

  const land = rowsOf(raw['landing_page_expanded']);
  if (land) {
    const { at, body } = land;
    // Collapse to (date, campaign, destination): the full URLs are long, highly
    // repetitive and never displayed, so shipping them would cost ~10x the size
    // for no gain.
    const acc = new Map<string, { impressions: number; clicks: number; cost: number; conversions: number }>();
    for (const r of body) {
      const date = isoDate(r[at('date')]);
      const name = str(r[at('campaign_name')]);
      if (!date || !name) continue;
      const dest = destinationOf(str(r[at('landing_page')]));
      const key = `${date}|${name}|${dest}`;
      const e = acc.get(key) ?? { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
      e.impressions += num(r[at('impressions')]);
      e.clicks += num(r[at('clicks')]);
      e.cost += num(r[at('cost')]);
      e.conversions += num(r[at('conversions')]);
      acc.set(key, e);
    }
    acc.forEach((v, key) => {
      const [date, campaignName, dest] = key.split('|');
      out.landing.push({ date, campaignName, destination: dest as AdDestination, ...v });
    });
  }

  // Keyword × day with Quality Score. 'keyword_quality_daily' is a superset of
  // 'keyword_daily' (same rows plus the QS columns), so it wins when present and
  // the plain tab is only a fallback.
  const kwTab = raw['keyword_quality_daily'] ?? raw['keyword_daily'];
  const kw = rowsOf(kwTab);
  if (kw) {
    const { at, body } = kw;
    for (const r of body) {
      const date = isoDate(r[at('date')]);
      const term = str(r[at('keyword')]);
      if (!date || !term) continue;
      out.keywords.push({
        date,
        campaignName: str(r[at('campaign_name')]),
        adgroupName: str(r[at('adgroup_name')]),
        keyword: term,
        matchType: str(r[at('match_type')]),
        impressions: num(r[at('impressions')]),
        clicks: num(r[at('clicks')]),
        cost: num(r[at('cost')]),
        conversions: num(r[at('conversions')]),
        qs: numOrNull(r[at('qs')]),
        qsAd: str(r[at('qs_ad')]),
        qsLp: str(r[at('qs_lp')]),
        qsCtr: str(r[at('qs_ctr')]),
        impShare: pct(r[at('imp_share')]),
        lostRank: pct(r[at('lost_rank')]),
        absTopIs: pct(r[at('abs_top_is')]),
      });
    }
  }

  // country_daily keys on Google's numeric geo-target id; dim_country turns it
  // into the country name that PerGeo_CPI_Cap and the ASO tables use.
  const dim = rowsOf(raw['dim_country']);
  const countryById = new Map<string, { name: string; code: string }>();
  if (dim) {
    const { at, body } = dim;
    for (const r of body) {
      const id = str(r[at('country_id')]);
      if (!id) continue;
      countryById.set(id, { name: str(r[at('country_name')]), code: str(r[at('country_code')]) });
    }
  }

  const ctry = rowsOf(raw['country_daily']);
  if (ctry) {
    const { at, body } = ctry;
    for (const r of body) {
      const date = isoDate(r[at('date')]);
      const id = str(r[at('country_id')]);
      if (!date || !id) continue;
      const d = countryById.get(id);
      out.countries.push({
        date,
        campaignName: str(r[at('campaign_name')]),
        countryId: id,
        countryName: d?.name ?? '',
        countryCode: d?.code ?? '',
        impressions: num(r[at('impressions')]),
        clicks: num(r[at('clicks')]),
        cost: num(r[at('cost')]),
        conversions: num(r[at('conversions')]),
        convValue: num(r[at('conv_value')]),
      });
    }
  }

  const bid = rowsOf(raw['campaign_bidding_daily']);
  if (bid) {
    const { at, body } = bid;
    for (const r of body) {
      const date = isoDate(r[at('date')]);
      const name = str(r[at('campaign_name')]);
      if (!date || !name) continue;
      // Google exposes the target under a different column per strategy; take
      // whichever one is populated rather than assuming the strategy.
      const targetCpa = num(r[at('tcpa')]) || num(r[at('maxconv_tcpa')]);
      const targetRoas = num(r[at('troas')]) || num(r[at('maxval_troas')]);
      out.bidding.push({
        date,
        campaignName: name,
        bidStrategy: str(r[at('bid_strategy')]),
        portfolio: str(r[at('portfolio')]),
        targetCpa,
        targetRoas,
        impressions: num(r[at('impressions')]),
        clicks: num(r[at('clicks')]),
        cost: num(r[at('cost')]),
        conversions: num(r[at('conversions')]),
      });
    }
  }

  const dev = rowsOf(raw['campaign_device_daily']);
  if (dev) {
    const { at, body } = dev;
    for (const r of body) {
      const date = isoDate(r[at('date')]);
      const name = str(r[at('campaign_name')]);
      if (!date || !name) continue;
      out.devices.push({
        date,
        campaignName: name,
        device: str(r[at('device')]),
        impressions: num(r[at('impressions')]),
        clicks: num(r[at('clicks')]),
        cost: num(r[at('cost')]),
        conversions: num(r[at('conversions')]),
      });
    }
  }

  // Assets are the biggest tab by far (3k+ rows of mostly-repeated text) and
  // nothing downstream needs them per day, so they collapse to one row per
  // asset with its latest performance label.
  const asset = rowsOf(raw['rsa_asset_daily']);
  if (asset) {
    const { at, body } = asset;
    const acc = new Map<string, GoogleAdsPayload['assets'][number]>();
    for (const r of body) {
      const date = isoDate(r[at('date')]);
      const id = str(r[at('asset_id')]);
      if (!date || !id) continue;
      const key = `${str(r[at('campaign_name')])}|${str(r[at('adgroup_name')])}|${id}`;
      const prev = acc.get(key);
      if (prev) {
        prev.impressions += num(r[at('impressions')]);
        prev.clicks += num(r[at('clicks')]);
        prev.conversions += num(r[at('conversions')]);
        // Keep the most recent label — Google revises it as data accumulates.
        if (date >= prev.date) {
          prev.date = date;
          prev.perfLabel = str(r[at('perf_label')]);
        }
        continue;
      }
      acc.set(key, {
        date,
        campaignName: str(r[at('campaign_name')]),
        adgroupName: str(r[at('adgroup_name')]),
        fieldType: str(r[at('field_type')]),
        perfLabel: str(r[at('perf_label')]),
        assetId: id,
        assetText: str(r[at('asset_text')]),
        impressions: num(r[at('impressions')]),
        clicks: num(r[at('clicks')]),
        conversions: num(r[at('conversions')]),
      });
    }
    out.assets = Array.from(acc.values());
  }

  const meta = rowsOf(raw['_meta']);
  if (meta) {
    const { at, body } = meta;
    // The script appends a row per run; the last one describes the current data.
    for (let i = body.length - 1; i >= 0; i--) {
      const r = body[i];
      if (!r || !str(r[at('account')])) continue;
      out.meta = {
        runAt: str(r[at('run_at')]),
        account: str(r[at('account')]),
        currency: str(r[at('currency')]),
        window: str(r[at('window')]),
      };
      break;
    }
  }

  return out;
}
