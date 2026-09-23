Bạn đang chạy headless trong repo C:\Users\trangkeke\aso-performance để cập nhật tab "Net value per install" của dashboard ASO. Làm đúng các bước, không hỏi lại, không sửa code. Mọi file tạm ghi vào thư mục `.net-value-run/` trong repo (tạo nếu chưa có). Hôm nay là ngày chạy; "hôm qua" = ngày hiện tại trừ 1, định dạng YYYY-MM-DD và dd/mm/yyyy.

Bước 1 — Kéo install GA4 của các tháng chưa có trong BigQuery.
Bảng `trueda.trueprofit.ga_surface_attr_2526` đã phủ year_month 202501–202608. Gọi tool `mcp__claude_ai_TrueProfit_GA_MCP__ga_report_to_bq` với:
- property_id: 348654457
- dimensions: ["customEvent:shop_id", "landingPagePlusQueryString", "firstUserSourceMedium", "yearMonth"]
- metrics: ["eventCount"]
- dimension_filter: {"filter": {"field_name": "eventName", "string_filter": {"match_type": "EXACT", "value": "shopify_app_install"}}}
- date_ranges: [{"start_date": "2026-09-01", "end_date": "<hôm qua YYYY-MM-DD>"}]
- dest_table: "trueprofit.ga_surface_attr_current"
- write_mode: "overwrite"
Kỳ vọng rows_written > 0. Lỗi thì dừng và in lỗi.

Bước 2 — Tổng hợp trong BigQuery. Gọi `mcp__claude_ai_TrueProfit_DA__run_query` với max_rows 5000 và SQL sau (nguyên văn):

