param(
  [string]$InjectionRoot = "artifacts/runtime/injection"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $InjectionRoot)) {
  Write-Error "Injection root not found: $InjectionRoot"
}

$required = @(
  "memory/01_active_task.md",
  "memory/04_validation_log.md",
  "MEMORY.md"
)

$jsonFiles = Get-ChildItem -Path $InjectionRoot -Recurse -File -Filter *.json |
  Where-Object { $_.Name -ne "token-meta.json" }

if (-not $jsonFiles) {
  Write-Output "No injection json artifacts found under $InjectionRoot"
  exit 0
}

$failed = @()

foreach ($file in $jsonFiles) {
  try {
    $raw = Get-Content -Raw $file.FullName
    $obj = $raw | ConvertFrom-Json
  } catch {
    $failed += "Invalid JSON: $($file.FullName)"
    continue
  }

  $loaded = [string]($obj.contract_fields.LOADED)
  if ([string]::IsNullOrWhiteSpace($loaded)) {
    $failed += "Missing LOADED field: $($file.FullName)"
    continue
  }

  $missing = @()
  foreach ($req in $required) {
    if ($loaded -notlike "*$req*") {
      $missing += $req
    }
  }

  if ($missing.Count -gt 0) {
    $failed += "Missing required memory files in LOADED: $($file.FullName) -> $($missing -join ', ')"
  }
}

if ($failed.Count -gt 0) {
  Write-Output "FAILED: injection memory-load validation"
  $failed | ForEach-Object { Write-Output " - $_" }
  exit 1
}

Write-Output "PASS: all injection artifacts include required memory files in LOADED"
