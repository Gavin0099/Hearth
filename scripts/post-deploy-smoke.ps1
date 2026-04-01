param(
  [string]$ApiBaseUrl = "https://hearth-api.reiko0099.workers.dev",
  [string]$WebUrl = "https://hearth-web.pages.dev",
  [string]$BearerToken = "",
  [string]$AccountId = "",
  [switch]$ExerciseTransactions,
  [switch]$ExerciseReport,
  [switch]$ExerciseImports,
  [switch]$ExerciseRecurring,
  [switch]$ExerciseOps,
  [switch]$RequireOpsHealthy,
  [switch]$RequireOpsZeroReportErrors,
  [int]$OpsMaxAgeMinutes = 0,
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

function Resolve-OwnedAccountId {
  param(
    [hashtable]$Headers,
    [string]$PreferredAccountId
  )

  if (-not [string]::IsNullOrWhiteSpace($PreferredAccountId)) {
    return $PreferredAccountId
  }

  $accountsJson = Assert-ApiOk -Name "api accounts list (resolve account)" -Url "$ApiBaseUrl/api/accounts" -Headers $Headers
  if (-not $accountsJson.items -or $accountsJson.items.Count -lt 1) {
    throw "[smoke] requires at least one owned account."
  }

  $resolvedAccountId = [string]$accountsJson.items[0].id
  Write-Host "[smoke] using first owned account: $resolvedAccountId"
  return $resolvedAccountId
}

function Invoke-MultipartValidationCheck {
  param(
    [string]$Name,
    [string]$Url,
    [hashtable]$Headers,
    [hashtable]$Fields,
    [string]$ExpectedCode = "validation_error"
  )

  Write-Host "[smoke] check $Name => multipart $Url"

  $handler = New-Object System.Net.Http.HttpClientHandler
  $client = New-Object System.Net.Http.HttpClient($handler)
  try {
    foreach ($kv in $Headers.GetEnumerator()) {
      if ($kv.Key -ieq "content-type") {
        continue
      }
      $client.DefaultRequestHeaders.Remove($kv.Key) | Out-Null
      $client.DefaultRequestHeaders.Add($kv.Key, [string]$kv.Value)
    }

    $content = New-Object System.Net.Http.MultipartFormDataContent
    foreach ($field in $Fields.GetEnumerator()) {
      $stringContent = New-Object System.Net.Http.StringContent([string]$field.Value)
      $content.Add($stringContent, [string]$field.Key)
    }

    $response = $client.PostAsync($Url, $content).GetAwaiter().GetResult()
    $statusCode = [int]$response.StatusCode
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $json = $body | ConvertFrom-Json

    if ($statusCode -ne 400) {
      throw "[smoke] $Name expected HTTP 400, got $statusCode"
    }
    if ($json.status -ne "error") {
      throw "[smoke] $Name expected status=error"
    }
    if ($json.code -ne $ExpectedCode) {
      throw "[smoke] $Name expected code=$ExpectedCode, got $($json.code)"
    }
  }
  finally {
    if ($null -ne $client) {
      $client.Dispose()
    }
    if ($null -ne $handler) {
      $handler.Dispose()
    }
  }
}

function Invoke-ApiExpectError {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers,
    [string]$Body,
    [int]$ExpectedStatusCode,
    [string]$ExpectedCode = "validation_error"
  )

  Write-Host "[smoke] check $Name => expect error $Method $Url"

  $handler = New-Object System.Net.Http.HttpClientHandler
  $client = New-Object System.Net.Http.HttpClient($handler)
  try {
    foreach ($kv in $Headers.GetEnumerator()) {
      if ($kv.Key -ieq "content-type") {
        continue
      }
      $client.DefaultRequestHeaders.Remove($kv.Key) | Out-Null
      $client.DefaultRequestHeaders.Add($kv.Key, [string]$kv.Value)
    }

    $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::$Method, $Url)
    if (-not [string]::IsNullOrWhiteSpace($Body)) {
      $request.Content = New-Object System.Net.Http.StringContent($Body, [System.Text.Encoding]::UTF8, "application/json")
    }

    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    $statusCode = [int]$response.StatusCode
    $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $json = $responseBody | ConvertFrom-Json

    if ($statusCode -ne $ExpectedStatusCode) {
      throw "[smoke] $Name expected HTTP $ExpectedStatusCode, got $statusCode"
    }
    if ($json.status -ne "error") {
      throw "[smoke] $Name expected status=error"
    }
    if ($json.code -ne $ExpectedCode) {
      throw "[smoke] $Name expected code=$ExpectedCode, got $($json.code)"
    }
  }
  finally {
    if ($null -ne $client) {
      $client.Dispose()
    }
    if ($null -ne $handler) {
      $handler.Dispose()
    }
  }
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
    $resolvedAccountId = Resolve-OwnedAccountId -Headers $headers -PreferredAccountId $AccountId

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
  } elseif ($ExerciseReport) {
    $now = Get-Date
    $year = $now.ToString("yyyy")
    $month = $now.ToString("%M")
    $reportJson = Assert-ApiOk -Name "api monthly report" -Url "$ApiBaseUrl/api/report/monthly?year=$year&month=$month" -Headers $headers
    if (-not $reportJson.summary) {
      throw "[smoke] monthly report response missing summary payload"
    }
  }

  if ($ExerciseImports) {
    $resolvedAccountId = Resolve-OwnedAccountId -Headers $headers -PreferredAccountId $AccountId
    Invoke-MultipartValidationCheck -Name "import transactions-csv validation" -Url "$ApiBaseUrl/api/import/transactions-csv" -Headers $headers -Fields @{ account_id = $resolvedAccountId }
    Invoke-MultipartValidationCheck -Name "import sinopac-tw validation" -Url "$ApiBaseUrl/api/import/sinopac-tw" -Headers $headers -Fields @{ account_id = $resolvedAccountId }
    Invoke-MultipartValidationCheck -Name "import credit-card-tw validation" -Url "$ApiBaseUrl/api/import/credit-card-tw" -Headers $headers -Fields @{ account_id = $resolvedAccountId }
    Invoke-MultipartValidationCheck -Name "import excel-monthly validation" -Url "$ApiBaseUrl/api/import/excel-monthly" -Headers $headers -Fields @{ account_id = $resolvedAccountId }
  }

  if ($ExerciseRecurring) {
    $null = Assert-ApiOk -Name "api recurring templates list" -Url "$ApiBaseUrl/api/recurring-templates" -Headers $headers
    $invalidApplyBody = @{
      year = 2026
      month = 13
    } | ConvertTo-Json
    Invoke-ApiExpectError -Name "api recurring apply validation" -Method "Post" -Url "$ApiBaseUrl/api/recurring-templates/apply" -Headers @{
      Authorization = "Bearer $BearerToken"
      "content-type" = "application/json"
    } -Body $invalidApplyBody -ExpectedStatusCode 400 -ExpectedCode "validation_error"
  }

  if ($ExerciseOps) {
    $opsUrl = "$ApiBaseUrl/api/ops/job-runs/latest?job_name=daily-update"
    if ($RequireOpsHealthy) {
      $opsUrl += "&require_status=ok"
      if ($OpsMaxAgeMinutes -gt 0) {
        $opsUrl += "&max_age_minutes=$OpsMaxAgeMinutes"
      }
    }
    if ($RequireOpsZeroReportErrors) {
      $opsUrl += "&require_zero_errors=true"
    }
    $opsJson = Assert-ApiOk -Name "api latest daily-update job run" -Url $opsUrl -Headers $headers
    if (-not ($opsJson.PSObject.Properties.Name -contains "item")) {
      throw "[smoke] ops latest job-run response missing item field"
    }
    if (($RequireOpsHealthy -or $RequireOpsZeroReportErrors) -and -not $opsJson.healthy) {
      throw "[smoke] latest daily-update job run is unhealthy: $($opsJson.reason)"
    }
  }
} else {
  Write-Host "[smoke] skip authenticated checks (no bearer token provided)"
}

Write-Host "[smoke] PASS"
