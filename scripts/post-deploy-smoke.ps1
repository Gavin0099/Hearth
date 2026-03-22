param(
  [string]$ApiBaseUrl = "https://hearth-api.reiko0099.workers.dev",
  [string]$WebUrl = "https://hearth-web.pages.dev",
  [string]$BearerToken = "",
  [string]$AccountId = "",
  [switch]$ExerciseTransactions,
  [switch]$ExerciseReport,
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

function Assert-ApiOk {
  param(
    [string]$Name,
    [string]$Url,
    [hashtable]$Headers = @{}
  )

  $response = Assert-UrlReachable -Name $Name -Url $Url -Headers $Headers
  $json = $response.Content | ConvertFrom-Json
  if ($json.status -ne "ok") {
    throw "[smoke] $Name response status is not ok"
  }

  return $json
}

function Invoke-ApiJson {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers,
    [string]$Body = ""
  )

  Write-Host "[smoke] check $Name => $Method $Url"
  $requestArgs = @{
    Uri         = $Url
    Method      = $Method
    Headers     = $Headers
    TimeoutSec  = $TimeoutSec
    UseBasicParsing = $true
  }

  if (-not [string]::IsNullOrWhiteSpace($Body)) {
    $requestArgs["Body"] = $Body
  }

  $response = Invoke-WebRequest @requestArgs
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "[smoke] $Name failed with HTTP $($response.StatusCode)"
  }

  $json = $response.Content | ConvertFrom-Json
  if ($json.status -ne "ok") {
    throw "[smoke] $Name response status is not ok"
  }

  return $json
}

Write-Host "[smoke] Hearth post-deploy smoke test"
Write-Host "[smoke] api: $ApiBaseUrl"
Write-Host "[smoke] web: $WebUrl"

$healthJson = Assert-ApiOk -Name "api health" -Url "$ApiBaseUrl/health"

$web = Assert-UrlReachable -Name "web root" -Url $WebUrl
if ($web.Content -notmatch "<title>Hearth</title>") {
  throw "[smoke] web root did not contain expected title"
}

if (-not [string]::IsNullOrWhiteSpace($BearerToken)) {
  $headers = @{
    Authorization = "Bearer $BearerToken"
  }

  $null = Assert-ApiOk -Name "api auth me" -Url "$ApiBaseUrl/api/auth/me" -Headers $headers
  $null = Assert-ApiOk -Name "api accounts list" -Url "$ApiBaseUrl/api/accounts" -Headers $headers

  if ($ExerciseTransactions) {
    $resolvedAccountId = $AccountId
    if ([string]::IsNullOrWhiteSpace($resolvedAccountId)) {
      $accountsJson = Assert-ApiOk -Name "api accounts list (resolve account)" -Url "$ApiBaseUrl/api/accounts" -Headers $headers
      if (-not $accountsJson.items -or $accountsJson.items.Count -lt 1) {
        throw "[smoke] -ExerciseTransactions requires at least one owned account."
      }
      $resolvedAccountId = [string]$accountsJson.items[0].id
      Write-Host "[smoke] using first owned account: $resolvedAccountId"
    }

    $headers["content-type"] = "application/json"
    $probeId = [Guid]::NewGuid().ToString("N")
    $probeDescription = "smoke-probe-$probeId"
    $probeDate = (Get-Date).ToString("yyyy-MM-dd")
    $createdTransactionId = ""

    try {
      $createBody = @{
        account_id = $resolvedAccountId
        date = $probeDate
        amount = -1
        currency = "TWD"
        category = "其他"
        description = $probeDescription
        source = "smoke_probe"
      } | ConvertTo-Json

      $createJson = Invoke-ApiJson -Name "api transaction create" -Method "POST" -Url "$ApiBaseUrl/api/transactions" -Headers $headers -Body $createBody
      if (-not $createJson.items -or $createJson.items.Count -lt 1) {
        throw "[smoke] create transaction returned empty items"
      }

      $createdTransactionId = [string]$createJson.items[0].id
      if ([string]::IsNullOrWhiteSpace($createdTransactionId)) {
        throw "[smoke] created transaction id is empty"
      }

      $encodedQ = [System.Uri]::EscapeDataString($probeDescription)
      $null = Assert-ApiOk -Name "api transaction query" -Url "$ApiBaseUrl/api/transactions?account_id=$resolvedAccountId&q=$encodedQ" -Headers $headers

      if ($ExerciseReport) {
        $now = Get-Date
        $year = $now.ToString("yyyy")
        $month = $now.ToString("%M")
        $reportJson = Assert-ApiOk -Name "api monthly report" -Url "$ApiBaseUrl/api/report/monthly?year=$year&month=$month" -Headers $headers
        if (-not $reportJson.summary) {
          throw "[smoke] monthly report response missing summary payload"
        }
      }
    }
    finally {
      if (-not [string]::IsNullOrWhiteSpace($createdTransactionId)) {
        $null = Invoke-ApiJson -Name "api transaction cleanup" -Method "DELETE" -Url "$ApiBaseUrl/api/transactions/$createdTransactionId" -Headers $headers
      }
    }
  }
} else {
  Write-Host "[smoke] skip authenticated checks (no bearer token provided)"
}

Write-Host "[smoke] PASS"
