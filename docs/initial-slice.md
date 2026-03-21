# Initial implementation slice

This repository started from `Hearth-plan.md`, which defines the product scope and the phased rollout.

The first code slice focuses on local project foundations instead of external provisioning:

1. establish a workspace layout for frontend, backend, and shared domain code
2. encode the initial API surface as Cloudflare Worker-compatible Hono route stubs
3. encode the database baseline as a Supabase SQL schema
4. define the first transaction category rule set for later parser enrichment
5. add the first Supabase and Cloudflare environment/configuration templates

## Deferred on purpose

- real Supabase project provisioning
- OAuth configuration
- CSV / Excel parser implementation
- market price scheduling
- persistent auth/session wiring
