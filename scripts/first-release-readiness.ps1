param(
  [switch]$SkipEnv,
  [switch]$SkipWebBuild,
  [switch]$SkipGovernanceGate
)

$ErrorActionPreference = "Stop"

function Get-EnvValue {
  param(
    [string]$Path,
    [string]$Key
  )

  if (-not (Test-Path $Path)) {
    return $null
  }

  $line = Get-Content $Path | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
  if (-not $line) {
    return ""
  }

  return ($line -replace "^$Key=", "").Trim()
}

function Assert-ConfiguredValue {
  param(
    [string]$Path,
    [string]$Key,
    [string[]]$BlockedValues
  )

  $value = Get-EnvValue -Path $Path -Key $Key
  if ($null -eq $value) {
    throw "Missing required file: $Path"
  }

  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing value: $Key in $Path"
  }

  if ($BlockedValues -contains $value) {
    throw "Placeholder value detected: $Key in $Path"
  }
}

Write-Host "[readiness] Hearth first-release readiness check"
Write-Host "[readiness] repo: D:\Hearth"

if (-not $SkipGovernanceGate) {
  Write-Host "[readiness] governance phase gate"
  npm run governance:gate
} else {
  Write-Host "[readiness] governance phase gate skipped"
}

if (-not $SkipEnv) {
  Write-Host "[readiness] env validation"
  Assert-ConfiguredValue -Path ".env" -Key "VITE_API_BASE_URL" -BlockedValues @()
  Assert-ConfiguredValue -Path ".env" -Key "VITE_SUPABASE_URL" -BlockedValues @("https://your-project.supabase.co")
  Assert-ConfiguredValue -Path ".env" -Key "VITE_SUPABASE_ANON_KEY" -BlockedValues @("your-public-anon-key")

  Assert-ConfiguredValue -Path "apps/api/.dev.vars" -Key "SUPABASE_URL" -BlockedValues @("https://your-project.supabase.co")
  Assert-ConfiguredValue -Path "apps/api/.dev.vars" -Key "SUPABASE_ANON_KEY" -BlockedValues @("your-public-anon-key")
  Assert-ConfiguredValue -Path "apps/api/.dev.vars" -Key "SUPABASE_SERVICE_ROLE_KEY" -BlockedValues @("your-service-role-key")
} else {
  Write-Host "[readiness] env validation skipped"
}

Write-Host "[readiness] api tests"
npm --workspace @hearth/api run test

Write-Host "[readiness] api build"
npm --workspace @hearth/api run build

Write-Host "[readiness] web check"
npm --workspace @hearth/web run check

if (-not $SkipWebBuild) {
  Write-Host "[readiness] web build"
  npm --workspace @hearth/web run build
} else {
  Write-Host "[readiness] web build skipped"
}

Write-Host "[readiness] PASS"
