---
name: Hearth Project Facts
description: Framework-compatible factual baseline for Hearth
type: project
---

# Project Facts

## Product

- Name: `Hearth`
- Domain: household finance / personal asset management
- Delivery model: monorepo web + API product for real user financial workflows

## Runtime Stack

- Frontend: React 19 + TypeScript + Vite
- Backend: Hono on Cloudflare Workers
- Database/Auth: Supabase Postgres + Auth + Storage
- Hosting: Cloudflare Pages + Cloudflare Workers
- Workspace model: npm workspaces with `@hearth/web`, `@hearth/api`, `@hearth/shared`

## Repo Boundaries

- `apps/web/`: presentation and client workflow
- `apps/api/`: auth resolution, ownership enforcement, domain orchestration
- `packages/shared/`: shared types, parsers, normalization rules
- `supabase/`: schema snapshot plus migration history
- `governance/`: repo-local governance authority for Hearth

## Data Facts

- Cashflow reporting is based on persisted `transactions`
- Financial rows are scoped to owned accounts
- Import flows rely on deterministic source-hash dedupe
- Portfolio state uses `investment_trades`, `holdings`, `price_snapshots`, `fx_rates`, and `dividends`

## Verification Baseline

- API build: `npm --workspace @hearth/api run build`
- API tests: `npm --workspace @hearth/api run test`
- Web check: `npm --workspace @hearth/web run check`
- Release/readiness: `npm run readiness:first:codeonly`, `npm run readiness:first`, `npm run readiness:first:strict`
