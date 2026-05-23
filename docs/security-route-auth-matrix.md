# Security: Route-by-Route Auth Matrix

> **Last updated**: 2026-05-23
> **Related**: [security-boundary.md](security-boundary.md), [security-rls-map.md](security-rls-map.md)

## Legend

| Column | Meaning |
|--------|---------|
| Auth | Bearer token required (resolves `user_id` via Supabase JWT) |
| Ownership | Verifies the resource belongs to the authenticated user |
| Key steps | Ordered enforcement chain |
| Failure codes | HTTP codes the route must return on each violation |

---

## `/api/accounts`

| Method | Path | Auth | Ownership | Key Steps | Failures |
|--------|------|------|-----------|-----------|----------|
| GET | `/api/accounts` | ✅ | ✅ filters by `user_id` | 1. Resolve user 2. Query `WHERE user_id = uid` | 401, 500 |
| POST | `/api/accounts` | ✅ | N/A (creation) | 1. Resolve user 2. Validate name/type 3. Insert with `user_id = uid` | 401, 400, 500 |
| PUT | `/api/accounts/:id` | ✅ | ✅ `id + user_id` filter | 1. Resolve user 2. Validate fields 3. UPDATE `WHERE id AND user_id = uid` | 401, 400, 500 |
| DELETE | `/api/accounts/:id` | ✅ | ✅ `id + user_id` filter | 1. Resolve user 2. DELETE `WHERE id AND user_id = uid` | 401, 500 |

---

## `/api/transactions`

| Method | Path | Auth | Ownership | Key Steps | Failures |
|--------|------|------|-----------|-----------|----------|
| GET | `/api/transactions` | ✅ | ✅ account set filter | 1. Resolve user 2. Fetch `account_ids` for user 3. Validate `account_id` param in set 4. Query transactions | 401, 400 (bad dates / unowned account), 500 |
| POST | `/api/transactions` | ✅ | ✅ account ownership | 1. Resolve user 2. Validate `account_id` 3. Fetch user account set 4. Verify `account_id` in set | 401, 400, 500 |
| PUT | `/api/transactions/:id` | ✅ | ✅ `.in(account_ids)` | 1. Resolve user 2. Validate editable fields 3. Fetch account set 4. UPDATE `WHERE id IN user accounts` | 401, 400, 500 |
| DELETE | `/api/transactions` (by account) | ✅ | ✅ account ownership | 1. Resolve user 2. Validate `account_id` param 3. Verify in set 4. Delete all for that account | 401, 400 (missing/unowned), 500 |
| DELETE | `/api/transactions/:id` | ✅ | ✅ `.in(account_ids)` | 1. Resolve user 2. Fetch account set 3. DELETE `WHERE id AND account_id IN set` | 401, 400, 500 |

---

## `/api/import/*`

All import routes share the same preflight via `readOwnedImportFile()` + `resolveOwnedImportContext()`.

**Shared preflight** (`apps/api/src/lib/import-workflows.ts`):
1. Resolve user (bearer)
2. Parse `account_id` from multipart form
3. `readOwnedImportFile()` — validates file presence
4. `resolveOwnedImportContext()` — fetches user's account set, returns 400 if `account_id` not in set

| Method | Path | Auth | Ownership | Additional Steps | Failures |
|--------|------|------|-----------|-----------------|----------|
| POST | `/api/import/preview` | ✅ | ✅ shared preflight | 5. Parse file for preview rows | 401, 400 (no file / missing mode / unowned account), 500 |
| POST | `/api/import/transactions-csv` | ✅ | ✅ shared preflight | 5. `importTransactionsCsvRows()` | 401, 400, 500 |
| POST | `/api/import/sinopac-tw` | ✅ | ✅ shared preflight | 5. Sinopac CSV parse + import | 401, 400, 500 |
| POST | `/api/import/credit-card-tw` | ✅ | ✅ shared preflight | 5. Credit card CSV/PDF parse + import | 401, 400, 500 |
| POST | `/api/import/excel-monthly` | ✅ | ✅ shared preflight | 5. Excel workbook parse + import | 401, 400, 500 |
| POST | `/api/import/sinopac-stock` | ✅ | ✅ shared preflight | 5. Stock trades parse + import | 401, 400, 500 |
| POST | `/api/import/foreign-stock-csv` | ✅ | ✅ shared preflight | 5. Foreign stock CSV parse + import | 401, 400, 500 |
| POST | `/api/import/dividends-csv` | ✅ | ✅ shared preflight | 5. Dividend CSV parse + import | 401, 400, 500 |

