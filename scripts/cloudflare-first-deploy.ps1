param(
  [string]$PagesProjectName = "hearth-web",
  [string]$ApiBaseUrl = "https://hearth-api.meiraybooks.workers.dev",
  [switch]$SkipReadiness,
  [switch]$SkipWhoAmI,
  [switch]$AutoCreatePagesProject,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Run-Step {
  param(
    [string]$Name,
    [string]$Command
  )

  Write-Host "[deploy] $Name"
  if ($DryRun) {
    Write-Host "[deploy] dry-run: $Command"
    return
  }

  Invoke-Expression $Command
  if ($LASTEXITCODE -ne 0) {
    throw "[deploy] step failed ($Name): $Command"
  }
}

function Ensure-PagesProject {
  param(
    [string]$Name
  )

  if (-not $AutoCreatePagesProject) {
    return
  }

  Write-Host "[deploy] ensure pages project: $Name"
  if ($DryRun) {
    Write-Host "[deploy] dry-run: npx wrangler pages project create $Name --production-branch main"
    return
  }

  $createOutput = cmd /c "npx wrangler pages project create $Name --production-branch main 2>&1"
  if ($LASTEXITCODE -ne 0) {
    $joined = ($createOutput | Out-String)
    if ($joined -match "already exists" -or $joined -match "already in use") {
      return
    }
    throw "[deploy] failed to create pages project: $Name"
  }
}

function Build-WebWithApiBaseUrl {
  param(
    [string]$ResolvedApiBaseUrl
  )

  Write-Host "[deploy] build web (VITE_API_BASE_URL=$ResolvedApiBaseUrl)"
  if ($DryRun) {
    Write-Host "[deploy] dry-run: set VITE_API_BASE_URL=$ResolvedApiBaseUrl and run npm --workspace @hearth/web run build"
    return
  }

  $previous = $env:VITE_API_BASE_URL
  try {
    $env:VITE_API_BASE_URL = $ResolvedApiBaseUrl
    npm --workspace @hearth/web run build
    if ($LASTEXITCODE -ne 0) {
      throw "[deploy] step failed (build web): npm --workspace @hearth/web run build"
    }
  }
  finally {
    if ($null -eq $previous) {
      Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue
    } else {
      $env:VITE_API_BASE_URL = $previous
    }
  }
}

Write-Host "[deploy] Hearth first deploy flow (Cloudflare)"
Write-Host "[deploy] repo: D:\Hearth"
Write-Host "[deploy] pages project: $PagesProjectName"
Write-Host "[deploy] api base url for web build: $ApiBaseUrl"

if (-not $SkipReadiness) {
  Run-Step -Name "strict readiness" -Command "npm run readiness:first:strict"
} else {
  Write-Host "[deploy] strict readiness skipped"
}

Run-Step -Name "wrangler version" -Command "npx wrangler --version"

if (-not $SkipWhoAmI) {
  Run-Step -Name "wrangler whoami" -Command "npx wrangler whoami"
} else {
  Write-Host "[deploy] wrangler whoami skipped"
}

Ensure-PagesProject -Name $PagesProjectName

Run-Step -Name "deploy API worker" -Command "npx wrangler deploy --config apps/api/wrangler.jsonc"
Build-WebWithApiBaseUrl -ResolvedApiBaseUrl $ApiBaseUrl
Run-Step -Name "deploy Pages" -Command "npx wrangler pages deploy apps/web/dist --project-name $PagesProjectName"

Write-Host "[deploy] DONE"
