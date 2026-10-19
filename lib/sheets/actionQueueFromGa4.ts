import type {
  ActionQueueRow,
  AlertType,
  BidAction,
  BidCapRow,
  Category,
  ExcludedCountryRow,
  KeywordRow,
  MasterKwRow,
  PerGeoRevenueRow,
  Priority,
  SurfaceLabel,
  Window,
} from './types';

// Action_Queue dựng lại từ tab GA4 window (GA4_Country_L*_auto / GA4_All_L*_auto),
// thay tab Action_Queue của Apps Script (Trang 19/10/2026). Logic tự định nghĩa:
//
// 1. Cảnh báo theo window (L7, L14, L30): mọi dòng keyword × nước × kênh có
//    ALERT ≠ OK (ALERT do build-ga4-windows.mjs chấm: users giảm ≥50%, pos tụt
//    ≥1.5×, install giảm ≥50%, CR giảm ≥50%…), thêm dòng toàn cầu "(global)".
// 2. Cơ hội chéo kênh (window "L90+L30"): organic ≥2 install ở một nước trong
//    L90 và còn install trong L30, mà paid ở nước đó không có → "ORG STRONG,
//    PAID MISSING"; paid < 30% users organic → "ORG STRONG, PAID WEAK"; organic
//    pos > 4 → "ORG GOOD, POS LOW" (đẩy paid chiếm top 3).
// 3. Score = impact × urgency × severity × category × country:
//    impact   = |Δusers| + 4·|Δinstall| + 3·(pos tụt) — cơ hội: 4·install + 0.5·users
//    urgency  = L7 1.6 · L14 1.3 · L30 1.0 · L90+L30 0.8
//    severity = 🚨 2.0 · 💔 1.6 · ⚠️ 1.4 · 💸 1.2 · 📉 1.0 · 🎯 1.0 · tin tốt 0.6
//    category = Brand/Profit 1.3 · Competitor 1.1 · Feature 1.0 · Test 0.5 · CPM 0.7 · khác 0.8
//    country  = top 10 doanh thu 1.3 · top 30 1.0 · còn lại 0.8 · (global) 1.0
// 4. Priority: 🚨 hoặc score ≥ 40 (cảnh báo xấu) → P0; ≥ 20 → P1; cơ hội/còn lại
//    ≥ 8 → P2; dưới → P3. Giữ 1 dòng/keyword × nước × kênh (window điểm cao
//    nhất), tối đa 50 dòng. Nước hard-exclude (Vietnam, India…) bị bỏ.

export interface ActionQueueInput {
  allL7: KeywordRow[];
  allL14: KeywordRow[];
  allL30: KeywordRow[];
  countryL7: KeywordRow[];
  countryL14: KeywordRow[];
  countryL30: KeywordRow[];
  countryL90: KeywordRow[];
  masterKwLookup: MasterKwRow[];
  pausedKw: MasterKwRow[];
  bidCap: BidCapRow[];
  perGeoRevenue: PerGeoRevenueRow[];
  excludedCountries: ExcludedCountryRow[];
}

const LIMIT = 50;
const GLOBAL = '(global)';
const ORGANIC_CAMP = '(organic — App Store algo, không action bid)';
const DEFAULT_EXCLUDED = ['Vietnam', 'India'];

const norm = (s: string) => s.toLowerCase().trim();
const isPaid = (r: KeywordRow) => r.surface === 'search_ad';
const label = (r: KeywordRow): SurfaceLabel => (isPaid(r) ? 'paid' : 'organic');

const URGENCY: Record<string, number> = { L7: 1.6, L14: 1.3, L30: 1.0, 'L90+L30': 0.8 };
const CATEGORY_W: Partial<Record<Category, number>> = { Brand: 1.3, Profit: 1.3, Competitor: 1.1, Feature: 1.0, Test: 0.5, CPM: 0.7 };
const NEGATIVE = new Set<AlertType>(['🚨 USER DROP + POS WORSEN', '⚠️ POSITION WORSEN', '💔 INSTALL DROP', '💸 CR DROP', '📉 USER DROP']);
const OPPORTUNITY = new Set<AlertType>(['🎯 ORG STRONG, PAID MISSING', '🎯 ORG STRONG, PAID WEAK', '🎯 ORG GOOD, POS LOW']);