---

## `/api/portfolio/*`

| Method | Path | Auth | Ownership | Key Steps | Failures |
|--------|------|------|-----------|-----------|----------|
| GET | `/api/portfolio/net-worth` | ✅ | ✅ account set | 1. Resolve user 2. Fetch account set 3. Aggregate holdings/transactions/dividends 4. Upsert snapshot | 401, 500 |
| GET | `/api/portfolio/net-worth-history` | ✅ | ✅ `user_id` filter | 1. Resolve user 2. Query `net_worth_snapshots WHERE user_id = uid` | 401, 500 |
| GET | `/api/portfolio/holdings` | ✅ | ✅ account set | 1. Resolve user 2. Fetch account set 3. Query holdings in set | 401, 500 |
| GET | `/api/portfolio/dividends` | ✅ | ✅ account set | 1. Resolve user 2. Fetch account set 3. Query dividends in set | 401, 500 |
| GET | `/api/portfolio/fx-rates` | ✅ | ✅ account/holdings set | 1. Resolve user 2. Derive currencies from user's holdings 3. Query fx_rates | 401, 500 |
| GET | `/api/portfolio/trade-costs` | ✅ | ✅ account set | 1. Resolve user 2. Fetch account set 3. Aggregate `investment_trades` | 401, 500 |
| POST | `/api/portfolio/price-snapshots` | ✅ | ⚠️ global write | 1. Resolve user 2. Validate entries 3. Upsert `price_snapshots` (no user scope) | 401, 400, 500 |
| POST | `/api/portfolio/fx-rates` | ✅ | ⚠️ global write | 1. Resolve user 2. Validate entries 3. Upsert `fx_rates` (no user scope) | 401, 400, 500 |
| DELETE | `/api/portfolio/price-snapshots` | ✅ | ⚠️ global delete | 1. Resolve user 2. Validate params 3. Delete from `price_snapshots` (no user scope) | 401, 400, 500 |
| DELETE | `/api/portfolio/fx-rates` | ✅ | ⚠️ global delete | 1. Resolve user 2. Validate params 3. Delete from `fx_rates` (no user scope) | 401, 400, 500 |

⚠️ = authenticated but not user-scoped (intentional for global reference data)

---

## `/api/report/*`

| Method | Path | Auth | Ownership | Key Steps | Failures |
|--------|------|------|-----------|-----------|----------|
| GET | `/api/report/monthly` | ✅ | ✅ account set | 1. Resolve user 2. Validate year/month 3. Fetch account set 4. Query transactions in date range | 401, 400 (invalid month), 500 |

---

## `/api/recurring/*`

| Method | Path | Auth | Ownership | Key Steps | Failures |
|--------|------|------|-----------|-----------|----------|
| GET | `/api/recurring` | ✅ | ✅ `user_id` filter | 1. Resolve user 2. Query `WHERE user_id = uid` | 401, 500 |
| POST | `/api/recurring` | ✅ | ✅ account + `user_id` | 1. Resolve user 2. Validate fields 3. Verify `account_id` in set 4. Insert with `user_id = uid` | 401, 400, 500 |
| POST | `/api/recurring/from-import-candidates` | ✅ | ✅ account ownership | 1. Resolve user 2. Verify `account_id` 3. Dedupe against existing user templates 4. Batch insert | 401, 400, 500 |
| POST | `/api/recurring/apply` | ✅ | ✅ user templates | 1. Resolve user 2. Validate year/month 3. Fetch user templates 4. Dedupe by `source_hash` 5. Insert transactions | 401, 400, 500 |
| PUT | `/api/recurring/:id` | ✅ | ✅ `id + user_id` | 1. Resolve user 2. Validate fields 3. UPDATE `WHERE id AND user_id = uid` | 401, 400, 500 |
| DELETE | `/api/recurring/:id` | ✅ | ✅ `id + user_id` | 1. Resolve user 2. DELETE `WHERE id AND user_id = uid` | 401, 500 |

