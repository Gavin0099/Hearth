# Local Verification

This document captures the first executable verification path for Hearth's current core slice: auth plus accounts.

## What is covered

- Worker auth resolution surface:
  - `GET /api/auth/me`
- accounts API behavior:
  - `GET /api/accounts`
  - `POST /api/accounts`
- validation behavior for unauthenticated and invalid-input paths

## Test strategy

The current verification is intentionally lightweight:

- API route tests run locally with Node's built-in test runner
- Supabase auth/database interactions are replaced with injected test doubles
- the goal is to lock down route behavior before adding heavier end-to-end setup

## Run locally

From repo root:

```bash
npm --workspace @hearth/api run test
```

## Why this level first

The app does not yet have full local provisioning for:

- installed dependencies in this environment
- Supabase project wiring
- browser-driven end-to-end auth automation

So this verification layer focuses on the most important repeatable contract first: route behavior for auth and accounts.