function severity(a: AlertType): number {
  if (a.startsWith('🚨')) return 2.0;
  if (a.startsWith('💔')) return 1.6;
  if (a.startsWith('⚠️')) return 1.4;
  if (a.startsWith('💸')) return 1.2;
  if (a.startsWith('📉') || a.startsWith('🎯')) return 1.0;
  return 0.6;
}

function actionFor(alert: AlertType, surface: SurfaceLabel): { bidAction: BidAction; bidSuggest: string; note: string } {
  const paid = surface === 'paid';
  switch (alert) {
    case '🚨 USER DROP + POS WORSEN':
      return paid
        ? { bidAction: 'RAISE BID', bidSuggest: '+20%', note: 'Pos tụt + users giảm — bảo vệ vị trí: tăng bid ngay' }
        : { bidAction: 'CHECK ORGANIC', bidSuggest: '—', note: 'Organic users + pos cùng giảm → check thuật toán App Store, listing, hoặc mùa vụ' };
    case '⚠️ POSITION WORSEN':
      return paid
        ? { bidAction: 'RAISE BID', bidSuggest: '+15%', note: 'Pos tụt, users chưa giảm mạnh — tăng bid giữ top' }
        : { bidAction: 'CHECK LISTING', bidSuggest: '—', note: 'Organic pos tụt — xem listing / đối thủ mới trong kết quả' };
    case '💔 INSTALL DROP':
      return paid
        ? { bidAction: 'AUDIT KW', bidSuggest: '—', note: 'Install giảm dù traffic còn — soát keyword / match type / landing' }
        : { bidAction: 'REVIEW LISTING', bidSuggest: '—', note: 'Install organic giảm — xem lại listing (ảnh, review, giá)' };
    case '💸 CR DROP':
      return paid
        ? { bidAction: 'AUDIT MATCH TYPE', bidSuggest: '—', note: 'CR giảm — traffic kém chất lượng, soát match type / search term' }
        : { bidAction: 'REVIEW LISTING', bidSuggest: '—', note: 'CR organic giảm — listing hoặc đối thủ mới trong kết quả' };
    case '📉 USER DROP':
      return paid
        ? { bidAction: 'REVIEW PAID BID', bidSuggest: '—', note: 'Users paid giảm, pos giữ — mất impression share hoặc cầu giảm; xem bid / budget' }
        : { bidAction: 'MONITOR ORGANIC', bidSuggest: '—', note: 'Users organic giảm, pos giữ → cầu thị trường giảm, theo dõi' };
    default:
      return paid
        ? { bidAction: 'SCALE', bidSuggest: '+10%', note: 'Đang tăng — cân nhắc scale bid / budget' }
        : { bidAction: 'MONITOR ORGANIC', bidSuggest: '—', note: 'Organic tăng — theo dõi, cân nhắc mở paid' };
  }
}

function priorityOf(alert: AlertType, score: number): Priority {
  if (NEGATIVE.has(alert)) {
    if (alert.startsWith('🚨') || score >= 40) return 'P0';
    if (score >= 20) return 'P1';
    return 'P2';
  }
  if (OPPORTUNITY.has(alert)) return score >= 8 ? 'P2' : 'P3';
  return 'P3';
}

const fmtPos = (p: number | null) => (p === null ? '—' : p.toFixed(1));
function keyStatsOf(r: { usersL: number; usersP: number; getAppL: number; getAppP: number; posL: number | null; posP: number | null; crL: number | null }): string {
  const parts = [`Users ${r.usersP}→${r.usersL}`, `GetApp ${r.getAppP}→${r.getAppL}`];
  if (r.posL !== null || r.posP !== null) parts.push(`Pos ${fmtPos(r.posP)}→${fmtPos(r.posL)}`);
  if (r.crL !== null) parts.push(`CR ${(r.crL * 100).toFixed(1)}%`);
  return parts.join(' | ');
}

interface Candidate extends ActionQueueRow { dedupeKey: string }

