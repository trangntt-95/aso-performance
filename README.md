# ASO Performance Dashboard

Dashboard theo dõi hiệu suất **ASO (App Store Optimization)** cho **TrueProfit** — app phân tích lợi nhuận ròng cho Shopify trên App Store.

Ứng dụng đọc dữ liệu keyword/ranking/install từ một **Google Sheet** (do bộ ASO tracker bằng Apps Script ghi vào), tổng hợp lại và hiển thị thành các dashboard tương tác để team marketing ra quyết định **bid / keyword** hằng ngày.

- **Live:** https://appstore-performance.vercel.app (Vercel project `appstore-performance`)
- **Repo:** github.com/trangntt-95/aso-performance (private)
- **Thư mục:** `app-dau-tien/` (tên thư mục cũ; project đã đổi tên thành `aso-performance`)

---

## Làm được gì

Dữ liệu nguồn nằm ở Google Sheets. App **chỉ đọc** các tab data (`All_*`, `Country_*`, `Market_Index`, `Master KW Lookup`, …) và **chỉ ghi** vào vài tab phụ (`Bid_Notes`, `App_Notes`) để lưu ghi chú người dùng.

### Các trang chính (sidebar)

| Trang | Route | Mục đích |
|-------|-------|----------|
| **Overview** | `/` | KPI tổng (Users · Install · CR · Ads Target), channel mix Organic/Paid, App Store Ads vs Google Ads, market performance, daily trend, top country/keyword, volume movers, chi phí paid theo category. Lọc đa chiều theo window / surface / country / keyword / category / khoảng ngày. |
| **Market Health** | `/market-index` | Cầu thị trường theo ngày (GA4 History_Daily): users và install organic / paid, kỳ đang chọn so kỳ trước; pacing install paid Shopify Ads + Google Ads so target tháng; trọng số quốc gia theo doanh thu hay users. |
| **Search Terms** | `/categories` | Bảng tra cứu mọi keyword × kênh: category, trạng thái paid, metric theo L7/L30/L90/L365, value/install, bản dịch; cảnh báo keyword paid đốt tiền không ra install. |
| **Vị trí keyword** | `/positions` | Vị trí keyword theo nước qua L3→L90, mặc định Brand + top Profit ở Tier 2–3; cờ brand đã top mà vẫn đang mua. |
| **Paid Coverage** | `/paid-coverage` | Keyword có traffic nhưng chưa được bid (gồm gap theo quốc gia), câu tìm kiếm paid GA4 chưa có keyword riêng, và chiều ngược lại: keyword đang bid mà 0 users paid, chia nhóm có nhu cầu / tín hiệu yếu / không có gì. |
| **Underbid Keywords** | `/underbid` | Keyword có nhu cầu organic thật nhưng đang bid thiếu → nên tăng bid; đo impact sau khi note. |
| **Overbid Camps** | `/overbid-camps` | Campaign đang trả quá cao (CPC/CPI vượt ngưỡng, hoặc tiêu mà 0 install) → nên giảm bid; panel brand đã top. |
| **Camp Health** | `/camp-health` | Tiền đang chảy vào đâu: camp click mà 0 install, CTR thấp, mất hiển thị, có tiềm năng. |
| **Nguồn Install** | `/install-origin` | Install paid truy về keyword × nước × vị trí × camp × bid. |
| **Google Ads** | `/google-ads` | Kênh Google Ads (VND): install thật vs conversions, impression share, Quality Score, nước, search term. |
| **Bid Recommendations** | `/bid-cap` | Bid khuyến nghị theo Country × Category × Keyword cluster, bid hiện tại, trần CPI so giá trị install, cảnh báo camp target nhiều nước lệch bid. |
| **By Category** | `/paid-categories` | Xu hướng paid theo category qua các tháng, đọc từ tab `By categories` của sheet Shopify Ads. |
| **Change log** | `/changelog` | Ghi lại đã đổi gì và thấy gì sau đó; mốc hiện trên daily trend. |

Ngoài sidebar còn `/exec` — bản Overview chỉ đọc, nhúng cho stakeholder.

### AI Chat widget
Nút chat nổi ở mọi trang, dùng **Vercel AI SDK + Google Gemini**. Có 13 tool đọc lại dữ liệu sheet (overview, top keywords, country breakdown, …) và nhận **context trang đang xem** để trả lời đúng phạm vi (window/country/keyword đang lọc).

