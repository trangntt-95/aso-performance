# Chạy pipeline cập nhật Net value per install bằng Claude Code headless.
# Task Scheduler gọi file này mỗi sáng; log ở logs\net-value-YYYYMMDD.log.
#
# 23/09/2026: ba lần chạy theo lịch (18, 21, 23/09) chết với mã 0xC000013A
# (cửa sổ console bị đóng / Ctrl+C) ngay sau dòng "start", không có dòng
# "end". Nguyên nhân khả dĩ nhất: Task Scheduler mở một cửa sổ PowerShell đen
# trên màn hình và cửa sổ bị đóng tay. Vì thế: tiến trình đầu chỉ mở lại chính
# script này ở chế độ ẩn rồi thoát ngay (cửa sổ chỉ hiện chớp), claude chạy
# trong tiến trình ẩn, stdin lấy từ file rỗng, stdout/stderr ghi thẳng ra file.
param([switch]$Hidden)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo
New-Item -ItemType Directory -Force -Path (Join-Path $repo 'logs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $repo '.net-value-run') | Out-Null
$log = Join-Path $repo ("logs\net-value-" + (Get-Date -Format 'yyyyMMdd') + ".log")

if (-not $Hidden) {
  # Mỗi ngày chỉ cần một lần thành công. Task có kích hoạt 08:05 và "chạy bù khi
  # mở máy"; lần sau trong ngày thấy đã có "exit=0" thì thôi, khỏi tốn một lượt Claude.
  if ((Test-Path $log) -and (Select-String -Path $log -Pattern 'exit=0' -Quiet)) {
    "=== skip $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'): hôm nay đã chạy xong" | Out-File -FilePath $log -Encoding utf8 -Append
    exit 0
  }
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Hidden')
  exit 0
}

$prompt = Get-Content (Join-Path $PSScriptRoot 'prompt.md') -Raw
"=== start $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (hidden pid $PID)" | Out-File -FilePath $log -Encoding utf8 -Append
$allowed = 'mcp__claude_ai_TrueProfit_GA_MCP__ga_report_to_bq,mcp__claude_ai_TrueProfit_DA__run_query,Bash(curl *),Bash(node *),Read,Write'
$claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
if (-not (Test-Path $claude)) { $claude = 'claude' }

$run = Join-Path $repo '.net-value-run'
$promptFile = Join-Path $run 'prompt.txt'
$stdinFile = Join-Path $run 'empty-stdin.txt'
$outFile = Join-Path $run 'claude-out.txt'
$errFile = Join-Path $run 'claude-err.txt'
Set-Content -Path $promptFile -Value $prompt -Encoding utf8
Set-Content -Path $stdinFile -Value '' -Encoding ascii
Remove-Item -Path $outFile, $errFile -ErrorAction SilentlyContinue

# Prompt dài (12 bước) → đưa qua stdin thay vì tham số dòng lệnh để không vướng
# giới hạn độ dài / dấu nháy của Windows; claude -p đọc prompt từ stdin.
$p = Start-Process -FilePath $claude -NoNewWindow -Wait -PassThru `
  -ArgumentList @('-p', '--allowedTools', $allowed, '--max-turns', '40') `
  -RedirectStandardInput $promptFile -RedirectStandardOutput $outFile -RedirectStandardError $errFile
if (Test-Path $outFile) { Get-Content $outFile -Raw | Out-File -FilePath $log -Encoding utf8 -Append }
if (Test-Path $errFile) { $e = Get-Content $errFile -Raw; if ($e) { "--- stderr ---`n$e" | Out-File -FilePath $log -Encoding utf8 -Append } }
"=== end $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') exit=$($p.ExitCode)" | Out-File -FilePath $log -Encoding utf8 -Append
