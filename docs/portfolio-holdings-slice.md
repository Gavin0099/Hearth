# Portfolio Holdings Slice

This slice upgrades portfolio holdings from stub to a real Supabase-backed read path.

## Scope

- API: `GET /api/portfolio/holdings`
- Frontend: `PortfolioPanel` in dashboard

## Current behavior

- requires Supabase bearer token
- resolves owned account IDs by current user
- reads `holdings` rows scoped to owned accounts
- returns `provider: "supabase"` and `status: "ok"` on success
- returns `401` for missing/invalid token

## Why this slice

It starts Phase D with the smallest safe step:

- ownership-safe holdings read path
- real portfolio data visibility in UI
- test coverage for auth + owner-scope behavior
