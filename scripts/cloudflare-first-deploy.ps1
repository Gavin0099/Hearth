param(
  [string]$PagesProjectName = "hearth-web",
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

Write-Host "[deploy] Hearth first deploy flow (Cloudflare)"
Write-Host "[deploy] repo: D:\Hearth"
Write-Host "[deploy] pages project: $PagesProjectName"

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
Run-Step -Name "build web" -Command "npm --workspace @hearth/web run build"
Run-Step -Name "deploy Pages" -Command "npx wrangler pages deploy apps/web/dist --project-name $PagesProjectName"

Write-Host "[deploy] DONE"
