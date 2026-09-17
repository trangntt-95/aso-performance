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
