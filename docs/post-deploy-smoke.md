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

## Scope note

This smoke check validates availability and basic wiring.
Without `-BearerToken`, authenticated API checks are skipped.
Without `-ExerciseTransactions`, transaction CRUD checks are skipped.
Imports/report still need checklist-driven functional validation.
