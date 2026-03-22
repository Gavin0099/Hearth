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

## What it verifies

1. `GET <api>/health` responds `2xx` and payload has `status: "ok"`
2. `GET <web>/` responds `2xx` and HTML contains `<title>Hearth</title>`

## Scope note

This smoke check validates availability and basic wiring only.
Functional paths (auth/accounts/transactions/import/report) should still be validated with the first-release checklist and manual acceptance flow.
