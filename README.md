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

## External setup still required

- create the Supabase project
- configure Google OAuth in Supabase Auth
- bind Worker secrets in Cloudflare
- connect the route stubs to real queries, imports, and scheduled jobs
