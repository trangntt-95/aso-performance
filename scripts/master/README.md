# Cập nhật Master KW Lookup / Paused_camp từ Shopify Ads

Shopify App Store Ads không có API công khai. Keyword theo camp chỉ lấy được qua
GraphQL nội bộ của `partners.shopify.com` khi đã đăng nhập, nên bước kéo dữ liệu
chạy trong Chrome của Trang (Claude in Chrome), các bước còn lại là script.

## Chạy khi Trang nhắn "cập nhật Master"

1. Mở Chrome, tab bất kỳ của `https://partners.shopify.com/832504/ads/...` (đăng nhập tài khoản trangnt@firegroup.io).
2. Trong tab đó, chạy JS (javascript_tool) theo `dump.js` ở đây:
   - `window.__gql` gọi `POST /832504/api/ad_platform_graphql?operation=<tên>` với header `x-csrf-token`
     lấy từ `<meta name="csrf-token">`, body `{operationName, query, variables}`. Endpoint nhận query tự viết.
   - Danh sách camp: `campaigns(first:100, after, archived:false){ edges{node{id name status surface}} pageInfo{hasNextPage endCursor} }`
     (~250 camp, 3 trang, ~0.5 s/trang; đừng kèm `targeting` — chậm >30 s).
   - Keyword từng camp: `campaign(id){ ... on SearchCampaign { keywordBidCriteria{ edges{ node{ keyword matchType bid status relevanceCategory metrics(startDate,endDate){impressions clicks installs spend} } } } } }`
     — id là số ("74108"). 3 worker song song, ~2 s/camp → ~8 phút cho 250 camp. Kết quả gom vào `window.__kws`.
   - Lấy ra theo khúc 60k ký tự: `JSON.stringify(window.__kws).slice(i, i+60000)` → ghép lại thành `kws.json`.
3. Backup tab cũ: `GET /api/sheets/raw?tab=Master%20KW%20Lookup&rows=5000&from=1` (lặp `from`), lưu `exports/backup-*.json`.
4. `node scripts/master/build-master.mjs kws.json camp-links.json backup-master.json backup-paused.json <out>`
   (`camp-links.json` = `campLinks` từ `/api/sheets`).
5. `node scripts/master/push-master.mjs <out>/master-body.json <out>/paused-body.json`.

## Lưu ý

- Endpoint ghi (`/api/master/upload`) từ chối body < 5000 dòng Master, giữ đúng 14 cột.
- Classification (NOISE / POTENTIAL) là cột Trang gán tay, build script chép lại theo keyword từ bản cũ.
- Keyword status ≠ active ghi Bid rỗng; dashboard vẫn liệt kê camp nhưng bid hiện "—".
- Camp archived không nằm trong hai tab (Shopify trả `archived:false`).

## Camp_Links (Camp_URL) đối chiếu theo Campaign ID — 23/09/2026

Trang: "lấy sheet camp_URL làm chuẩn; tên không khớp thì rà URL xem khớp camp nào hiện tại thì sửa".
1. Trong tab Shopify Ads, chạy JS lấy `campaigns(first:50, archived:false){ edges{node{id name status targeting{geographicTargets{code}}}} }`
   (và `archived:true` để biết camp đã lưu trữ). Nén thành TSV `id \t status \t incl|excl \t codes \t name`
   (excl = mã nước bị loại so với hợp của mọi camp), hiện trong `<pre>` rồi đọc bằng get_page_text (~40k ký tự).
   Lưu `exports/shopify-ads-geo-<ngày>.tsv`.
2. Backup: `GET /api/sheets/raw?tab=Camp_Links&rows=2000` → `exports/backup-Camp_Links-<ngày>.json`.
3. `node scripts/master/build-camp-links.mjs <backup> <geo.tsv> exports/camp-links-<ngày>/camp-links-body.json`
   — đổi tên theo Shopify qua ID, điền ID/URL thiếu, Geo thật (include liệt kê nước; "exclude: …"), thêm camp thiếu,
   giữ cột ghi chú F–H.
4. `node scripts/master/push-camp-links.mjs <body.json>` → `/api/camp-links/upload`.
Dashboard nối camp theo Campaign ID khi Master có cột ID (parseMasterKw, installOrigin, campUrl.getById, campCountries).
