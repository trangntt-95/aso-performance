# Chạy pipeline cập nhật Net value per install bằng Claude Code headless.
# Task Scheduler gọi file này mỗi sáng; log ở logs\net-value-YYYYMMDD.log.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo
New-Item -ItemType Directory -Force -Path (Join-Path $repo 'logs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $repo '.net-value-run') | Out-Null
$log = Join-Path $repo ("logs\net-value-" + (Get-Date -Format 'yyyyMMdd') + ".log")
$prompt = Get-Content (Join-Path $PSScriptRoot 'prompt.md') -Raw
"=== start $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $log -Encoding utf8 -Append
$allowed = 'mcp__claude_ai_TrueProfit_GA_MCP__ga_report_to_bq,mcp__claude_ai_TrueProfit_DA__run_query,Bash(curl *),Bash(node *),Read'
$claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
if (-not (Test-Path $claude)) { $claude = 'claude' }
& $claude -p $prompt --allowedTools $allowed --max-turns 30 2>&1 | Out-File -FilePath $log -Encoding utf8 -Append
"=== end $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') exit=$LASTEXITCODE" | Out-File -FilePath $log -Encoding utf8 -Append
