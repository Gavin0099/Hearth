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
- Gmail fetched-status visibility is implemented locally: `GmailSyncPanel` now reads all current-user `import_jobs` on load and shows a detected/processed list plus status badges for matched Gmail search results.
- Gmail search auto-import jobs are implemented locally: manual Gmail search results are persisted as current-user `import_jobs`; existing imported jobs stay `已匯入`, new mapped jobs enter `待匯入`, and the existing queue processor can auto-download/parse/import them.
- Gmail auto account resolution is implemented locally: explicit `bank_account_mapping` remains supported, but Gmail auto-import now falls back to a unique existing account with matching bank keyword and account type before asking the user to configure mapping.
- Gmail manual account mapping UI is removed locally: Gmail auto-import now creates missing bank-labeled cash/credit accounts automatically, so users do not need to configure per-bank account mappings in Settings.
- Gmail search enqueue subrequest fix is implemented locally: manual Gmail search now batches existing-job lookup and insert, and re-running search promotes existing `needs_review` + `missing_mapping` jobs to `pending_parse` after auto account provisioning instead of leaving them in manual-confirmation state.
- Gmail queue item timeout fix is implemented locally: browser-side background Gmail import now shows per-item progress and times out slow PDF parsing/import work so one stuck statement is marked failed instead of blocking the whole pending queue.
- Gmail Mega parser bypass is implemented locally: Mega pending Gmail jobs are marked failed with `auto_parser_blocked` before PDF extraction because the current Mega PDF parser can block the browser event loop; this keeps other banks moving while Mega parser support remains separate work.
- Gmail API timeout / safe update fix is implemented locally: `apiFetch` now aborts after 15 seconds, `updateImportJob` throws on non-2xx, and queue status updates are wrapped in `safeUpdateImportJob` so a stuck or failed PATCH cannot stop the queue.
- Gmail queue optimistic refresh fix is implemented locally: browser-side queue processing keeps per-session `import_jobs` status overrides, applies them immediately after each job reaches imported/failed/needs_review, and merges them into later `loadQueues()` results so stale backend `pending_parse` rows do not keep the Settings panel showing `待匯入`.
- Gmail re-import dedupe fix is implemented locally: transaction `source_hash` no longer includes `category`, and Gmail transaction imports check existing rows by category-independent natural key so previously categorized Cathay rows are skipped instead of duplicated as uncategorized rows.
- Gmail duplicate cleanup support is implemented locally: `scripts/gmail-transactions-dedupe-cleanup.ps1` previews and optionally deletes existing duplicate `gmail_%` transaction rows by category-independent natural key, keeping categorized rows first and requiring an explicit user scope for `-Apply`.
- Gmail duplicate cleanup script uuid hotfix is implemented locally: user-scoped SQL now compares `accounts.user_id` to `auth.users.id` as uuid and casts transaction ids to text only for preview display aggregation.
- Gmail invalid mapping guard is implemented locally: stale `bank_account_mapping` rows whose `source_type` does not match the mapped account's `type` are ignored in both API job creation and browser-side queue processing.
- Gmail manual credit-card import fix is implemented locally: `GmailSyncPanel.handleSync()` now resolves single-item credit-card imports through `resolveAutoMappedAccountId(email.bank, "credit_card", freshAccounts)` instead of the generic bank matcher, so manual Gmail import cannot pick a same-bank `cash_bank` account.
- Gmail cross-account cleanup support is implemented locally: `scripts/gmail-cross-account-dedupe-cleanup.ps1` previews and optionally deletes historical `gmail_%` rows duplicated across wrong/correct account types, but only when the same natural key has exactly one preferred account and at least one non-preferred account.
- Governance protected-file CI fix is implemented locally: `AGENTS.base.md` and `.governance/baseline.yaml` are pinned to LF via `.gitattributes`, and the protected baseline hash now matches the LF checkout hash reported by GitHub CI (`c16617acca72...`).
- Security review hardening is in progress locally: `supabase/schema.sql` is rebuilt from ordered migrations, schema drift check script is added, `/api/ops/*` requires an admin allowlist, and ops DB/internal errors are sanitized.
- `stash@{0}` (`codex-pre-pull-tracked-20260611`) remains as a backup of pre-pull tracked dirty changes and can be dropped after explicit review.

## Next

- Keep product work focused on: Gmail server-sync manual deployment validation and Security Phase F-1 verification.
- Deploy and live-test `0.3.16`, then run `scripts/gmail-transactions-dedupe-cleanup.ps1 -UserEmail reiko0099@gmail.com` to preview existing duplicate Gmail rows before deciding whether to run the same command with `-Apply`.
- Pull the cleanup-script uuid hotfix before rerunning the Supabase preview command; the previous script failed with `operator does not exist: uuid = text`.
- After deploying the invalid-mapping guard, inspect existing `bank_account_mapping` rows and existing wrong-account Gmail imports before any one-time cleanup.
- After deploying the manual import fix, verify a single-row Gmail credit-card import lands only in the credit-card account and does not recreate cross-account duplicates.
- Run `scripts/gmail-cross-account-dedupe-cleanup.ps1 -UserEmail reiko0099@gmail.com` in preview mode against Supabase, review keep/delete rows, then rerun with `-Apply` if the preview matches the historical wrong-account duplicates.
- After the governance protected-file fix is pushed, confirm the GitHub drift check no longer fails on `protected_files_unmodified`.
