param(
  [switch]$SkipEnv,
  [switch]$SkipWebBuild,
  [switch]$SkipGovernanceGate
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  Write-Host "[readiness] $Name"
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "[readiness] $Name failed with exit code $LASTEXITCODE"
  }
}

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
  Invoke-Step -Name "governance phase gate" -Action { npm run governance:gate }
  Invoke-Step -Name "injection memory validation" -Action { npm run governance:validate-injection-memory }
} else {
  Write-Host "[readiness] governance phase gate skipped"
  Invoke-Step -Name "injection memory validation" -Action { npm run governance:validate-injection-memory }
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

Invoke-Step -Name "api tests" -Action { npm --workspace @hearth/api run test }

Invoke-Step -Name "api build" -Action { npm --workspace @hearth/api run build }

Invoke-Step -Name "web check" -Action { npm --workspace @hearth/web run check }

if (-not $SkipWebBuild) {
  Invoke-Step -Name "web build" -Action { npm --workspace @hearth/web run build }
} else {
  Write-Host "[readiness] web build skipped"
}

Write-Host "[readiness] PASS"
