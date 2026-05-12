# User Story — TrueProfit ASO Dashboard

**Role:** Product Manager
**Persona:** Trang — Performance Marketer at TrueProfit (Shopify Net Profit Analytics App)
**Goal:** Build a web dashboard pulling data from Google Sheets (existing ASO Position Tracker) so I can make paid bidding decisions faster — without scrolling 18 tabs in a spreadsheet every Monday.

---

## 1. Context & Existing System

I already have a working Apps Script ASO tracker writing to a Google Sheet with **18 tabs**. Data is refreshed **daily at 9 AM Vietnam time** by `runDailyFull`, and weekly with email digest by `runWeeklyUpdate` (Mondays). The dashboard must **read from this Google Sheet via API** (Google Sheets API v4 or service account access — no manual export).

**Sheet ID:** [I will provide after deployment]
**Refresh frequency:** Daily at 9 AM VN time (the dashboard should query fresh data, with optional caching ≤ 1 hour)

**Source sheet structure (18 tabs):**

| Tab | Purpose | Key columns |
|---|---|---|
| `Action_Queue` ⭐ TOP PRIORITY | 50 prioritized actions for the week | Priority, Score, Category, Keyword, Surface, Country, Window, ALERT, Bid Action, Bid Suggest, Target Camp, Note, Key Stats |
| `Market_Index` | 5-window market health (L3/L7/L14/L30/L90) + Primary Cause + Funnel Breakdown + Vietnamese Narrative | Window, Δ Users %, Δ GetApp %, VERDICT, PRIMARY CAUSE, Cause Details |
| `Tier1_Market_Watch` | US+UK+CA+AU alerts across 4 windows | Category, Search Term, Country, Surface, Users L/P, Δ Users %, Pos L/P, ALERT |
| `Keyword_Opportunity_Lab` | Theme clusters + Competitor watchlist + Discovery keywords | 3 sub-sections, varies |
| `All_L3/L7/L14/L30/L90` | All keywords aggregate per window | Category, Search Term, Surface, Users L/P, GetApp L/P, CR L/P, Pos L/P, Δ Pos %, Δ Users %, Δ CR %, ALERT, Lang, English |
| `Country_L3/L7/L14/L30/L90` | Same as All_*, split by country | + Country column at position 3 |
| `All_L365` / `Country_L365` | 365-day snapshot, no compare | Category, Search Term, Surface, Users, GetApp, CR, Pos, % Share |
| `History` | Append-only weekly snapshots | Snapshot Date, Search Term, Surface, Users L7D, Pos L7D, Alert |

**Important data conventions:**
- Row 1 = Title (merged), Row 2 = Headers, Row 3 = TOTAL row (aggregate), Row 4+ = Data rows
- All tabs sorted: **Category → ALERT severity → Users L desc**
- Surface values: `search` = organic, `search_ad` = paid
- Categories: Brand, Competitor, Profit, Feature, Language, Others, CPM, Noise, Unknown
- **Filter rule (asymmetric):** paid rows require `users ≥ 1`, organic rows require `users ≥ 1 AND getApp ≥ 1`

---

## 2. User Stories

### Epic 1 — Mobile-first scan (5 minutes Monday morning)

#### Story 1.1 — Action Queue at top
> **As Trang**, when I open the dashboard on Monday morning, **I want** to see the top 50 prioritized actions immediately, **so that** I can scan and action without opening Sheets.

**Acceptance criteria:**
- Default landing view = Action_Queue list, sorted by Priority (P0 → P3) then Score desc
- Each row shows: Priority badge, Score, Category chip, Keyword, Country flag, Surface (organic/paid icon), ALERT (with emoji + color), Bid Action (color-coded), Bid Suggest, Target Camp
- Priority badges color-coded: P0 = dark red, P1 = orange, P2 = yellow, P3 = grey
- ALERT colors match sheet conditional formatting (red for negative, green for positive, blue/teal for 🎯 geo opportunities)
- Bid Action colors: PAUSE/NEGATIVE = red, RAISE BID/EXPAND TO PAID/SCALE = green, REDUCE BID = yellow, REVIEW LISTING/CHECK ORGANIC = grey
- Expand row to see full Note + Key Stats inline
- Filter by: Priority, Category, Surface (organic/paid), Country, ALERT type
- Sort by: any column header click

