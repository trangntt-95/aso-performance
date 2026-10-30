#!/usr/bin/env bash
# Pipeline GA4 → sheet KHÔNG cần Claude/MCP/BigQuery: GA4 Data API (service account)
# → build-ga4-daily / build-ga4-windows → push lên sheet. Chạy trên GitHub Actions
# (.github/workflows/ga4-daily.yml) hoặc tay: bash scripts/net-value/ga4-daily.sh
# env: GOOGLE_SERVICE_ACCOUNT_KEY (JSON hoặc base64) hoặc GOOGLE_APPLICATION_CREDENTIALS,
#      NET_VALUE_UPLOAD_TOKEN, tuỳ chọn GA4_DAYS (mặc định 370), DASHBOARD_URL.
set -euo pipefail
cd "$(dirname "$0")/../.."
RUN=.net-value-run
URL="${DASHBOARD_URL:-https://appstore-performance.vercel.app}"
mkdir -p "$RUN"

echo "== 1/5 GA4 Data API"
node scripts/net-value/fetch-ga4.mjs "$RUN" "${GA4_DAYS:-370}" | tee "$RUN/fetch-summary.json"
node -e "const s=JSON.parse(require('fs').readFileSync('$RUN/fetch-summary.json','utf8'));if(s.daily<1500||s.users<1000){console.error('GA4 quá ít dòng/users, dừng',s);process.exit(1)}"

echo "== 2/5 payload hiện tại (từ điển category)"
curl -sf -m 120 -o "$RUN/payload.json" "$URL/api/sheets"

echo "== 3/5 build + push GA4 daily"
node scripts/net-value/build-ga4-daily.mjs "$RUN/ga4-daily.json" "$RUN/ga4-daily-country.json" "$RUN" 200
node scripts/net-value/push-ga4-daily.mjs "$RUN/ga4-daily-body.json" "$RUN/ga4-daily-country-body.json"

echo "== 4/5 build + push GA4 windows"
node scripts/net-value/build-ga4-windows.mjs "$RUN/ga4-daily.json" "$RUN/ga4-daily-country.json" "$RUN/payload.json" "$RUN/ga4-windows-body.json"
node scripts/net-value/push-ga4-windows.mjs "$RUN/ga4-windows-body.json"

echo "== 5/5 xác nhận"
curl -sf -m 120 "$URL/api/sheets" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);const q=p.data??p;const h=q.historyDaily||[];const last=h.map(r=>r.snapshotDate).sort().pop();console.log('historyDailySource',q.historyDailySource,'| rows',h.length,'| lastDate',last,'| keywordTabsSource',JSON.stringify(q.keywordTabsSource),'| allL30',q.allL30.length);const y=new Date(Date.now()-864e5).toISOString().slice(0,10);if(last!==y){console.error('lastDate != hôm qua ('+y+')');process.exit(1)}})"
echo "GA4_PIPELINE_OK"
