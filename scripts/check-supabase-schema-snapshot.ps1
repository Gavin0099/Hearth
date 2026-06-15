param(
  [string]$SchemaPath = "supabase/schema.sql",
  [string]$MigrationsPath = "supabase/migrations"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$schemaFullPath = Join-Path $repoRoot $SchemaPath
$migrationsFullPath = Join-Path $repoRoot $MigrationsPath

if (-not (Test-Path -LiteralPath $schemaFullPath)) {
  throw "[schema-snapshot] schema file not found: $schemaFullPath"
}

if (-not (Test-Path -LiteralPath $migrationsFullPath)) {
  throw "[schema-snapshot] migrations directory not found: $migrationsFullPath"
}

$header = @(
  "-- Bootstrap snapshot for fresh projects.",
  "-- Generated from supabase/migrations/*.sql.",
  "-- Canonical schema history lives under supabase/migrations/.",
  ""
) -join "`n"

$files = Get-ChildItem -LiteralPath $migrationsFullPath -Filter "*.sql" | Sort-Object Name
$parts = foreach ($file in $files) {
  "-- migration: $($file.Name)`n" + ((Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8).TrimEnd() -replace "`r`n", "`n")
}

$expected = $header + ($parts -join "`n`n") + "`n"
$actual = (Get-Content -LiteralPath $schemaFullPath -Raw -Encoding UTF8) -replace "`r`n", "`n"

if ($actual -ne $expected) {
  Write-Error "[schema-snapshot] supabase/schema.sql is stale. Regenerate it from supabase/migrations before committing."
  exit 1
}

Write-Host "[schema-snapshot] PASS: supabase/schema.sql matches ordered migrations."