WITH src AS (
  SELECT shop_id, landing_page_plus_query_string AS lp FROM `trueda.trueprofit.ga_surface_attr_2526` WHERE year_month BETWEEN '202601' AND '202608'
  UNION ALL
  SELECT shop_id, landing_page_plus_query_string FROM `trueda.trueprofit.ga_surface_attr_current` WHERE year_month >= '202609'
),
m AS (
  SELECT shop_id,
    REGEXP_EXTRACT(lp, r'surface_type=([^&]+)') AS surface,
    REGEXP_EXTRACT(lp, r'surface_detail=([^&]+)') AS kw_raw
  FROM src WHERE shop_id != '(not set)'
),
inst AS (
  SELECT DISTINCT m.shop_id, m.surface, m.kw_raw, s.CountryName AS country
  FROM m
  LEFT JOIN `trueda.trueprofit.shops` s ON CAST(s.ID AS STRING) = m.shop_id
  LEFT JOIN `trueda.trueprofit.testing_shops` x ON x.shop_id = m.shop_id
  WHERE x.shop_id IS NULL AND m.surface IN ('search','search_ad') AND m.kw_raw IS NOT NULL
),
tx AS (
  SELECT shop_id, SUM(net_amount) AS net, COUNTIF(kind = 'AppSubscriptionSale' AND gross_amount > 0) AS paid_tx
  FROM `trueda.trueprofit.partner_transactions`
  WHERE DATE(TIMESTAMP_ADD(created_at, INTERVAL 7 HOUR)) >= '2026-01-01'
  GROUP BY shop_id
),
o30 AS (
  SELECT CAST(ShopID AS STRING) AS shop_id, SUM(TotalOrder) AS orders30
  FROM `trueda.trueprofit.shop_insights`
  WHERE Date >= FORMAT_DATE('%Y-%m-%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
  GROUP BY 1
)
SELECT i.surface, i.kw_raw, i.country,
  COUNT(DISTINCT i.shop_id) AS installs,
  COUNT(DISTINCT IF(t.paid_tx > 0, i.shop_id, NULL)) AS paying_shops,
  ROUND(SUM(IFNULL(t.net, 0)), 2) AS net_value,
  MAX(IFNULL(o.orders30, 0)) AS largest_shop_orders30,
  COUNTIF(IFNULL(o.orders30, 0) = 0) AS shops_zero_orders30
FROM inst i LEFT JOIN tx t ON t.shop_id = i.shop_id LEFT JOIN o30 o ON o.shop_id = i.shop_id
GROUP BY 1,2,3
ORDER BY net_value DESC

Kết quả lớn nên tool sẽ ghi ra một file .txt và cho bạn đường dẫn. Không đọc file đó vào chat. Ghi nhớ đường dẫn.

Bước 3 — Lấy payload dashboard hiện tại để giữ cột Cluster: chạy Bash
`curl -s -m 120 -o .net-value-run/payload.json https://appstore-performance.vercel.app/api/sheets`

Bước 4 — Dựng file đẩy: chạy Bash
`node scripts/net-value/build.mjs "<đường dẫn file kết quả BigQuery>" .net-value-run/nv-final.json .net-value-run/payload.json`
Kỳ vọng in ra rows>=900 và installs>=1500. Nhỏ hơn thì dừng, báo lỗi, KHÔNG đẩy.

Bước 5 — Đẩy vào sheet: chạy Bash
`node scripts/net-value/push.mjs .net-value-run/nv-final.json "<hôm qua dd/mm/yyyy>"`
Kỳ vọng in `200 {"ok":true,...}`.

Bước 6 — Xác nhận: chạy Bash
`curl -s -m 120 https://appstore-performance.vercel.app/api/sheets | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);const q=p.data??p;console.log(q.netValueScope, q.netValuePerInstall.length)})"`
Scope phải chứa ngày hôm qua.

Kết thúc bằng đúng một dòng tóm tắt: ngày, số dòng, install, net value, và OK hay lỗi ở bước nào.

Bước 7 — Doanh thu theo nước (khối Core market). Gọi `mcp__claude_ai_TrueProfit_DA__run_query` với max_rows 500 và SQL sau (nguyên văn; kỳ = 4 tháng gần nhất đã kết thúc, tự tính trong SQL):

WITH w AS (
  SELECT DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 4 MONTH), MONTH) AS win_from,
         LAST_DAY(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)) AS win_to
),
installed AS (
  SELECT e.shop_id, MIN(TIMESTAMP_ADD(e.occurred_at, INTERVAL 7 HOUR)) AS installed_at
  FROM `trueda.trueprofit.partner_events` e
  CROSS JOIN w
  LEFT JOIN `trueda.trueprofit.testing_shops` t ON t.shop_id = e.shop_id
  WHERE e.type IN ('RELATIONSHIP_INSTALLED','RELATIONSHIP_REACTIVATED') AND t.shop_id IS NULL
    AND DATE(TIMESTAMP_ADD(e.occurred_at, INTERVAL 7 HOUR)) BETWEEN w.win_from AND w.win_to
  GROUP BY e.shop_id
),
rev AS (
  SELECT i.shop_id,
    SUM(IF(TIMESTAMP_ADD(t.created_at, INTERVAL 7 HOUR) >= i.installed_at, t.gross_amount, 0)) AS gross,
    SUM(IF(TIMESTAMP_ADD(t.created_at, INTERVAL 7 HOUR) >= i.installed_at, t.net_amount, 0)) AS net,
    COUNTIF(TIMESTAMP_ADD(t.created_at, INTERVAL 7 HOUR) >= i.installed_at AND t.kind = 'AppSubscriptionSale' AND t.gross_amount > 0) AS paid_tx
  FROM installed i JOIN `trueda.trueprofit.partner_transactions` t ON t.shop_id = i.shop_id
  CROSS JOIN w
  WHERE DATE(TIMESTAMP_ADD(t.created_at, INTERVAL 7 HOUR)) >= w.win_from
  GROUP BY i.shop_id
)
SELECT (SELECT CAST(win_from AS STRING) FROM w) AS win_from, (SELECT CAST(win_to AS STRING) FROM w) AS win_to,
  IFNULL(NULLIF(TRIM(s.CountryName), ''), '(unknown)') AS country,
  COUNT(DISTINCT i.shop_id) AS installs,
  COUNT(DISTINCT IF(r.paid_tx > 0, i.shop_id, NULL)) AS first_paid,
  ROUND(SUM(IFNULL(r.gross,0)),2) AS gross, ROUND(SUM(IFNULL(r.net,0)),2) AS net
