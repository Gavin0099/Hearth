# Current Task: Product Stabilization After Governance Sync

## Current State

- Hearth `main` is synced with `origin/main`.
- AI Governance submodule is updated to `9f7fa1e3a6b6ac7f90010f7048a23e44ae3ebb52`.
- Governance drift currently passes with `severity=ok`.
- F-7 apply reports framework pointer `already_current`, repo-local instruction `already_current`, memory writer coverage `verified`, hook validator enforcement `updated`, and existing memory normalization `not_verified`; do not claim `full_update_completed` until normalization is verified or explicitly marked not applicable.
- Runtime ledger cleanup is complete: tracked append-only runtime logs were restored, generated artifacts were cleaned with explicit paths, and `dirty_runtime_ledger_detector.py` reported `dirty_count=0`.
- Claude, GitHub Copilot, and Gemini closeout hooks point to Hearth's repo-local `ai-governance-framework` submodule and have smoke-tested compliant.

## Active Work

- Align PLAN and memory with the completed governance refresh.
- Verify Security F-1 documents against the current route and migration implementation.
- GmailSyncPanel and ImportPanel UI token pass is complete for status messages, queue/email rows, preview chips/table, and mobile row behavior without changing import or parser semantics.
- Use `scripts/gmail-server-sync-readiness.ps1 -PrintSqlChecks` before the manual Gmail server-sync deployment; the local readiness check passes but does not replace external Supabase/Cloudflare/Gmail validation.
- Deployed Worker health flags now pass via `scripts/gmail-server-sync-readiness.ps1 -ApiBaseUrl https://hearth-api.meiraybooks.workers.dev`; this still does not prove OAuth refresh-token capture or real Gmail bill ingestion.
- Gmail server-sync Supabase migration is now live-verified: after user-applied SQL Editor migration, caller-run `scripts/gmail-server-sync-supabase-readiness.ps1` returned PASS for `gmail_refresh_token`, `gmail_sync_queue`, RLS, owner policy, and unique constraint.
- Post-migration public deployment smoke passes for `https://hearth-api.meiraybooks.workers.dev` and `https://hearth-web.pages.dev`; Cloudflare secret listing is blocked in this non-interactive Codex environment because `CLOUDFLARE_API_TOKEN` is not set.
- Gmail login auto-detect is implemented locally: authenticated `/api/import-jobs/sync-now` scans only the current user, `App` triggers it once per loaded/sign-in session, and `GmailSyncPanel` reloads pending queues for browser-side parse/import.
- Gmail background auto-parse is implemented locally: when the user is logged in outside Settings, `App` mounts `GmailSyncPanel` in background mode so pending Gmail PDFs are downloaded and parsed/imported without requiring navigation to Settings.
- `stash@{0}` (`codex-pre-pull-tracked-20260611`) remains as a backup of pre-pull tracked dirty changes and can be dropped after explicit review.

## Next

- Keep product work focused on: Gmail server-sync manual deployment validation and Security Phase F-1 verification.
- Deploy and live-test the login auto-detect path before claiming the production app now performs Gmail detection on every login.
