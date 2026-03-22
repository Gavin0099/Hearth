param(
  [string]$ApiBaseUrl = "https://hearth-api.reiko0099.workers.dev",
  [string]$WebUrl = "https://hearth-web.pages.dev",
  [int]$TimeoutSec = 30
)

$ErrorActionPreference = "Stop"

function Assert-UrlReachable {
  param(
    [string]$Name,
    [string]$Url
  )

  Write-Host "[smoke] check $Name => $Url"
  $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec $TimeoutSec -UseBasicParsing
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "[smoke] $Name failed with HTTP $($response.StatusCode)"
  }

  return $response
}

Write-Host "[smoke] Hearth post-deploy smoke test"
Write-Host "[smoke] api: $ApiBaseUrl"
Write-Host "[smoke] web: $WebUrl"

$health = Assert-UrlReachable -Name "api health" -Url "$ApiBaseUrl/health"
$healthJson = $health.Content | ConvertFrom-Json

if ($healthJson.status -ne "ok") {
  throw "[smoke] api health response status is not ok"
}

$web = Assert-UrlReachable -Name "web root" -Url $WebUrl
if ($web.Content -notmatch "<title>Hearth</title>") {
  throw "[smoke] web root did not contain expected title"
}

Write-Host "[smoke] PASS"
