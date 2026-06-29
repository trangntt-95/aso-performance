# ASO Performance Dashboard

Dashboard theo dõi hiệu suất **ASO (App Store Optimization)** cho **TrueProfit** — app phân tích lợi nhuận ròng cho Shopify trên App Store.

Ứng dụng đọc dữ liệu keyword/ranking/install từ một **Google Sheet** (do bộ ASO tracker bằng Apps Script ghi vào), tổng hợp lại và hiển thị thành các dashboard tương tác để team marketing ra quyết định **bid / keyword** hằng ngày.

- **Live:** https://aso-performance.vercel.app
- **Repo:** github.com/trangntt-95/aso-performance (private)
- **Thư mục:** `app-dau-tien/` (tên thư mục cũ; project đã đổi tên thành `aso-performance`)

---

## Làm được gì

Dữ liệu nguồn nằm ở Google Sheets. App **chỉ đọc** các tab data (`All_*`, `Country_*`, `Market_Index`, `Master KW Lookup`, …) và **chỉ ghi** vào vài tab phụ (`Bid_Notes`, `App_Notes`) để lưu ghi chú người dùng.

### Các trang chính (sidebar)

| Trang | Route | Mục đích |
|-------|-------|----------|
| **Overview** | `/` | KPI tổng (Users · GetApp · CR · Ads Target), channel mix Organic/Paid, market performance, daily trend, top country/keyword, volume movers. Lọc đa chiều theo window / surface / country / keyword / category / khoảng ngày. |
| **Market Health** | `/market-index` | Verdict theo từng window (L3→L90), funnel breakdown, so sánh WoW, narrative + bằng chứng data. |
| **Dictionary** | `/categories` | Bảng tra cứu mọi keyword: category, trạng thái paid, metric theo L7/L30/L90/L365, bản dịch tiếng Anh. |
| **Paid Coverage** | `/paid-coverage` | Keyword có traffic nhưng chưa được bid (gồm cả gap theo quốc gia). |
| **Underbid Keywords** | `/underbid` | Keyword có nhu cầu organic thật nhưng đang bid thiếu → nên tăng bid. |
| **Bid Recommendations** | `/bid-cap` | Bid khuyến nghị theo Country × Category, bid hiện tại, action (RAISE/HOLD/REDUCE), link camp, cảnh báo conflict bid. |
| **Overbid Camps** | `/overbid-camps` | Campaign đang trả quá cao (CPC/CPI vượt ngưỡng) → nên giảm bid. |

### AI Chat widget
Nút chat nổi ở mọi trang, dùng **Vercel AI SDK + Google Gemini**. Có 9 tool đọc lại dữ liệu sheet (overview, top keywords, country breakdown, …) và nhận **context trang đang xem** để trả lời đúng phạm vi (window/country/keyword đang lọc).

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
vercel alias set <deployment-url> aso-performance.vercel.app
```

> Alias `aso-performance.vercel.app` không tự rebind sang deployment mới nhất nên phải set alias sau mỗi lần deploy prod.

---

## Apps Script (chạy nền, trong `apps-script/`)

- **`daily-snapshot.gs`** — `runDailySnapshot` chạy 7am (Asia/Ho_Chi_Minh) đọc `All_L7` append vào tab `History_Daily` để dựng daily trend / install history.
- **`rank-alerts.gs`** — `runRankAlerts` chạy 7am quét `Country_L7` tìm keyword tụt rank paid, ghi `AlertLog` + gửi email digest.
- **`ga4-install-snapshot.gs`** — pull paid ad-click per keyword từ GA4 (hiện **không dùng**, để dành).

---

## Quy ước quan trọng

- **Surface:** `search` = organic (không có action bid), `search_ad` = paid (có full action bid). Không trộn lẫn.
- **Read-only** trên các tab data — không bao giờ ghi ngược vào `All_*` / `Country_*` / `Market_Index`.
- **Loại trừ quốc gia:** `Vietnam`, `India` (trong volume movers, top actions).
- **Ads target:** hardcode trong `lib/config/ads-targets.ts`, cập nhật mỗi quý.
