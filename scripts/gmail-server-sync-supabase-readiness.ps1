param(
  [string]$DatabaseUrl = "",
  [switch]$PrintSqlOnly,
  [int]$TimeoutSec = 30
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$MigrationPath = Join-Path $RepoRoot "supabase/migrations/20260507000000_add_gmail_server_sync.sql"

function Assert-FileExists {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    throw "[gmail-supabase-readiness] missing required file: $Path"
  }
}

function Get-EffectiveDatabaseUrl {
  if (-not [string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    return $DatabaseUrl
  }
  if (-not [string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL)) {
    return $env:SUPABASE_DB_URL
  }
  if (-not [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    return $env:DATABASE_URL
  }
  return ""
}

function Get-PsqlCommand {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($null -eq $cmd) {
    return $null
  }
  return $cmd.Source
}

function Invoke-ReadOnlySql {
  param(
    [string]$Psql,
    [string]$ConnectionString,
    [string]$Sql
  )

  $env:PGOPTIONS = "-c statement_timeout=$($TimeoutSec * 1000) -c default_transaction_read_only=on"
  try {
    $output = & $Psql $ConnectionString -X -v "ON_ERROR_STOP=1" -A -t -c $Sql
    if ($LASTEXITCODE -ne 0) {
      throw "[gmail-supabase-readiness] psql exited with code $LASTEXITCODE"
    }
    return ($output | Out-String).Trim()
  } finally {
    Remove-Item Env:\PGOPTIONS -ErrorAction SilentlyContinue
  }
}

function Assert-Equals {
  param(
    [string]$Name,
    [string]$Actual,
    [string]$Expected
  )
  if ($Actual -ne $Expected) {
    throw "[gmail-supabase-readiness] $Name expected '$Expected' but got '$Actual'"
  }
  Write-Host "[gmail-supabase-readiness] ${Name}: PASS"
}

$sqlChecks = [ordered]@{
  "user_settings.gmail_refresh_token column" = @"
select case when exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_settings'
    and column_name = 'gmail_refresh_token'
    and data_type = 'text'
) then 'PASS' else 'FAIL' end;
"@
  "gmail_sync_queue table" = @"
select case when exists (
  select 1
  from information_schema.tables
  where table_schema = 'public'
    and table_name = 'gmail_sync_queue'
) then 'PASS' else 'FAIL' end;
"@
  "gmail_sync_queue RLS enabled" = @"
select case when exists (
  select 1
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'gmail_sync_queue'
    and c.relrowsecurity = true
) then 'PASS' else 'FAIL' end;
"@
  "gmail_sync_queue_owner policy" = @"
select case when exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'gmail_sync_queue'
    and policyname = 'gmail_sync_queue_owner'
) then 'PASS' else 'FAIL' end;
"@
  "gmail_sync_queue unique user/email/attachment" = @"
select case when exists (
  select 1
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'gmail_sync_queue'
    and con.contype = 'u'
    and pg_get_constraintdef(con.oid) ~ 'UNIQUE \(user_id, email_id, attachment_id\)'
) then 'PASS' else 'FAIL' end;
"@
}

Assert-FileExists -Path $MigrationPath
Write-Host "[gmail-supabase-readiness] repo: $RepoRoot"
Write-Host "[gmail-supabase-readiness] migration file: $MigrationPath"

if ($PrintSqlOnly) {
  Write-Host "[gmail-supabase-readiness] SQL checks:"
  foreach ($entry in $sqlChecks.GetEnumerator()) {
    Write-Host ""
    Write-Host "-- $($entry.Key)"
    Write-Host $entry.Value.Trim()
  }
  Write-Host "[gmail-supabase-readiness] PASS (printed SQL only)"
  exit 0
}

$effectiveDatabaseUrl = Get-EffectiveDatabaseUrl
if ([string]::IsNullOrWhiteSpace($effectiveDatabaseUrl)) {
  throw "[gmail-supabase-readiness] set SUPABASE_DB_URL or DATABASE_URL, or pass -DatabaseUrl. Do not commit secrets."
}

$psql = Get-PsqlCommand
if ($null -eq $psql) {
  throw "[gmail-supabase-readiness] psql was not found on PATH. Install PostgreSQL client tools or rerun with -PrintSqlOnly."
}

Write-Host "[gmail-supabase-readiness] psql: $psql"
foreach ($entry in $sqlChecks.GetEnumerator()) {
  $actual = Invoke-ReadOnlySql -Psql $psql -ConnectionString $effectiveDatabaseUrl -Sql $entry.Value
  Assert-Equals -Name $entry.Key -Actual $actual -Expected "PASS"
}

Write-Host "[gmail-supabase-readiness] PASS"
