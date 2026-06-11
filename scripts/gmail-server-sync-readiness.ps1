param(
  [string]$ApiBaseUrl = "",
  [switch]$PrintSqlChecks,
  [int]$TimeoutSec = 30
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$MigrationPath = Join-Path $RepoRoot "supabase/migrations/20260507000000_add_gmail_server_sync.sql"
$WranglerPath = Join-Path $RepoRoot "apps/api/wrangler.jsonc"
$RunbookPath = Join-Path $RepoRoot "docs/gmail-server-sync-deploy-runbook.md"
$AppPath = Join-Path $RepoRoot "apps/api/src/app.ts"
$SecretsPath = Join-Path $RepoRoot "apps/api/src/lib/secrets.ts"
$GmailCronPath = Join-Path $RepoRoot "apps/api/src/cron/gmail-sync.ts"

function Assert-FileExists {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    throw "[gmail-readiness] missing required file: $Path"
  }
}

function Assert-Contains {
  param(
    [string]$Name,
    [string]$Text,
    [string]$Pattern
  )

  if ($Text -notmatch $Pattern) {
    throw "[gmail-readiness] $Name missing pattern: $Pattern"
  }
}

function Read-Text {
  param([string]$Path)
  return Get-Content -Path $Path -Raw -Encoding UTF8
}

Write-Host "[gmail-readiness] repo: $RepoRoot"

foreach ($path in @($MigrationPath, $WranglerPath, $RunbookPath, $AppPath, $SecretsPath, $GmailCronPath)) {
  Assert-FileExists -Path $path
}

$migration = Read-Text -Path $MigrationPath
Assert-Contains -Name "migration" -Text $migration -Pattern "ALTER\s+TABLE\s+user_settings\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+gmail_refresh_token\s+TEXT"
Assert-Contains -Name "migration" -Text $migration -Pattern "CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+gmail_sync_queue"
Assert-Contains -Name "migration" -Text $migration -Pattern "ALTER\s+TABLE\s+gmail_sync_queue\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY"
Assert-Contains -Name "migration" -Text $migration -Pattern "CREATE\s+POLICY\s+gmail_sync_queue_owner"
Assert-Contains -Name "migration" -Text $migration -Pattern "UNIQUE\s*\(\s*user_id\s*,\s*email_id\s*,\s*attachment_id\s*\)"
Write-Host "[gmail-readiness] migration shape: PASS"

$wrangler = Read-Text -Path $WranglerPath
Assert-Contains -Name "wrangler crons" -Text $wrangler -Pattern '"0 2 5 \* \*"'
Assert-Contains -Name "wrangler secret note" -Text $wrangler -Pattern "USER_SETTINGS_SECRET_KEY"
Write-Host "[gmail-readiness] wrangler cron/secret hint: PASS"

$secrets = Read-Text -Path $SecretsPath
Assert-Contains -Name "secret fields" -Text $secrets -Pattern '"gmail_refresh_token"'
Write-Host "[gmail-readiness] gmail_refresh_token encryption field: PASS"

$gmailCron = Read-Text -Path $GmailCronPath
Assert-Contains -Name "gmail cron" -Text $gmailCron -Pattern "GOOGLE_CLIENT_ID"
Assert-Contains -Name "gmail cron" -Text $gmailCron -Pattern "GOOGLE_CLIENT_SECRET"
Assert-Contains -Name "gmail cron" -Text $gmailCron -Pattern "gmail_refresh_token"
Assert-Contains -Name "gmail cron" -Text $gmailCron -Pattern "gmail_sync_queue"
Write-Host "[gmail-readiness] cron implementation references: PASS"

$runbook = Read-Text -Path $RunbookPath
foreach ($required in @(
  "supabase/migrations/20260507000000_add_gmail_server_sync.sql",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "USER_SETTINGS_SECRET_KEY",
  "provider_refresh_token",
  "memory/04_validation_log.md"
)) {
  Assert-Contains -Name "runbook" -Text $runbook -Pattern ([regex]::Escape($required))
}
Write-Host "[gmail-readiness] runbook coverage: PASS"

if (-not [string]::IsNullOrWhiteSpace($ApiBaseUrl)) {
  $healthUrl = $ApiBaseUrl.TrimEnd("/") + "/health"
  Write-Host "[gmail-readiness] API health: $healthUrl"
  $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec $TimeoutSec
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "[gmail-readiness] API health returned HTTP $($response.StatusCode)"
  }

  $json = $response.Content | ConvertFrom-Json
  if ($json.status -ne "ok") {
    throw "[gmail-readiness] API health status is not ok"
  }
  if ($json.supabaseConfigured -ne $true) {
    throw "[gmail-readiness] API health reports supabaseConfigured=false"
  }
  if ($json.userSettingsSecretConfigured -ne $true) {
    throw "[gmail-readiness] API health reports userSettingsSecretConfigured=false"
  }
  Write-Host "[gmail-readiness] API health configuration: PASS"
} else {
  Write-Host "[gmail-readiness] API health: SKIPPED (pass -ApiBaseUrl to verify deployed Worker env)"
}

if ($PrintSqlChecks) {
  Write-Host ""
  Write-Host "[gmail-readiness] SQL checks to run after applying migration:"
  Write-Host @"
select column_name
from information_schema.columns
where table_name = 'user_settings'
  and column_name = 'gmail_refresh_token';

select policyname
from pg_policies
where tablename = 'gmail_sync_queue'
  and policyname = 'gmail_sync_queue_owner';

insert into gmail_sync_queue (
  user_id, bank, email_id, email_subject, email_date, attachment_id, attachment_filename, status
) values (
  auth.uid(), 'sinopac', 'readiness-email-id', 'readiness subject',
  now()::text, 'readiness-attachment-id', 'readiness.pdf', 'pending'
);
"@
}

Write-Host "[gmail-readiness] PASS"
