# Claude Code Handoff — TrueProfit ASO Dashboard

> **Instructions for Trang:** Đây là toàn bộ file cần đưa cho Claude Code. Đọc section 1 để biết cách prompt Claude Code, section 2-6 là setup steps mày làm trước, section 7 là prompt template.

---

## 1. Files cần upload vào Claude Code project

Tạo folder mới `trueprofit-aso-dashboard/` và copy 5 files này vào:

```
trueprofit-aso-dashboard/
├── docs/
│   ├── USER_STORY_DASHBOARD.md       ← Business context + user stories
│   ├── IMPLEMENTATION_SPEC.md         ← Technical spec + code samples
│   ├── CLAUDE_CODE_HANDOFF.md         ← File này (instructions)
│   └── Code.gs                        ← Apps Script source (for data shape reference)
└── (Claude Code will create rest)
```

---

## 2. Trang's setup checklist (PHẢI làm trước khi gọi Claude Code)

### 2.1 Google Cloud Service Account
1. Vào [Google Cloud Console — IAM](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Chọn project (hoặc tạo mới: "TrueProfit ASO Dashboard")
3. Click **Create Service Account**
   - Name: `trueprofit-aso-dashboard`
   - Description: `Read-only access to ASO tracker sheet`
4. Skip permissions step (không cần role)
5. Click vào service account vừa tạo → tab **Keys** → **Add Key** → **JSON**
6. File JSON tự download — lưu lại an toàn (không commit vào Git)
7. Mở file JSON, copy 2 giá trị:
   - `client_email` (vd: `trueprofit-aso-dashboard@xxx.iam.gserviceaccount.com`)
   - `private_key` (full multi-line string, bao gồm `-----BEGIN PRIVATE KEY-----`)

### 2.2 Enable Google Sheets API
1. Vào [Google Cloud Console — APIs](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
2. Click **Enable** cho **Google Sheets API**

### 2.3 Share Sheet với Service Account
1. Mở Google Sheet của mày (sheet có 18 tabs)
2. Click **Share** (góc phải trên)
3. Paste `client_email` từ service account JSON
4. Permission: **Viewer**
5. Bỏ tick "Notify people"
6. Click **Share**

### 2.4 Lấy Sheet ID
- Mở sheet, URL có dạng: `https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit#gid=0`
- Copy phần `SHEET_ID` (giữa `/d/` và `/edit`)

### 2.5 Lưu 3 giá trị này (sẽ dùng cho .env.local):
```
GOOGLE_SHEET_ID=______________________________
GOOGLE_SERVICE_ACCOUNT_EMAIL=______________________________
GOOGLE_SERVICE_ACCOUNT_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## 3. Local development setup (mày làm hoặc Claude Code làm)

### 3.1 Cài đặt Node.js
- Cài Node.js 20 LTS từ [nodejs.org](https://nodejs.org/)
- Verify: `node --version` → `v20.x.x`

### 3.2 Clone project (sau khi Claude Code init)
```bash
cd ~/projects
mkdir trueprofit-aso-dashboard
cd trueprofit-aso-dashboard
# Claude Code sẽ scaffold project ở đây
```

### 3.3 Tạo `.env.local`
```bash
# File: trueprofit-aso-dashboard/.env.local (DO NOT COMMIT)
GOOGLE_SHEET_ID=1abc...xyz
GOOGLE_SERVICE_ACCOUNT_EMAIL=trueprofit-aso-dashboard@xxx.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
```

⚠️ **IMPORTANT:** `GOOGLE_SERVICE_ACCOUNT_KEY` phải dùng `\n` literal (không phải newline thật). Khi paste từ JSON file, escape tất cả newlines thành `\n`.

### 3.4 Add `.gitignore`
```
.env.local
.env*.local
service-account-key.json
*.json.local
node_modules/
.next/
```

---

## 4. Deploy to Vercel (sau khi Phase 1 work)

### 4.1 Push code lên GitHub
```bash
cd trueprofit-aso-dashboard
git init
git add .
git commit -m "Initial commit"
gh repo create trueprofit-aso-dashboard --private --source=. --push
```

### 4.2 Deploy
1. Vào [vercel.com](https://vercel.com/) → sign in with GitHub
2. **New Project** → chọn repo `trueprofit-aso-dashboard`
3. Framework Preset: **Next.js** (auto-detect)
4. **Environment Variables** — add 3 vars:
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_SERVICE_ACCOUNT_KEY` (paste full key, Vercel handle `\n`)
5. Click **Deploy**
6. Sau 2 phút có URL: `https://trueprofit-aso-dashboard.vercel.app`

### 4.3 Optional: Custom domain
- Settings → Domains → Add `aso.trueprofit.io`
- DNS: CNAME record point đến `cname.vercel-dns.com`

### 4.4 Optional: Password protection
- Settings → Deployment Protection → Enable **Vercel Authentication**
- Set password mày dùng

---

## 5. Prompt template cho Claude Code

### 5.1 Initial prompt (paste khi mở Claude Code session đầu tiên)
```
Read the 3 files in docs/ folder:
1. USER_STORY_DASHBOARD.md — business context, user stories, acceptance criteria
2. IMPLEMENTATION_SPEC.md — technical spec with types, API routes, components, file structure
3. Code.gs — Apps Script source generating the Google Sheet (4129 lines, for data shape reference)

Now build Phase 1 MVP per Section 13 in IMPLEMENTATION_SPEC.md.

Start with:
- Day 1-2: Scaffold Next.js 14 project with TypeScript + Tailwind + shadcn/ui
- Implement lib/sheets/client.ts and types
- Test single tab fetch via /api/sheets/Action_Queue

Confirm setup works before moving to Day 3-4 (Action Queue UI).

Tech stack confirmed: Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, React Query, Zustand, Recharts, googleapis. No DB.

Trang (the user) is a Vietnamese performance marketer. UI labels can be English, but auto-generated text (notes, narratives) is Vietnamese. Address her as "mày" (informal) in any user-facing text where appropriate.

Stop and ask me if any of these is unclear before writing code:
1. Sheet ID + service account env vars
2. Vercel deploy target vs local-only
3. Auth/login (vote: skip for Phase 1)
```

### 5.2 Follow-up prompts (gọi sau khi Phase 1 done)

**Phase 2:**
```
Phase 1 looks good. Now build Phase 2 from IMPLEMENTATION_SPEC.md Section 13:
- Day 5-6 already covered Market Index? If yes skip to Day 7.
- Implement Geo Opportunity page (Story 3.1) — group by Country, suggest bid range, CSV export
- Implement Tier 1 Market Watch page (Story 2.2)
- Implement Category drill-down (Story 2.3)

Verify each story's acceptance criteria from USER_STORY_DASHBOARD.md.
```

**Phase 3:**
```
Phase 2 done. Now Phase 3 polish:
- 90-day trend chart per keyword (Story 4.1) — use Recharts LineChart, data from History tab
- WoW comparison (Story 4.2) — diff this week's Action_Queue vs cached last week
- Personal notes per keyword (Story 5.2) — Zustand store + modal
- Dark mode toggle
- PWA manifest for mobile install
- Error boundary on all pages
- Loading skeletons
- Mobile-first testing (375px viewport)
```

### 5.3 Debug prompts
```
The Sheets API call is failing with [error message]. Show me:
1. What env vars are being read (mask the actual key)
2. The exact API request being made
3. Suggest 3 likely causes ordered by probability
```

```
The Action Queue table is not sorting correctly. Expected order:
- Tier 1: Priority P0 → P1 → P2 → P3
- Tier 2 (within same priority): Score desc

Show me the sort function being used and the actual data shape.
```

---

## 6. Iteration workflow with Claude Code

### 6.1 Daily flow (during development)
1. Mở Claude Code session
2. Paste continuation prompt: `"Continue from yesterday. Show me current TODO list and what's next."`
3. Test build: `npm run dev` → check `localhost:3000`
4. Báo Claude Code các bug cụ thể (screenshot + error message)
5. Commit working code mỗi lần feature done

### 6.2 Khi gặp lỗi
- **Sheets API 403:** Service account chưa được share sheet. Re-check section 2.3.
- **Sheets API 400:** Tab name typo. Verify spelling match Apps Script CONFIG.
- **Parse error empty rows:** Check filter rules (paid `users ≥ 1`, organic `users + getApp ≥ 1`)
- **Vercel build fail:** Check `next.config.js` không có invalid options, env vars set.

### 6.3 Khi muốn add feature mới sau Phase 3
```
Add a new feature: [describe in 2-3 sentences].

This should integrate with [existing component] without breaking [existing flow].

Before coding, show me:
1. Which existing files need to change
2. New components/types needed
3. Any data shape assumptions
```

---

## 7. Acceptance test (mày làm sau khi Claude Code build xong Phase 1)

### Test 1 — API Connection
1. Run `npm run dev`
2. Mở browser `http://localhost:3000/api/sheets`
3. **Expected:** JSON response với 17 keys (actionQueue, marketIndex, etc.)
4. **Fail:** Check `.env.local`, service account share, API enabled

### Test 2 — Action Queue
1. Mở `http://localhost:3000`
2. **Expected:**
   - 50 rows listed
   - Top rows = P0 priority (dark red badge)
   - ALERT column has emoji + color matching screenshot
   - Click row → expand showing Note + Key Stats
   - Filters work (Priority, Category, Surface)
3. **Fail:** Báo Claude Code: "Action Queue row [N] shows wrong [field]. Expected [X], got [Y]."

### Test 3 — Market Index
1. Click "Market Index" trong sidebar
2. **Expected:**
   - 5 cards horizontal (L3, L7, L14, L30, L90)
   - Each shows VERDICT + Δ Users + Δ GetApp + PRIMARY CAUSE
   - Click card → expand Funnel Breakdown + Narrative Việt
3. **Fail:** Báo cụ thể card nào sai.

### Test 4 — Geo Opportunity
1. Click "Geo Opportunity"
2. **Expected:**
   - List rows alert 🎯 ORG STRONG, PAID MISSING + 🎯 ORG STRONG, PAID WEAK
   - Grouped by Country (France, Spain, US, etc.)
   - Each row có suggested Target Camp + bid range
   - Top row should be `true profit Spain` hoặc `trueprofit France` (based on data analysis)
3. **Fail:** Báo Claude Code.

### Test 5 — Mobile viewport
1. Chrome DevTools → Toggle device toolbar → iPhone 12 (390px)
2. **Expected:**
   - Action Queue rows scroll vertically, không overflow horizontal
   - Sidebar collapsible (hamburger menu)
   - Badges + text vẫn readable
3. **Fail:** Báo screenshot.

### Test 6 — Status persistence
1. Mark 1 row "Done"
2. Refresh browser (F5)
3. **Expected:** Row vẫn marked "Done" (faded out)
4. **Fail:** Zustand persist chưa work, báo Claude Code check `lib/store/statusStore.ts`.

---

## 8. After Phase 1 — Decision points

Sau khi Phase 1 deploy xong, mày quyết định:

1. **Auth needed không?** Nếu có người khác cần access, enable Vercel Authentication. Nếu chỉ mày dùng, skip — Vercel URL random đủ private.

2. **Custom domain không?** `aso.trueprofit.io` looks professional, optional.

3. **Phase 2 priority gì?** Theo IMPLEMENTATION_SPEC.md Section 13, recommend:
   - Tier 1 Watch + Geo Opportunity CSV export (mày dùng nhiều nhất)
   - Skip 90-day trend chart nếu mày không cần history view

4. **Notify khi data fresh?** Optional Phase 3: Gmail/Slack webhook khi Action_Queue có P0 mới.

---

## 9. Maintenance after handover

### 9.1 Service account key rotation
- Rotate JSON key 6 months/lần (Google security best practice)
- Generate new key → update Vercel env vars → delete old key

### 9.2 Sheet schema changes
- Nếu mày add column mới vào Apps Script output → cập nhật:
  - `lib/sheets/types.ts` (TypeScript interface)
  - `lib/sheets/parsers.ts` (parser function)
  - Component nào cần display column mới

### 9.3 Cost monitoring
- **Vercel free tier:** 100GB bandwidth/month, 1M serverless function invocations
- **Google Sheets API:** Free 60 req/min/user — dashboard cache 1h nên không hit limit
- Track Vercel dashboard 1x/tháng để confirm không quá quota

---

## 10. Out of scope (đã confirm v1 không làm)

❌ Write back to Google Sheets
❌ Multi-user team collaboration
❌ Real-time websocket updates
❌ Shopify Ads direct API integration
❌ ML predictions beyond what's in sheet
❌ Mobile native app (PWA enough)
❌ Internationalization (Vietnamese hardcoded fine)

---

## 11. Success criteria

Phase 1 done = Trang có thể:
- ✅ Mở dashboard mobile Monday 9AM
- ✅ Scan top 10 P0 trong 5 phút
- ✅ Action ngay không cần mở Sheet
- ✅ Check Market Index 1 cái biết market down hay up + lý do
- ✅ Vào Geo Opportunity tab thấy keyword nào cần tách camp country

Phase 2 done = Trang có thể:
- ✅ Drill-down per Category để plan camp restructure
- ✅ Filter Tier 1 watch ngay
- ✅ Export CSV để import vào Shopify Ads
- ✅ Track action progress (Done/Skipped) across week

Phase 3 = nice-to-have polish.

---

## 12. Liên hệ debug

Nếu Claude Code gặp issue khó, gửi cho Trang:
1. Screenshot error console
2. Last 50 lines của `npm run dev` output
3. File nào đang edit
4. Đã thử fix gì rồi

Trang sẽ relay lại Claude (assistant) để tao help debug.
