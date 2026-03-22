param(
  [int]$MaxPlanAgeDays = 7
)

$ErrorActionPreference = "Stop"

Write-Host "[gate] Hearth governance phase gate"
Write-Host "[gate] repo: D:\Hearth"

$today = Get-Date
$todayFile = Join-Path "memory" ("{0:yyyy-MM-dd}.md" -f $today)

if (-not (Test-Path "governance/AGENT.md")) {
  throw "[gate] Missing governance/AGENT.md"
}

if (-not (Test-Path "governance/ARCHITECTURE.md")) {
  throw "[gate] Missing governance/ARCHITECTURE.md"
}

if (-not (Test-Path "governance/TESTING.md")) {
  throw "[gate] Missing governance/TESTING.md"
}

if (-not (Test-Path "PLAN.md")) {
  throw "[gate] Missing PLAN.md"
}

$planRaw = Get-Content -Raw "PLAN.md"
$match = [regex]::Match($planRaw, "最後更新\*\*:\s*(\d{4}-\d{2}-\d{2})")
if (-not $match.Success) {
  throw "[gate] PLAN.md missing 可解析的 '最後更新' 日期"
}

$planDate = [datetime]::ParseExact($match.Groups[1].Value, "yyyy-MM-dd", $null)
$ageDays = [int]([timespan]($today.Date - $planDate.Date)).TotalDays
if ($ageDays -gt $MaxPlanAgeDays) {
  throw "[gate] PLAN.md freshness stale: $ageDays days (limit: $MaxPlanAgeDays)"
}

if (-not (Test-Path $todayFile)) {
  throw "[gate] Missing today's memory file: $todayFile"
}

Write-Host "[gate] PASS"