---

## `/api/user-settings/*`

| Method | Path | Auth | Ownership | Key Steps | Failures |
|--------|------|------|-----------|-----------|----------|
| GET | `/api/user-settings` | ✅ | ✅ `user_id` | 1. Resolve user 2. Query settings for uid 3. Return boolean flags only (no secret values) | 401, 500 |
| GET | `/api/user-settings/pdf-passwords` | ✅ | ✅ `user_id` + secret guard | 1. Resolve user 2. Assert `USER_SETTINGS_SECRET_KEY` present 3. Fetch + decrypt secrets 4. Auto-upgrade any plaintext to encrypted | 401, 500 (missing key) |
| PUT | `/api/user-settings` | ✅ | ✅ `user_id` + encrypt | 1. Resolve user 2. If writing secrets: assert key present 3. Encrypt values 4. Upsert `WHERE user_id = uid` | 401, 500 (missing key), 500 |

---

## `/api/bank-snapshots/*`

| Method | Path | Auth | Ownership | Key Steps | Failures |
|--------|------|------|-----------|-----------|----------|
| GET | `/api/bank-snapshots` | ✅ | ✅ `user_id` filter | 1. Resolve user 2. Query `WHERE user_id = uid` | 401, 500 |
| PUT | `/api/bank-snapshots` | ✅ | ✅ `user_id` forced | 1. Resolve user 2. Validate body 3. Upsert with `user_id = uid` | 401, 500 |
| DELETE | `/api/bank-snapshots/:id` | ✅ | ✅ `id + user_id` | 1. Resolve user 2. DELETE `WHERE id AND user_id = uid` | 401, 500 |

---

## `/api/categorization-rules/*`

| Method | Path | Auth | Ownership | Key Steps | Failures |
|--------|------|------|-----------|-----------|----------|
| GET | `/api/categorization-rules` | ✅ | ✅ `user_id` filter | 1. Resolve user 2. Query `WHERE user_id = uid` | 401, 500 |
| POST | `/api/categorization-rules` | ✅ | ✅ `user_id` forced | 1. Resolve user 2. Validate required fields 3. Upsert with `user_id = uid` | 401, 400, 500 |
| DELETE | `/api/categorization-rules/:id` | ✅ | ✅ `id + user_id` | 1. Resolve user 2. DELETE `WHERE id AND user_id = uid` | 401, 500 |

---

## `/api/ops/*`

| Method | Path | Auth | Ownership | Key Steps | Failures |
|--------|------|------|-----------|-----------|----------|
| GET | `/api/ops/job-runs/latest` | ✅ | ⚠️ system-wide | 1. Resolve user (auth only) 2. Query `job_runs` (no user filter) | 401, 500 |
| GET | `/api/ops/job-runs/summary` | ✅ | ⚠️ system-wide | 1. Resolve user (auth only) 2. Aggregate recent job runs | 401, 500 |
| POST | `/api/ops/trigger-daily-update` | ✅ | ⚠️ system-wide | 1. Resolve user (auth only) 2. Execute `runDailyUpdate()` | 401, 500 |

⚠️ = auth required but not user-scoped; any authenticated user can read all ops data and trigger updates.

---

## Summary: Known Intentional Gaps

| Gap | Affected Routes | Risk | Mitigation |
|-----|----------------|------|------------|
| Global reference data writable by any authed user | `POST/DELETE /api/portfolio/price-snapshots`, `POST/DELETE /api/portfolio/fx-rates` | Low (single-tenant) | Add user_id scoping if multi-tenant |
| Ops routes return system-wide data | `GET /api/ops/*`, `POST /api/ops/trigger-daily-update` | Low (household use) | Consider admin flag on `user_settings` if user roles introduced |
| `job_runs` unscoped | See ops routes above | Low | Same as above |
