param(
  [string]$DatabaseUrl = "",
  [string]$UserEmail = "",
  [string]$UserId = "",
  [switch]$AllUsers,
  [switch]$Apply,
  [switch]$PrintSqlOnly,
  [string]$PsqlPath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-PsqlPath {
  param([string]$ExplicitPath)

  if ($ExplicitPath) {
    if (!(Test-Path -LiteralPath $ExplicitPath)) {
      throw "[gmail-dedupe-cleanup] psql path does not exist: $ExplicitPath"
    }
    return (Resolve-Path -LiteralPath $ExplicitPath).Path
  }

  $fromPath = Get-Command psql -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  $portable = Get-ChildItem -Path "C:\tmp\postgresql-binaries" -Filter "psql.exe" -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($portable) {
    return $portable.FullName
  }

  throw "[gmail-dedupe-cleanup] psql was not found on PATH. Install PostgreSQL client tools or pass -PsqlPath."
}

function Sql-Literal {
  param([string]$Value)
  return "'" + ($Value -replace "'", "''") + "'"
}

function Build-UserPredicate {
  if ($AllUsers) {
    return "TRUE"
  }

  if ($UserId.Trim()) {
    return "a.user_id = " + (Sql-Literal $UserId.Trim()) + "::uuid"
  }

  if ($UserEmail.Trim()) {
    return "a.user_id IN (SELECT id FROM auth.users WHERE lower(email) = lower(" + (Sql-Literal $UserEmail.Trim()) + "))"
  }

  if ($Apply) {
    throw "[gmail-dedupe-cleanup] -Apply requires -UserEmail, -UserId, or explicit -AllUsers."
  }

  return "FALSE"
}

$dbUrl = $DatabaseUrl
if (!$dbUrl) {
  $dbUrl = $env:SUPABASE_DB_URL
}
if (!$dbUrl) {
  $dbUrl = $env:DATABASE_URL
}

$userPredicate = Build-UserPredicate
$mode = if ($Apply) { "apply" } else { "preview" }

$commonCte = @"
WITH scoped AS (
  SELECT
    t.id,
    t.account_id,
    a.user_id,
    t.date,
    t.amount,
    COALESCE(NULLIF(trim(t.currency), ''), 'TWD') AS currency,
    COALESCE(trim(t.description), '') AS description,
    t.source,
    t.category,
    t.created_at
  FROM public.transactions t
  JOIN public.accounts a ON a.id = t.account_id
  WHERE t.source LIKE 'gmail\_%' ESCAPE '\'
    AND $userPredicate
),
ranked AS (
  SELECT
    *,
    COUNT(*) OVER (
      PARTITION BY account_id, date, amount, currency, description, source
    ) AS duplicate_count,
    ROW_NUMBER() OVER (
      PARTITION BY account_id, date, amount, currency, description, source
      ORDER BY
        CASE WHEN NULLIF(trim(COALESCE(category, '')), '') IS NULL THEN 1 ELSE 0 END,
        created_at ASC NULLS LAST,
        id ASC
    ) AS keep_rank
  FROM scoped
)
"@

$previewSql = @"
$commonCte
SELECT
  user_id,
  account_id,
  date,
  amount,
  currency,
  source,
  description,
  COUNT(*) AS duplicate_rows,
  (array_agg(id ORDER BY keep_rank))[1] AS keep_id,
  string_agg(id::text, ', ' ORDER BY keep_rank) FILTER (WHERE keep_rank > 1) AS delete_ids
FROM ranked
WHERE duplicate_count > 1
GROUP BY user_id, account_id, date, amount, currency, source, description
ORDER BY date DESC, source, description, amount;
"@

$applySql = @"
BEGIN;
$commonCte
, deleted AS (
  DELETE FROM public.transactions t
  USING ranked r
  WHERE t.id = r.id
    AND r.duplicate_count > 1
    AND r.keep_rank > 1
  RETURNING t.id, t.account_id, t.date, t.amount, t.currency, t.description, t.source
)
SELECT COUNT(*) AS deleted_rows FROM deleted;
COMMIT;
"@

$sql = if ($Apply) { $applySql } else { $previewSql }

Write-Host "[gmail-dedupe-cleanup] mode: $mode"
Write-Host "[gmail-dedupe-cleanup] scope: $(if ($AllUsers) { 'ALL USERS' } elseif ($UserId) { "user_id=$UserId" } elseif ($UserEmail) { "email=$UserEmail" } else { 'NO USER SELECTED (preview returns no rows)' })"

if ($PrintSqlOnly) {
  $sql
  exit 0
}

if (!$dbUrl) {
  throw "[gmail-dedupe-cleanup] SUPABASE_DB_URL / DATABASE_URL is required, or pass -DatabaseUrl."
}

$psql = Resolve-PsqlPath -ExplicitPath $PsqlPath
Write-Host "[gmail-dedupe-cleanup] psql: $psql"

$tempSql = [System.IO.Path]::GetTempFileName()
try {
  Set-Content -LiteralPath $tempSql -Value $sql -Encoding UTF8
  & $psql $dbUrl -v "ON_ERROR_STOP=1" -f $tempSql
  if ($LASTEXITCODE -ne 0) {
    throw "[gmail-dedupe-cleanup] psql exited with code $LASTEXITCODE"
  }
} finally {
  Remove-Item -LiteralPath $tempSql -Force -ErrorAction SilentlyContinue
}