#### Story 1.2 — Market Index at-a-glance card
> **As Trang**, **I want** to see Market Index summary on top of dashboard, **so that** I know overall market direction in 3 seconds.

**Acceptance criteria:**
- 5 KPI cards horizontal (L3, L7, L14, L30, L90), each showing:
  - VERDICT (with emoji: 📉 MARKET DOWN, ⚠️ SOFT DECLINE, → STABLE, 📈 SOFT GROWTH, 🚀 MARKET UP)
  - Δ Users % (signed, color: red ↓ / green ↑)
  - Δ GetApp % (signed, color)
  - **PRIMARY CAUSE** (one-line, color by severity)
- Click card → expand to Funnel Breakdown (organic vs paid Users / GetApp / CR / Pos)
- Click card → also show Vietnamese Narrative (auto-generated diagnosis + recommended action)

---

### Epic 2 — Deep-dive analysis (15 minutes)

#### Story 2.1 — Funnel Breakdown per window
> **As Trang**, **I want** to see organic vs paid funnel split per window, **so that** I can identify which channel is driving market shift.

**Acceptance criteria:**
- Table layout per window: rows = Users / GetApp / CR / Avg Pos; columns = Organic L, Organic P, Paid L, Paid P, Total L, Total P
- Highlight cells with significant change (≥ 10% delta or CR shift ≥ 3pp)
- Available for all 5 windows (L3, L7, L14, L30, L90)

#### Story 2.2 — Tier 1 Market Watch
> **As Trang**, **I want** to focus on US/UK/CA/AU alerts, **so that** I action high-revenue markets first.

**Acceptance criteria:**
- Filter pre-applied: Country IN (US, UK, CA, AU)
- 4 collapsible sections (L3, L7, L14, L30)
- Each section: keyword list with ALERT badge + bid action suggestion
- Show alert count per window in section header

#### Story 2.3 — Category drill-down
> **As Trang**, **I want** to drill into specific category (Brand/Competitor/Profit/Feature/Language), **so that** I can plan camp restructure.

**Acceptance criteria:**
- Sidebar: 9 categories with count of active keywords
- Click category → show all keywords for that category across windows
- Group by keyword, show Users / GetApp / CR / Pos for L7, L30, L90 side-by-side
- Show "📌 In Paid" / "❌ Not in Paid" badge per (keyword × country)

---

### Epic 3 — Geo opportunity actions (critical workflow)

#### Story 3.1 — Geo Opportunity tab
> **As Trang**, **I want** a dedicated view of all 🎯 geo opportunity alerts (keywords with organic install but paid missing or weak in specific countries), **so that** I can plan paid camp expansion by country.

**Acceptance criteria:**
- Tab filters: ALERT IN (🎯 ORG STRONG PAID MISSING, 🎯 ORG STRONG PAID WEAK)
- Group by Country → list keywords with organic GetApp + paid pos (if exists)
- Each row shows:
  - Keyword + Category
  - Organic stats: Users, GetApp, CR, Pos
  - Paid status: "NOT BID" or "Pos X.X with N GetApp"
  - Suggested Target Camp (specific name based on Geo tier + Category)
  - Suggested bid range ($5-8 / $7-10 / $10-15 by tier)
- Sort by: organic GetApp desc within each country group
- Bulk action: "Mark X keywords as bid" → adds to local TODO list (no write-back to sheet)

#### Story 3.2 — Country-specific opportunity export
> **As Trang**, **I want** to export geo opportunities for a specific country (e.g., France) as CSV, **so that** I can copy-paste keywords into Shopify Ads camp builder.

**Acceptance criteria:**
- Filter by Country, export visible rows as CSV: Keyword, Match Type (default EXACT), Bid (suggested), Country exclusion
- CSV format matches Shopify Ads import structure

---

### Epic 4 — Historical & trend analysis

#### Story 4.1 — Trend chart per keyword
> **As Trang**, **I want** to see how a keyword performed over the past 90 days, **so that** I can decide if a current alert is noise or trend.

