# Accounts API

This is the first real Supabase-backed API slice in Hearth.

## Purpose

Accounts are the shared foundation for:

- cashflow transactions
- investment trades
- holdings snapshots
- future import ownership and filtering

## Endpoints

### `GET /api/accounts`

Returns the account list for the requested user.

Required header:

- `Authorization: Bearer <supabase-access-token>`

### `POST /api/accounts`

Creates a new account for the requested user.

Required header:

- `Authorization: Bearer <supabase-access-token>`

Request body:

```json
{
  "name": "永豐台股",
  "type": "investment_tw",
  "currency": "TWD",
  "broker": "Sinopac"
}
```

## Current auth boundary

The Worker now resolves the current user by validating the incoming Supabase bearer token with `supabase.auth.getUser(...)`.

Data access still uses the Worker service role for the database call, so the user identity is verified but database enforcement is not yet fully delegated to RLS. The next upgrade should move the route to a stricter session-aware and RLS-first pattern.