FROM installed i
LEFT JOIN `trueda.trueprofit.shops` s ON CAST(s.ID AS STRING) = i.shop_id
LEFT JOIN rev r ON r.shop_id = i.shop_id
GROUP BY 3 ORDER BY gross DESC

Kết quả khoảng 120 dòng, thường trả thẳng trong chat. Dùng tool Write ghi NGUYÊN JSON kết quả (cả object {rows:[...]} hoặc chỉ mảng rows) vào `.net-value-run/countries.json`. Nếu tool báo đã lưu ra file .txt thì dùng đường dẫn đó thay cho countries.json.

Bước 8 — Dựng và đẩy: chạy Bash
`node scripts/net-value/build-countries.mjs .net-value-run/countries.json .net-value-run/countries-body.json`
Kỳ vọng countries>=60 và installs>=2000. Nhỏ hơn thì dừng, báo lỗi, KHÔNG đẩy. Rồi
`node scripts/net-value/push-countries.mjs .net-value-run/countries-body.json`
Kỳ vọng `200 {"ok":true,...}`.

Bước 9 — Xác nhận: chạy Bash
`curl -s -m 120 https://appstore-performance.vercel.app/api/sheets | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);const q=p.data??p;console.log(q.perGeoRevenuePeriod, q.perGeoRevenue.length)})"`
perGeoRevenuePeriod phải chứa kỳ 4 tháng (ví dụ "01/05/2026 → 31/08/2026").

Dòng tóm tắt cuối bổ sung thêm: số nước, install và gross của khối doanh thu, OK hay lỗi.

Bước 10 — Tab Max bid cap (NPI, Bid Rec). Đọc tab hiện tại để giữ cấu hình: chạy Bash
`curl -s -m 120 -H "x-upload-token: $(cat scripts/net-value/.token)" "https://appstore-performance.vercel.app/api/sheets/raw?tab=Max%20bid%20cap&rows=2000" -o .net-value-run/bidcap-raw.json`
Rồi dựng: `node scripts/net-value/build-npi.mjs .net-value-run/bidcap-raw.json .net-value-run/nv-final.json .net-value-run/countries-body.json .net-value-run/payload.json .net-value-run/bidcap-body.json`
Kỳ vọng rows>=1300 và active>=400. Nhỏ hơn thì dừng, báo lỗi, KHÔNG đẩy.

Bước 11 — Đẩy: `node scripts/net-value/push-bidcap.mjs .net-value-run/bidcap-body.json` → kỳ vọng `200 {"ok":true,...}`.

Bước 12 — Xác nhận: chạy Bash
`curl -s -m 120 https://appstore-performance.vercel.app/api/sheets | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);const q=p.data??p;const b=q.bidCap;console.log('bidCap',b.length,'| có NPI',b.filter(r=>r.netValue!=null&&r.netValue>0).length,'| US Brand B1 NPI',b.find(r=>r.country==='United States'&&r.category==='Brand')?.netValue)})"`

Dòng tóm tắt cuối bổ sung: Max bid cap số dòng active/paused, OK hay lỗi.

Bước 13 — GA4 gốc theo ngày (thay History_Daily của Apps Script). Gọi `mcp__claude_ai_TrueProfit_GA_MCP__ga_report_to_bq` BỐN lần, property_id 348654457, date_ranges [{"start_date": "<hôm qua trừ 110 ngày, YYYY-MM-DD>", "end_date": "<hôm qua YYYY-MM-DD>"}], write_mode "overwrite":
 a) dimensions ["date","landingPagePlusQueryString"], metrics ["totalUsers","sessions"], dimension_filter {"filter":{"field_name":"landingPagePlusQueryString","string_filter":{"match_type":"CONTAINS","value":"surface_type=search"}}}, dest_table "trueprofit.ga_daily_lp_current"
 b) dimensions ["date","landingPagePlusQueryString"], metrics ["eventCount"], dimension_filter {"and_group":{"expressions":[{"filter":{"field_name":"eventName","string_filter":{"match_type":"EXACT","value":"shopify_app_install"}}},{"filter":{"field_name":"landingPagePlusQueryString","string_filter":{"match_type":"CONTAINS","value":"surface_type=search"}}}]}}, dest_table "trueprofit.ga_daily_install_current"
 c) như (a) nhưng dimensions ["date","country","landingPagePlusQueryString"], metrics ["totalUsers"], dest_table "trueprofit.ga_daily_lp_country_current"
 d) như (b) nhưng dimensions ["date","country","landingPagePlusQueryString"], dest_table "trueprofit.ga_daily_install_country_current"
