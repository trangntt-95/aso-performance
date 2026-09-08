# Acceptance tests — Trend Dashboard

Chạy từ **thư mục gốc repo** (đường dẫn `apps-script/...` là tương đối):

```
node apps-script/test/trend-dashboard.parse.test.mjs apps-script/test/fixture-by-categories-2026-08.json
node apps-script/test/trend-dashboard.ui.test.mjs    apps-script/test/fixture-by-categories-2026-08.json
```

Hai file test nạp thẳng `trend-dashboard.gs` và khối `<script>` của
`trend-dashboard.html` rồi eval — **code được test đúng là code chạy thật**, không
phải một bản copy dễ lệch. `SpreadsheetApp`, DOM và Chart.js được stub vì không
hàm nào trong phần đang test cần tới chúng.

## Fixture

`fixture-by-categories-2026-08.json` là tab `By categories` của bản export
tháng 8/2026 (`Trang - shopify ad daily (1).xlsx`), 120 dòng × 25 cột đầu.

Fixture cố ý **đóng băng**: handoff §10 ghi rõ số lịch sử t1..t7 bị sửa lại giữa
các lần export, nên test chạy trên sheet sống sẽ đỏ vì lý do không liên quan gì
tới code.

## Một chỗ test khác handoff

§9 ghi `Clicks` = `1543, 1264, 1245, ...`. Dòng tổng của **chính sheet** ghi
`1262, 1243` ở t2/t3, và số tính ra khớp dòng tổng đó. Nên test khẳng định
**"khớp dòng tổng sheet"** thay vì khẳng định literal — literal sẽ đỏ mỗi lần
Trang sửa lại lịch sử, mà đó không phải lỗi.