### Tính năng khác
- **Filter sâu + deep-link:** trạng thái Overview lưu hết vào URL query params, mỗi card có nút copy link.
- **Xuất file:** "Tải về" → Excel (.xlsx, nhiều sheet) hoặc CSV theo đúng view hiện tại.
- **Ghi chú server-side:** note trên Bid Recommendations / Underbid / Overbid lưu vào sheet, chia sẻ giữa các thiết bị/người dùng.
- **Cache:** API route `revalidate = 600` (10 phút) + React Query `staleTime` 10 phút → sửa sheet propagate trong ~10 phút.

---

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** (Radix / Base UI)
- **React Query** (data fetching) + **Zustand** (client state)
- **Recharts** (biểu đồ)
- **googleapis** (đọc/ghi Google Sheets qua service account)
- **AI SDK** (`ai` + `@ai-sdk/react` + `@ai-sdk/google`) cho chat
- **xlsx** (SheetJS) cho export
- Deploy: **Vercel**

---

## Cấu trúc thư mục

```
app/
  (dashboard)/        # các trang dashboard (overview, market-index, categories, paid-coverage, underbid, bid-cap, overbid-camps)
  api/
    sheets/           # đọc + parse + override toàn bộ payload từ Google Sheet
    chat/             # endpoint AI chat (streamText + tools)
    bid-notes/        # đọc/ghi tab Bid_Notes
    notes/            # đọc/ghi tab App_Notes (Underbid/Overbid)
  exec/               # bản Overview rút gọn để nhúng/exec
components/           # UI theo từng feature (overview, categories, paid-coverage, underbid, overbid, chat, shared, …)
lib/
  sheets/             # client googleapis, parsers, paidStatus, override category/language
  market/             # logic nghiệp vụ: underbid, overbid, currentBid, campLink, conflicts, accountAggregates
  ai/                 # dashboard-tools cho chat
  config/             # ads-targets (mục tiêu install theo tháng)
  store/              # zustand stores
  export/             # xuất Excel/CSV
apps-script/          # các script Google Apps Script chạy nền (snapshot, rank alerts)
scripts/              # script probe/debug data (.mjs)
```

---

## Chạy local

```bash
npm install
npm run dev      # http://localhost:3000
```

### Biến môi trường (`.env.local`)

| Biến | Dùng cho |
|------|----------|
| `GOOGLE_SHEET_ID` | ID của Google Sheet nguồn |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email service account (cần share sheet với email này) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Private key (lưu `\n` literal, thay ở runtime) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | API key Gemini cho AI chat |

> Tab ghi chú (`Bid_Notes`, `App_Notes`) yêu cầu service account có quyền **Editor** trên sheet.

---

## Deploy

GitHub auto-deploy **không hoạt động** (vercel git connect lỗi). Quy trình thủ công:

```bash
git push
vercel deploy --prod --yes
vercel alias set <deployment-url> appstore-performance.vercel.app
```

> Domain prod là `appstore-performance.vercel.app` (KHÔNG phải `aso-performance.vercel.app` — alias đó không trỏ đi đâu cả). Set alias sau mỗi lần deploy prod cho chắc.

---

## Apps Script (chạy nền, trong `apps-script/`)

Bản gốc `Code.gs` (tracker, `runDailyFull` 9am) và `history_daily_v2.gs` (tab `History_Daily`, 7:00) nằm trong Apps Script project gắn với sheet, không có trong repo. Repo chỉ giữ các file phụ:

- **`rank-alerts.gs`** — `runRankAlerts` chạy 7am quét `Country_L7` tìm keyword tụt rank paid, ghi `AlertLog` + gửi email digest.
- **`history-daily-fix.gs`** — patch 2 hàm của `history_daily_v2.gs`: sửa key ngày (Date vs chuỗi) và ghi theo khối để backfill không timeout.
- **`history-daily-country.gs`** — tab `History_Daily_Country`: số per-day theo nước cho ~11 thị trường Tier 1, chạy 7:15.
- **`trend-dashboard.gs` + `.html`** — dialog trend trong sheet Shopify Ads, đọc tab `By categories`; trang By Category của dashboard ghép đúng logic này (có test parity).
- **`test/`** — acceptance test cho các module logic thuần; xem `test/README.md`.

---

## Quy ước quan trọng

- **Surface:** `search` = organic (không có action bid), `search_ad` = paid (có full action bid). Không trộn lẫn.
- **Read-only** trên các tab data — không bao giờ ghi ngược vào `All_*` / `Country_*` / `Market_Index`.
- **Loại trừ quốc gia:** `Vietnam`, `India` (trong volume movers, top actions).
- **Ads target:** hardcode trong `lib/config/ads-targets.ts`, cập nhật mỗi quý.