Kỳ vọng mỗi lần rows_written > 0.

Bước 14 — Tổng hợp trong BigQuery. Gọi `mcp__claude_ai_TrueProfit_DA__run_query` với max_rows 20000, HAI SQL sau (kết quả lớn, tool ghi ra file .txt; ghi nhớ đường dẫn, KHÔNG đọc vào chat):

SQL daily:
WITH u AS (SELECT date, landing_page_plus_query_string AS lp, total_users, sessions FROM `trueda.trueprofit.ga_daily_lp_current`),
i AS (SELECT date, landing_page_plus_query_string AS lp, event_count FROM `trueda.trueprofit.ga_daily_install_current`),
pu AS (SELECT date, REGEXP_EXTRACT(lp, r'surface_type=([^&]+)') AS surface, REGEXP_EXTRACT(lp, r'surface_detail=([^&]+)') AS kw_raw, SAFE_CAST(REGEXP_EXTRACT(lp, r'surface_inter_position=([^&]+)') AS FLOAT64) AS pos, total_users, sessions FROM u),
pi AS (SELECT date, REGEXP_EXTRACT(lp, r'surface_type=([^&]+)') AS surface, REGEXP_EXTRACT(lp, r'surface_detail=([^&]+)') AS kw_raw, event_count FROM i),
ug AS (SELECT date, surface, kw_raw, SUM(total_users) AS users, SUM(sessions) AS sessions, SAFE_DIVIDE(SUM(IF(pos IS NOT NULL, pos * total_users, 0)), SUM(IF(pos IS NOT NULL, total_users, 0))) AS pos FROM pu WHERE surface IN ('search','search_ad') AND kw_raw IS NOT NULL GROUP BY 1,2,3),
ig AS (SELECT date, surface, kw_raw, SUM(event_count) AS installs FROM pi WHERE surface IN ('search','search_ad') AND kw_raw IS NOT NULL GROUP BY 1,2,3)
SELECT COALESCE(ug.date, ig.date) AS date, COALESCE(ug.surface, ig.surface) AS surface, COALESCE(ug.kw_raw, ig.kw_raw) AS kw_raw, IFNULL(ug.users, 0) AS users, IFNULL(ug.sessions, 0) AS sessions, ug.pos, IFNULL(ig.installs, 0) AS installs
FROM ug FULL OUTER JOIN ig ON ug.date = ig.date AND ug.surface = ig.surface AND ug.kw_raw = ig.kw_raw ORDER BY date, surface, kw_raw

SQL country: y hệt nhưng đọc `ga_daily_lp_country_current` / `ga_daily_install_country_current`, thêm cột `country` vào mọi SELECT/GROUP BY/JOIN (không có sessions).

Bước 15 — Dựng và đẩy: copy hai file kết quả vào `.net-value-run/ga4-daily.json` và `.net-value-run/ga4-daily-country.json` (Bash `cp`), rồi
`node scripts/net-value/build-ga4-daily.mjs .net-value-run/ga4-daily.json .net-value-run/ga4-daily-country.json .net-value-run 100`
Kỳ vọng rows >= 1500. Rồi `node scripts/net-value/push-ga4-daily.mjs .net-value-run/ga4-daily-body.json .net-value-run/ga4-daily-country-body.json` → hai dòng `200 {"ok":true,...}`.

Bước 16 — Xác nhận: chạy Bash
`curl -s -m 120 https://appstore-performance.vercel.app/api/sheets | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);const q=p.data??p;console.log('historyDailySource',q.historyDailySource,'| rows',q.historyDaily.length)})"`
Kỳ vọng historyDailySource = ga4_bq. Dòng tóm tắt cuối bổ sung: GA4 daily số dòng, OK hay lỗi.
