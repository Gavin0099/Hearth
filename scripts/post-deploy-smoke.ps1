param(
  [string]$ApiBaseUrl = "https://hearth-api.reiko0099.workers.dev",
  [string]$WebUrl = "https://hearth-web.pages.dev",
  [string]$BearerToken = "",
  [int]$TimeoutSec = 30
)

$ErrorActionPreference = "Stop"

function Assert-UrlReachable {
  param(
    [string]$Name,
    [string]$Url,
    [hashtable]$Headers = @{}
  )

  Write-Host "[smoke] check $Name => $Url"
  $response = Invoke-WebRequest -Uri $Url -Method Get -Headers $Headers -TimeoutSec $TimeoutSec -UseBasicParsing
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

if (-not [string]::IsNullOrWhiteSpace($BearerToken)) {
  $headers = @{
    Authorization = "Bearer $BearerToken"
  }

  $meResponse = Assert-UrlReachable -Name "api auth me" -Url "$ApiBaseUrl/api/auth/me" -Headers $headers
  $meJson = $meResponse.Content | ConvertFrom-Json
  if ($meJson.status -ne "ok") {
    throw "[smoke] /api/auth/me did not return status=ok"
  }

  $accountsResponse = Assert-UrlReachable -Name "api accounts list" -Url "$ApiBaseUrl/api/accounts" -Headers $headers
  $accountsJson = $accountsResponse.Content | ConvertFrom-Json
  if ($accountsJson.status -ne "ok") {
    throw "[smoke] /api/accounts did not return status=ok"
  }
} else {
  Write-Host "[smoke] skip authenticated checks (no bearer token provided)"
}

Write-Host "[smoke] PASS"