export function actionQueueFromGa4(input: ActionQueueInput): ActionQueueRow[] {
  const excluded = new Set<string>(DEFAULT_EXCLUDED.map(norm));
  for (const c of input.excludedCountries) if (c.hardExclude) excluded.add(norm(c.country.replace(/\s*\(.*$/, '')));
  const isExcluded = (country: string) => country !== GLOBAL && excluded.has(norm(country));

  const geoRank = new Map<string, number>();
  for (const g of input.perGeoRevenue) geoRank.set(norm(g.country), g.rank);
  const countryW = (country: string) => {
    if (country === GLOBAL) return 1.0;
    const rk = geoRank.get(norm(country));
    if (rk === undefined) return 0.8;
    return rk <= 10 ? 1.3 : rk <= 30 ? 1.0 : 0.8;
  };

  const activeCamps = new Map<string, string[]>();
  for (const m of input.masterKwLookup) {
    const k = norm(m.keyword);
    const list = activeCamps.get(k) ?? [];
    if (m.camp && !list.includes(m.camp)) list.push(m.camp);
    activeCamps.set(k, list);
  }
  const pausedCamps = new Map<string, string>();
  for (const m of input.pausedKw) {
    const k = norm(m.keyword);
    if (m.camp && !pausedCamps.has(k)) pausedCamps.set(k, m.camp);
  }
  const campFor = (keyword: string, category: Category, expand: boolean): string => {
    const k = norm(keyword);
    const active = activeCamps.get(k);
    if (active && active.length > 0) return expand ? `${active.slice(0, 2).join(' | ')} — kiểm tra geo` : active.slice(0, 2).join(' | ');
    const paused = pausedCamps.get(k);
    if (paused) return `${paused} (đã pause)`;
    return expand ? `(thêm vào camp ${category})` : '(không thấy trong Master)';
  };

  // Bid gợi ý khi mở paid: Max bid cap theo nước × category.
  const capByCountryCat = new Map<string, number[]>();
  for (const b of input.bidCap) {
    if (!(b.bidRecommended > 0)) continue;
    const k = `${norm(b.country)}|${norm(b.category)}`;
    const list = capByCountryCat.get(k) ?? [];
    list.push(b.bidRecommended);
    capByCountryCat.set(k, list);
  }
  const expandBid = (country: string, category: Category): string => {
    const list = capByCountryCat.get(`${norm(country)}|${norm(category)}`);
    if (!list || list.length === 0) return '—';
    const lo = Math.min(...list), hi = Math.max(...list);
    return lo === hi ? `$${lo.toFixed(1)}` : `$${lo.toFixed(1)}-${hi.toFixed(1)}`;
  };

  const out: Candidate[] = [];

  // 1. Cảnh báo theo window.
  const windows: [Window, KeywordRow[], KeywordRow[]][] = [
    ['L7', input.countryL7, input.allL7],
    ['L14', input.countryL14, input.allL14],
    ['L30', input.countryL30, input.allL30],
  ];
  for (const [w, countryRows, allRows] of windows) {
    const rows = countryRows.concat(allRows.map((r) => ({ ...r, country: GLOBAL })));
    for (const r of rows) {
      if (r.alert === 'OK' || r.category === 'Noise') continue;
      const country = r.country || GLOBAL;
      if (isExcluded(country)) continue;
      const sf = label(r);
      const posWorse = r.posL !== null && r.posP !== null && r.posL > r.posP ? r.posL - r.posP : 0;
      const impact = Math.abs(r.usersL - r.usersP) + 4 * Math.abs(r.getAppL - r.getAppP) + 3 * posWorse;
      const score = Math.round(impact * URGENCY[w] * severity(r.alert) * (CATEGORY_W[r.category] ?? 0.8) * countryW(country));
      if (score <= 0) continue;
      const act = actionFor(r.alert, sf);
      out.push({
        dedupeKey: `${norm(r.searchTerm)}|${country}|${sf}`,
        priority: priorityOf(r.alert, score),
        score,
        category: r.category,
        keyword: r.searchTerm,
        surface: sf,
        country,
        window: w,
        alert: r.alert,
        bidAction: act.bidAction,
        bidSuggest: act.bidSuggest,
        targetCamp: sf === 'paid' ? campFor(r.searchTerm, r.category, false) : ORGANIC_CAMP,
        note: act.note,
        keyStats: keyStatsOf(r),
      });
    }
  }

  // 2. Cơ hội chéo kênh: organic mạnh ở nước mà paid thiếu / yếu.
  const alive30 = new Set<string>();
  for (const r of input.countryL30) if (!isPaid(r) && r.getAppL >= 1 && r.country) alive30.add(`${norm(r.searchTerm)}|${norm(r.country)}`);
  const pairs = new Map<string, { org?: KeywordRow; paid?: KeywordRow }>();
  for (const r of input.countryL90) {
    if (!r.country || r.category === 'Noise') continue;
    const k = `${norm(r.searchTerm)}|${norm(r.country)}`;
    const p = pairs.get(k) ?? {};
    if (isPaid(r)) p.paid = r; else p.org = r;
    pairs.set(k, p);
  }
  for (const [k, { org, paid }] of Array.from(pairs.entries())) {
    if (!org || org.getAppL < 2 || !alive30.has(k)) continue;
    const country = org.country!;
    if (isExcluded(country)) continue;
    let alert: AlertType;
    let bidAction: BidAction;
    let bidSuggest: string;
    let note: string;
    const cr = org.usersL > 0 ? `${((org.getAppL / org.usersL) * 100).toFixed(1)}%` : '—';
    const posTxt = fmtPos(org.posL);
    const lowPos = org.posL !== null && org.posL > 4;
    if (!paid || paid.usersL === 0) {
      alert = '🎯 ORG STRONG, PAID MISSING';
      bidAction = 'EXPAND TO PAID';
      bidSuggest = expandBid(country, org.category);
      note =
        `Organic GetApp ${org.getAppL} ở ${country} (CR ${cr}), GA4 KHÔNG thấy paid traffic nước này. Organic pos ${posTxt}.` +
        (lowPos ? ' Org pos > 4 → paid càng cần để chiếm top 3.' : '') +
        ' ⚠️ VERIFY trong Shopify Ads: chưa bid → thêm KW vào camp geo; đã bid mà 0 imp → tăng bid hoặc check geo exclusion.';
    } else if (paid.usersL < org.usersL * 0.3) {
      alert = '🎯 ORG STRONG, PAID WEAK';
      bidAction = 'RAISE BID PAID';
      bidSuggest = '+15%';
      note = `Organic ${org.usersL} users / ${org.getAppL} install nhưng paid chỉ ${paid.usersL} users ở ${country} — paid chưa phủ, tăng bid hoặc check camp geo.`;
    } else if (lowPos) {
      alert = '🎯 ORG GOOD, POS LOW';
      bidAction = 'RAISE BID PAID';
      bidSuggest = '+10%';
      note = `Organic pos ${posTxt} (>4) nhưng vẫn ra ${org.getAppL} install ở ${country} — paid đã có (${paid.usersL} users), đẩy bid để chiếm top 3.`;
    } else {
      continue;
    }
    const impact = 4 * org.getAppL + 0.5 * org.usersL;
    const score = Math.round(impact * URGENCY['L90+L30'] * severity(alert) * (CATEGORY_W[org.category] ?? 0.8) * countryW(country));
    if (score <= 0) continue;
    out.push({
      dedupeKey: `${norm(org.searchTerm)}|${country}|paid`,
      priority: priorityOf(alert, score),
      score,
      category: org.category,
      keyword: org.searchTerm,
      surface: 'paid',
      country,
      window: 'L90+L30',
      alert,
      bidAction,
      bidSuggest,
      targetCamp: campFor(org.searchTerm, org.category, bidAction === 'EXPAND TO PAID'),
      note,
      keyStats: `Org users ${org.usersL} / paid ${paid?.usersL ?? 0} | Org GetApp ${org.getAppL} / paid ${paid?.getAppL ?? 0} | Org pos ${posTxt} / paid ${fmtPos(paid?.posL ?? null)} | Org CR ${cr}`,
    });
  }

  // Dedupe: 1 dòng / keyword × nước × kênh, giữ window điểm cao nhất.
  const best = new Map<string, Candidate>();
  for (const c of out) {
    const cur = best.get(c.dedupeKey);
    if (!cur || c.score > cur.score) best.set(c.dedupeKey, c);
  }
  return Array.from(best.values())
    .sort((a, b) => b.score - a.score || a.keyword.localeCompare(b.keyword))
    .slice(0, LIMIT)
    .map(({ dedupeKey: _k, ...row }) => row);
}
