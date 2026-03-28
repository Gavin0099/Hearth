---
name: Hearth Tech Stack
description: Core technical stack and architecture overview for Hearth household finance system
type: project
---

# Tech Stack — Hearth

## Runtime

- **Frontend**: React 19 + TypeScript, Vite, Tailwind CSS
- **Backend**: Hono (Cloudflare Workers)
- **Database**: Supabase (Postgres + Auth + Storage)
- **Hosting**: Cloudflare Workers (API) + Cloudflare Pages (Web)
- **Monorepo**: npm workspaces — `@hearth/web`, `@hearth/api`, `@hearth/shared`

## Key Domains

- `apps/web/` — React SPA (dashboard, transactions, net worth, import)
- `apps/api/` — Hono API server on Cloudflare Workers
- `packages/shared/` — shared types, parsers, utils

## Data Flow

- Users authenticate via Supabase Auth
- All financial data scoped to `user_id`-owned accounts
- Import: PDF bank statements → parsed transactions → deduped → inserted
- OCR fallback for image-only PDFs (Tesseract via PDF.js)

## Parser Coverage

- 永豐銀行 (Yuanta/SinoPac) statement format
- CTBC statement format (text-layer + OCR fallback)
- Monthly ledger CSV

## Build & Test

- `npm --workspace @hearth/api run build`
- `npm --workspace @hearth/web run check`
- `npm --workspace @hearth/web run build`
