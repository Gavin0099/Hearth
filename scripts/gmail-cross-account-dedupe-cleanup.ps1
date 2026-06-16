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
      throw "[gmail-cross-account-dedupe] psql path does not exist: $ExplicitPath"
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

  throw "[gmail-cross-account-dedupe] psql was not found on PATH. Install PostgreSQL client tools or pass -PsqlPath."
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
    throw "[gmail-cross-account-dedupe] -Apply requires -UserEmail, -UserId, or explicit -AllUsers."
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
    a.name AS account_name,
    a.type AS account_type,
    COALESCE(NULLIF(trim(a.broker), ''), '') AS broker,
    t.date,
    t.amount,
    COALESCE(NULLIF(trim(t.currency), ''), 'TWD') AS currency,
    COALESCE(trim(t.description), '') AS description,
    t.source,
    NULLIF(trim(COALESCE(t.category, '')), '') AS category,
    t.created_at,
    CASE
      WHEN t.source LIKE 'gmail_pdf\_%' ESCAPE '\' THEN 'cash_credit'
      WHEN t.source LIKE 'gmail_bank\_%' ESCAPE '\' THEN 'cash_bank'
      ELSE NULL
    END AS preferred_account_type
  FROM public.transactions t
  JOIN public.accounts a ON a.id = t.account_id
  WHERE t.source LIKE 'gmail\_%' ESCAPE '\'
    AND $userPredicate
),
candidate_groups AS (
  SELECT
    user_id,
    date,
    amount,
    currency,
    description,
    source,
    preferred_account_type,
    COUNT(*) AS duplicate_rows,
    COUNT(DISTINCT account_id) AS distinct_accounts,
    COUNT(DISTINCT account_id) FILTER (WHERE account_type = preferred_account_type) AS preferred_account_count,
    COUNT(DISTINCT account_id) FILTER (WHERE account_type <> preferred_account_type) AS nonpreferred_account_count
  FROM scoped
  WHERE preferred_account_type IS NOT NULL
  GROUP BY user_id, date, amount, currency, description, source, preferred_account_type
  HAVING COUNT(*) > 1
     AND COUNT(DISTINCT account_id) > 1
     AND COUNT(DISTINCT account_id) FILTER (WHERE account_type = preferred_account_type) >= 1
     AND COUNT(DISTINCT account_id) FILTER (WHERE account_type <> preferred_account_type) >= 1
),
ranked AS (
  SELECT
    s.*,
    g.duplicate_rows,
    g.distinct_accounts,
    g.preferred_account_count,
    g.nonpreferred_account_count,
    ROW_NUMBER() OVER (
      PARTITION BY s.user_id, s.date, s.amount, s.currency, s.description, s.source
      ORDER BY
        CASE WHEN s.account_type = s.preferred_account_type THEN 0 ELSE 1 END,
        CASE WHEN s.category IS NULL THEN 1 ELSE 0 END,
        s.created_at ASC NULLS LAST,
        s.id ASC
    ) AS keep_rank
  FROM scoped s
  JOIN candidate_groups g
    ON g.user_id = s.user_id
   AND g.date = s.date
   AND g.amount = s.amount
   AND g.currency = s.currency
   AND g.description = s.description
   AND g.source = s.source
),
repairable AS (
  SELECT *
  FROM ranked
  WHERE preferred_account_count = 1
),
category_fill AS (
  SELECT
    keep.id AS keep_id,
    MAX(other.category) AS fill_category
  FROM repairable keep
  JOIN repairable other
    ON other.user_id = keep.user_id
   AND other.date = keep.date
   AND other.amount = keep.amount
   AND other.currency = keep.currency
   AND other.description = keep.description
   AND other.source = keep.source
  WHERE keep.keep_rank = 1
    AND other.id <> keep.id
    AND other.category IS NOT NULL
  GROUP BY keep.id
)
"@

$previewSql = @"
$commonCte
SELECT
  user_id,
  source,
  preferred_account_type,
  date,
  amount,
  currency,
  description,
  duplicate_rows,
  distinct_accounts,
  MAX(CASE WHEN keep_rank = 1 THEN id::text END) AS keep_id,
  MAX(CASE WHEN keep_rank = 1 THEN account_name END) AS keep_account_name,
  MAX(CASE WHEN keep_rank = 1 THEN account_type END) AS keep_account_type,
  MAX(fill_category) AS category_to_preserve,
  string_agg(
    id::text || ' [' || account_name || ' | ' || account_type || ']',
    ', '
    ORDER BY keep_rank, created_at, id
  ) FILTER (WHERE keep_rank > 1) AS delete_rows
FROM repairable r
LEFT JOIN category_fill f ON f.keep_id = r.id
GROUP BY user_id, source, preferred_account_type, date, amount, currency, description, duplicate_rows, distinct_accounts
ORDER BY date DESC, source, description, amount;
"@

$applySql = @"
BEGIN;
$commonCte
, updated AS (
  UPDATE public.transactions t
  SET category = COALESCE(t.category, f.fill_category)
  FROM category_fill f
  WHERE t.id = f.keep_id
    AND f.fill_category IS NOT NULL
    AND NULLIF(trim(COALESCE(t.category, '')), '') IS NULL
  RETURNING t.id
),
deleted AS (
  DELETE FROM public.transactions t
  USING repairable r
  WHERE t.id = r.id
    AND r.keep_rank > 1
  RETURNING t.id
)
SELECT
  (SELECT COUNT(*) FROM updated) AS updated_rows,
  (SELECT COUNT(*) FROM deleted) AS deleted_rows;
COMMIT;
"@

$sql = if ($Apply) { $applySql } else { $previewSql }

Write-Host "[gmail-cross-account-dedupe] mode: $mode"
Write-Host "[gmail-cross-account-dedupe] scope: $(if ($AllUsers) { 'ALL USERS' } elseif ($UserId) { "user_id=$UserId" } elseif ($UserEmail) { "email=$UserEmail" } else { 'NO USER SELECTED (preview returns no rows)' })"
Write-Host "[gmail-cross-account-dedupe] safety: deletes only groups that have both preferred and non-preferred account types; preferred account count must be exactly 1"

if ($PrintSqlOnly) {
  $sql
  exit 0
}

if (!$dbUrl) {
  throw "[gmail-cross-account-dedupe] SUPABASE_DB_URL / DATABASE_URL is required, or pass -DatabaseUrl."
}

$psql = Resolve-PsqlPath -ExplicitPath $PsqlPath
Write-Host "[gmail-cross-account-dedupe] psql: $psql"

$tempSql = [System.IO.Path]::GetTempFileName()
try {
  Set-Content -LiteralPath $tempSql -Value $sql -Encoding UTF8
  & $psql $dbUrl -v "ON_ERROR_STOP=1" -f $tempSql
  if ($LASTEXITCODE -ne 0) {
    throw "[gmail-cross-account-dedupe] psql exited with code $LASTEXITCODE"
  }
} finally {
  Remove-Item -LiteralPath $tempSql -Force -ErrorAction SilentlyContinue
}