**Acceptance criteria:**
- Click any keyword → modal/sidebar with 90-day trend chart
- Lines: Users (organic), Users (paid), GetApp (organic), GetApp (paid), Pos (organic), Pos (paid)
- Data source: `History` tab (weekly snapshots) + L90 latest snapshot
- Annotation: mark alert events (🚨, ⚠️, etc.) on timeline

#### Story 4.2 — WoW comparison
> **As Trang**, **I want** to compare this week's Action_Queue with last week's, **so that** I see which actions I should have done.

**Acceptance criteria:**
- Toggle "Compare with last week"
- Show rows that disappeared (resolved) and new rows (just appeared)
- Highlight repeated alerts (same keyword alerting 2+ weeks in a row = priority escalation)

---

### Epic 5 — Personal workflow

#### Story 5.1 — TODO list / action tracking
> **As Trang**, **I want** to mark Action_Queue items as "Done" / "Skipped" / "In Progress", **so that** I track which actions I executed.

**Acceptance criteria:**
- Each Action_Queue row has status dropdown: New / In Progress / Done / Skipped / Snoozed
- Status persisted locally (localStorage or user account if auth implemented)
- "Done" rows fade but remain visible (don't hide)
- Filter by status

#### Story 5.2 — Personal notes per keyword
> **As Trang**, **I want** to add personal notes to a keyword (e.g., "tested broad match, didn't work"), **so that** I remember context across weeks.

**Acceptance criteria:**
- Click keyword → add personal note in modal
- Notes shown as small icon next to keyword in all views
- Notes persisted locally

---

## 3. Functional Requirements

### 3.1 Data fetching
- **Read from Google Sheets API v4** using service account or OAuth (no public sheet — sheet contains business data)
- Fetch all 18 tabs on dashboard load
- Cache for max 1 hour client-side, refresh button manually triggers reload
- Handle missing/malformed rows gracefully (skip, don't crash)
- Parse `(global)` country as null/aggregate
- Parse percentage strings (e.g., `26.4%`) → number (0.264)

### 3.2 Display
- **Mobile-first** (Trang scans on phone Monday morning, then deep-dive on laptop later)
- **Tablet + Desktop responsive** — multi-column layout on wide screen
- **Vietnamese first**, English UI labels secondary (Trang reads Vietnamese natively)
- **Dark mode** support optional (Trang works late, dark mode useful)

### 3.3 Performance
- Initial load < 3 seconds
- Tab switching < 500ms
- Data refresh < 5 seconds (parallel tab fetches)

### 3.4 Filters & search
- Global search box: searches Keyword across all tabs
- Persistent filter state per tab (don't reset when switching tabs)
- URL params reflect filter state (shareable links)

---

## 4. Non-Functional Requirements

### 4.1 Authentication
- Single user (Trang only) — no multi-user/team features needed
- Sheet API access via service account JSON key OR OAuth (whichever Claude Code prefers)
- No login page needed if deployed at private URL

### 4.2 Deployment
- **Preferred:** Vercel / Netlify static site + serverless function for Sheets API proxy
- **Alternative:** Self-hosted Node.js / Python (whichever stack Claude Code recommends)
- Domain: subdomain like `aso.trueprofit.io` (will provision)

### 4.3 Tech stack (Claude Code's choice, my recommendation)
- **Frontend:** Next.js + Tailwind + shadcn/ui (modern, fast, mobile-first)
- **Charts:** Recharts (lightweight) or Plotly (interactive)
- **State:** Zustand or React Query (for sheet data cache)
- **Backend:** Next.js API routes (proxy to Google Sheets API to hide service account key)

---

## 5. Out of Scope (v1)

- Write-back to Google Sheets (read-only)
- Multi-user / team collaboration
- Real-time updates (cron-based daily refresh is enough)
- Mobile native app (PWA is enough)
- Integration with Shopify Ads API (manual copy-paste workflow for now)
- ML/AI recommendations beyond what's already in the sheet

---

## 6. Domain Knowledge Claude Code Needs

### 6.1 ALERT semantics

**Negative (need defensive action):**
- 🚨 USER DROP + POS WORSEN — most urgent, possibly losing share
- ⚠️ POSITION WORSEN — competitor outbid
- 💔 INSTALL DROP — conversion fail
- 💸 CR DROP — listing or paid match type issue
- 📉 USER DROP — demand shift or visibility loss

**Positive (scale opportunity):**
- 🌱 user growth + pos improve — combo win
- 📈 pos improve — climbing rank
- ❤️ install up — conversion win
- 💚 cr improve — efficiency win
- 🚀 user growth — demand up

**Geo opportunity (cross-check organic vs paid):**
- 🎯 ORG STRONG, PAID MISSING — organic GetApp ≥ 1 in country X but paid not bid that country → EXPAND TO PAID
- 🎯 ORG STRONG, PAID WEAK — organic GetApp ≥ 1 + paid bid but pos > 3 → RAISE BID PAID

### 6.2 Action recommendations (already in sheet, just display)

**Paid actions:** RAISE BID, REDUCE BID, AUDIT KW, AUDIT MATCH TYPE, NEGATIVE, PAUSE, SCALE, REVIEW LISTING, MONITOR

**Organic actions (NO bid, organic doesn't have bid):** EXPAND TO PAID, RAISE BID PAID, HOLD PAID, REVIEW PAID BID, CHECK ORGANIC, CHECK ORGANIC ALGO, CHECK LISTING, REVIEW LISTING, MONITOR ORGANIC

### 6.3 Camp naming convention

Pre-mapped in sheet column `Target Camp` for each action. Pattern:
- Brand: `TP - Brand - Exact - Tier 1 - [US/UK/AU/CA]` or `TP - Brand - Misspell - All`
- Competitor: `TP - Competitor - [BeProfit/Lifetimely/Triple Whale] Exact` / `Mid Tier Pool` / `Tier 3 Discovery (NEW)`
- Profit: `TP - Profit - Exact 01 - Tier 1 - [Country]` or `Excl 3 Tiers`
- Feature: `TP - Feature - [Accounting/Payments Currency 01/Margin/Analytics/Attribution/Inventory]`
- Language: `TP_Foreign Languages_[French/Spanish/German/...]`

### 6.4 Hard rules (must respect)

- Blended CPI target ≤ $19
- Tier 1/2 country CPI tolerance: up to $30
- Hard cap individual camp: $33
- Surface `search` = organic, never show bid action; only listing/expand-to-paid actions
- Surface `search_ad` = paid, show full bid actions
- Vietnamese informal register for any auto-generated text

---

## 7. Initial Build Priorities

**Phase 1 (MVP — 1 week):**
- Story 1.1 (Action Queue main view)
- Story 1.2 (Market Index 5 KPI cards)
- Story 2.1 (Funnel Breakdown click-to-expand)
- Story 3.1 (Geo Opportunity dedicated view)

**Phase 2 (1 more week):**
- Story 2.2 (Tier 1 Market Watch)
- Story 2.3 (Category drill-down)
- Story 4.1 (90-day trend chart per keyword)
- Story 5.1 (TODO/status tracking)

**Phase 3 (polish):**
- Story 3.2 (CSV export)
- Story 4.2 (WoW comparison)
- Story 5.2 (Personal notes)
- Dark mode, PWA, mobile install

---

## 8. Success Metrics

- **Speed:** Monday morning Action_Queue review reduced from 30 min (current — opening 18 tabs in Sheets) → 5 min in dashboard
- **Decision quality:** Action_Queue rows actioned per week ≥ 15 (vs current ~5)
- **Geo expansion:** Identify 5+ new (kw × country) bid opportunities per week from 🎯 alerts
- **Trang's qualitative feedback:** "Tao không phải mở Sheets nữa"

---

## 9. Reference Files (in this project)

- `Code.gs` — Apps Script source generating the sheet (4129 lines, for understanding data shape)
- `appsscript.json` — manifest with OAuth scopes
- `SETUP_GUIDE.md` — Apps Script deployment guide

---

## 10. Open Questions for Claude Code

1. Should the dashboard support adding new alert types in the future (extensible) or hard-code current 13 alert types?
2. Service account vs OAuth — which auth flow is easier to maintain for single-user case?
3. Vercel hobby tier limits — will daily fetch + 18 tabs hit any quota?
4. PWA vs native mobile — Trang scans on phone, is install-to-home-screen useful?
5. Should the dashboard write status updates somewhere persistent (e.g., another sheet tab) so it survives browser localStorage clear?
