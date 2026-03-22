# Hearth

Hearth is a household asset management system for monthly cashflow, portfolio tracking, and multi-device access.

The deployment architecture is:

- Supabase for PostgreSQL, Auth, Storage, and RLS
- Cloudflare Pages for the React frontend
- Cloudflare Workers for the Hono API and scheduled jobs

## Workspace layout

- `apps/web`: React + TypeScript frontend shell
- `apps/api`: Hono API shell for Cloudflare Workers
- `packages/shared`: shared domain types and category rules
- `supabase/schema.sql`: initial database schema from `Hearth-plan.md`
- `ai-governance-framework`: governance framework submodule
- `.env.example`: frontend environment template
- `apps/api/.dev.vars.example`: Worker secret template
- `apps/api/wrangler.jsonc`: Cloudflare Worker configuration

## First slice

This repo currently contains the initial implementation foundation:

- a monorepo workspace layout
- Cloudflare-compatible API route contracts for the first reporting and import surfaces
- a first real Supabase-backed `accounts` API slice
- Supabase bearer-token user resolution in the Worker
- a frontend dashboard shell aligned to the plan
- shared transaction category rules
- a Supabase schema baseline
- Supabase client helpers for browser and worker runtime boundaries

## Local development flow

1. Install dependencies with `npm install`
2. Copy `.env.example` to `.env` for the web app
3. Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` for Worker secrets
4. Create the Supabase project and apply `supabase/schema.sql`
5. Run `npm run dev:web` and `npm run dev:api`
6. Run `npm --workspace @hearth/api run test` for the current auth/accounts verification slice

## First release readiness

- Code-only readiness check:
  - `npm run readiness:first:codeonly`
- Fast readiness check:
  - `npm run readiness:first`
- Strict readiness check:
  - `npm run readiness:first:strict`

Read the full checklist in `docs/first-release-readiness.md`.

## Cloudflare first deploy

- Dry-run:
  - `npm run deploy:first:dry`
- Real deploy:
  - `npm run deploy:first`
- Post-deploy smoke:
  - `npm run smoke:postdeploy`
  - with auth checks: `powershell -ExecutionPolicy Bypass -File scripts/post-deploy-smoke.ps1 -BearerToken "<supabase-access-token>"`

Deployment runbook: `docs/cloudflare-first-deploy.md`.
Smoke runbook: `docs/post-deploy-smoke.md`.

## External setup still required

- create the Supabase project
- configure Google OAuth in Supabase Auth
- add the local and production redirect URLs for Google OAuth
- bind Worker secrets in Cloudflare
- connect the route stubs to real queries, imports, and scheduled jobs

## Current implemented slices

- auth and accounts flow
- local executable verification for auth/accounts/report routes
- first monthly report aggregation slice backed by `transactions`
- first manual transaction entry flow feeding the monthly report
- first normalized CSV transaction import flow
- first Sinopac-specific transaction CSV mapping layer
- first Excel monthly workbook import slice
- first recurring template data path
- first bulk adoption flow from Excel recurring candidates into recurring templates
- first recurring-template apply flow into monthly transactions
- first transaction delete flow for quick corrections
- first transaction filter flow for account/date/category/keyword lookup
- first transaction edit flow for quick corrections

## Current deployed endpoints

- API Worker: `https://hearth-api.reiko0099.workers.dev`
- Pages deployment URL (latest): `https://ad4d7cc8.hearth-web.pages.dev`
