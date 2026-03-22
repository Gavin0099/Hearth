# Cloudflare First Deploy

This runbook is for the first real deploy of Hearth API + web.

## Commands

- Dry-run (print all deploy steps without changing anything):
  - `npm run deploy:first:dry`
- Real deploy:
  - `npm run deploy:first`

## What the script does

`scripts/cloudflare-first-deploy.ps1` runs:

1. strict readiness (`npm run readiness:first:strict`, includes governance gate)
2. `wrangler --version`
3. `wrangler whoami`
4. auto-create Pages project when missing (default project: `hearth-web`)
5. deploy Worker API with `apps/api/wrangler.jsonc`
6. build web app
7. deploy `apps/web/dist` to Cloudflare Pages

## Prerequisites

- Cloudflare auth already configured for `wrangler` (`wrangler login` or API token)
- Cloudflare Pages project already exists (default name: `hearth-web`)
- `apps/api/.dev.vars` configured for local dev
- production Worker secrets configured in Cloudflare Dashboard or via `wrangler secret put`

## Notes from first real deploy

- `apps/api/wrangler.jsonc` uses `nodejs_compat` because transaction hash logic imports `node:crypto`.
- On Wrangler `4.76.0`, `--commit-dirty` is not supported for `wrangler deploy` / `wrangler pages deploy`.
- The deploy script auto-creates the Pages project when missing and treats "already exists" as non-fatal.

## Optional parameters

```powershell
powershell -ExecutionPolicy Bypass -File scripts/cloudflare-first-deploy.ps1 -PagesProjectName "<your-pages-project>" -AutoCreatePagesProject
```
