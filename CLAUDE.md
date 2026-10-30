# ASO Performance Dashboard — ghi chú cho Claude Code

Dashboard ASO cho app **TrueProfit** (Shopify App Store) + tab Meta Ads của app **Proveny** (riêng, không liên quan TrueProfit).
Next.js 14 App Router, TypeScript, Tailwind, recharts. Chủ project: Trang (they/them), trả lời bằng tiếng Việt.

- Prod: https://appstore-performance.vercel.app (Vercel project `appstore-performance`, team trang-s-projects12026, Hobby plan)
- Repo: github.com/trangntt-95/aso-performance (private). Vercel KHÔNG auto-deploy từ GitHub.
- Sheet nguồn ASO: `1D1BNsWAfnrDaE_S_R7yYlox9GTx6wvR001mSvpxRWlE` (Vercel đọc bằng service account
  `app-sheets-reader@fluid-root-490509-p3.iam.gserviceaccount.com`; nếu sheet bị xoá/khôi phục phải share lại Editor cho mail này).

## Quy ước làm việc với Trang
- Sau MỖI thay đổi code: commit rồi deploy ngay bằng `npx vercel --prod --yes`, không hỏi lại, không chờ test tay.
- Commit message nhiều dòng: ghi ra file rồi `git commit -F file` (PowerShell làm hỏng here-string). Kết thúc bằng
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Khi một tab trong sheet ASO không còn được dashboard dùng → báo Trang để xoá bớt (sheet gần trần 10M ô).
- Báo cáo dạng bảng, không viết đoạn văn dài. Không bịa số; số đo để trong bảng.
- Trong Bash, KHÔNG viết code có backtick qua `node -e`/heredoc không quote (bị shell nuốt) → ghi script ra file rồi chạy.

## Kiến trúc dữ liệu
- `app/api/sheets/route.ts` đọc toàn bộ tab sheet → payload cho mọi trang. Tab thiếu được chấp nhận (`raw[tab] ?? []`).
  Payload rỗng sau lỗi Google API → trả 503 no-store (không cache rỗng).
- Nguồn GA4 (users/install/position theo keyword × nước × ngày) là các tab `GA4_daily_auto`, `GA4_All_L*_auto`,
  `GA4_Country_L*_auto`, do **pipeline hàng ngày** ghi (xem dưới). `history`, `marketIndex`, `actionQueue` được DERIVE trong
  `lib/sheets/*FromGa4.ts` / `historyFromDaily.ts`, không còn phụ thuộc Apps Script.
- Net value per install (NPI) = net 120 ngày đầu sau cài, chỉ shop đã chín (Trang chốt 05/10/2026). SQL ở `scripts/net-value/prompt.md` bước 2.
- Shopify Ads export: đọc TAB ĐẦU TIÊN theo vị trí, cột camp là `Ad Name`; Trang export tay nên có thể cũ.
- Google Ads: `lib/market/googleAdsReport.ts` (VND, install thật ≠ conversions).
- Meta Proveny: `lib/meta/graph.ts` gọi Graph API v21 bằng System User token (env `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`),
  cache 15 phút, fallback `data/meta-proveny.snapshot.json`. Events nằm ở `insights.conversions`; result event theo adset `promoted_object`.
- Email digest vị trí keyword: `lib/digest/positions.ts` + `lib/digest/email.ts`, route `/api/digest/positions`
  (`?preview=1[&threshold=0.3]` xem HTML; không có preview thì gửi tới `DIGEST_TO` qua Resend). Chỉ keyword biến động ≥1 bậc
  ở L3/7/14/30, tách Paid/Organic, theo nước, chỉ position (bảng đầy đủ kèm users ở `/positions`).
  "Keyword chính" = mọi keyword category Brand + top 30 users L30 (bỏ Noise/Test/Unknown).

## Cron trên Vercel (`vercel.json`, UTC)
- `0 1 * * *` → `/api/net-value?refresh=1`
- `0 2 * * *` → `/api/digest/positions` (09:00 VN)

## Pipeline hàng ngày (GA4 → BigQuery → sheet)
Prompt 18 bước: `scripts/net-value/prompt.md` (bản chạy local) và `scripts/net-value/routine-prompt.md` (bản cloud routine,
token lấy từ env `NET_VALUE_UPLOAD_TOKEN`). Cần 2 connector claude.ai: **TrueProfit-GA-MCP** (`ga_report_to_bq`) và
**TrueProfit-DA** (`run_query`). Scripts build/push trong `scripts/net-value/*.mjs`; push lên sheet qua
`/api/ga4-daily`, `/api/ga4-windows`, `/api/net-value`, `/api/countries`, `/api/bidcap` với header `x-upload-token`.
- Chạy local: Task Scheduler "ASO net value daily" 08:05/12:05/16:05 → `scripts/net-value/daily.ps1` → `claude -p`,
  log `logs/net-value-YYYYMMDD.log`, thành công = dòng `PIPELINE_OK`/`exit=0`. Token local ở `scripts/net-value/.token` (gitignore).
- Connector claude.ai nạp KHÔNG đồng bộ trong headless → bước 0 phải ToolSearch + đợi/retry; đừng kết luận thiếu tool ở lần đầu.
- Thiếu ngày nào thì chạy lại toàn bộ pipeline (mỗi lần ghi đè 370 ngày GA4 nên tự backfill).
- Dashboard "đứng ở ngày X" → xem log pipeline trước, không phải lỗi /api/sheets.

## Env (Vercel Production)
GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_SHEET_ID, GOOGLE_GENERATIVE_AI_API_KEY (chat widget),
META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, RESEND_API_KEY, DIGEST_TO, NET_VALUE_UPLOAD_TOKEN, tuỳ chọn CRON_SECRET, DIGEST_FROM,
DIGEST_DASHBOARD_URL. Giá trị Sensitive không đọc lại được từ Vercel; file `.env.local` không commit.

## Máy mới làm việc tiếp
1. `git clone` repo, `npm install`, `npx vercel link` vào project appstore-performance, `npx vercel env pull .env.local`.
2. Nếu vẫn chạy pipeline local: tạo `scripts/net-value/.token`, đăng ký Task Scheduler gọi `daily.ps1`, cài Claude Code cùng
   tài khoản claude.ai (để có 2 connector TrueProfit). Ưu tiên dùng cloud routine thay vì máy cá nhân.
