# Post-Deploy Smoke Test

Run this right after `npm run deploy:first` to verify the first-release surface is reachable.

## Command

- Default (current Hearth production endpoints):
  - `npm run smoke:postdeploy`

## Optional parameters

Use custom URLs when needed:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/post-deploy-smoke.ps1 -ApiBaseUrl "https://<your-worker>.workers.dev" -WebUrl "https://<your-pages>.pages.dev"
```

Enable authenticated checks (recommended when you have a valid Supabase access token):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/post-deploy-smoke.ps1 -BearerToken "<supabase-access-token>"
```

Exercise real transaction CRUD (create/query/delete cleanup):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/post-deploy-smoke.ps1 -BearerToken "<supabase-access-token>" -AccountId "<owned-account-id>" -ExerciseTransactions
```

You can omit `-AccountId`; the script will use the first owned account automatically.

Also verify monthly report API in the same run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/post-deploy-smoke.ps1 -BearerToken "<supabase-access-token>" -ExerciseTransactions -ExerciseReport
```

Verify import and recurring routes (safe validation path, no data writes):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/post-deploy-smoke.ps1 -BearerToken "<supabase-access-token>" -ExerciseImports -ExerciseRecurring
```

Verify the persisted cron run history surface:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/post-deploy-smoke.ps1 -BearerToken "<supabase-access-token>" -ExerciseOps
```

## What it verifies

1. `GET <api>/health` responds `2xx` and payload has `status: "ok"`
2. `GET <web>/` responds `2xx` and HTML contains `<title>Hearth</title>`
3. When `-BearerToken` is provided:
   - `GET <api>/api/auth/me` returns `status: "ok"`
   - `GET <api>/api/accounts` returns `status: "ok"`
4. When `-ExerciseTransactions` is also provided:
   - `POST /api/transactions` can create a probe transaction
   - `GET /api/transactions` can find the probe by account + keyword query
   - `DELETE /api/transactions/:id` removes the probe transaction
5. When `-ExerciseReport` is also provided:
   - `GET /api/report/monthly` returns `status: "ok"` and includes `summary`
6. When `-ExerciseImports` is provided:
   - import endpoints respond with expected validation errors on missing file payload
   - this confirms auth + route wiring without writing data
7. When `-ExerciseRecurring` is provided:
   - `GET /api/recurring-templates` returns `status: "ok"`
   - `POST /api/recurring-templates/apply` invalid payload returns expected validation error
8. When `-ExerciseOps` is provided:
   - `GET /api/ops/job-runs/latest?job_name=daily-update` returns `status: "ok"`
   - the response includes an `item` field, which may be `null` if no cron run has been persisted yet

## Scope note

This smoke check validates availability and basic wiring.
Without `-BearerToken`, authenticated API checks are skipped.
Without `-ExerciseTransactions`, transaction CRUD checks are skipped.
Without `-ExerciseReport`, monthly report API check is skipped.
Without `-ExerciseImports`, import-route validation checks are skipped.
Without `-ExerciseRecurring`, recurring-route validation checks are skipped.
Imports/report still need checklist-driven functional validation.
