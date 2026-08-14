import { google } from 'googleapis';
import {
  EMPTY_GOOGLE_ADS,
  type AdDestination,
  type GoogleAdsPayload,
} from './googleAdsTypes';

// Reader + parser for the Google Ads export spreadsheet.
//
// Kept apart from lib/sheets/client.ts because it targets a different file with
// a different schema, and because every one of its tabs is optional: a missing
// or unreadable sheet must degrade to an empty payload, never break /api/sheets.

const TABS = [
  'campaign_daily',
  'campaign_share_daily',
  'search_term_daily',
  'conv_action_daily',
  'landing_page_expanded',
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
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: id,
      ranges: TABS.map((t) => `${t}!A:P`),
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const out: Record<string, unknown[][]> = {};
    (res.data.valueRanges ?? []).forEach((vr, i) => {
      out[TABS[i]] = (vr.values ?? []) as unknown[][];
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
  const out: GoogleAdsPayload = { ...EMPTY_GOOGLE_ADS, campaigns: [], share: [], searchTerms: [], convActions: [], landing: [] };

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
    for (const r of body) {
      const date = isoDate(r[at('date')]);
      const name = str(r[at('campaign_name')]);
      if (!date || !name) continue;
      out.share.push({
        date,
        campaignName: name,
        is: numOrNull(r[at('is')]),
        isLostBudget: numOrNull(r[at('is_lost_budget')]),
        isLostRank: numOrNull(r[at('is_lost_rank')]),
        absTopIs: numOrNull(r[at('abs_top_is')]),
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
