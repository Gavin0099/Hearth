# Supabase Auth Setup

This milestone wires the Hearth frontend to Supabase Auth and verifies the current session against the Worker.

## Current flow

1. the web app starts a Google OAuth sign-in through Supabase
2. Supabase returns a browser session
3. frontend API requests attach the bearer token automatically
4. the Worker resolves the current user via `/api/auth/me`
5. user-scoped routes such as `/api/accounts` use that identity

## Required Supabase configuration

- enable Google provider in Supabase Auth
- add local redirect URL:
  - `http://localhost:5173`
- add local Worker/API origin if needed for CORS policy
- add production redirect URLs for the final Cloudflare Pages domain

## Current limitations

- the app shows auth and worker verification status, but does not yet provide account creation UI
- database access still uses service-role-backed Worker queries after user verification
- RLS-first enforcement should be a later hardening step
