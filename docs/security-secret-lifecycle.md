# Security: Secret Lifecycle Policy

> **Last updated**: 2026-05-23
> **Related**: [security-boundary.md](security-boundary.md), [security-route-auth-matrix.md](security-route-auth-matrix.md)

## Secrets in Scope

| Secret | Storage Location | Used For | Encryption |
|--------|-----------------|----------|------------|
| PDF bank passwords (per bank) | `user_settings.pdf_passwords` (DB column) | Decrypt password-protected bank PDF statements | AES-256 via `USER_SETTINGS_SECRET_KEY` |
| `USER_SETTINGS_SECRET_KEY` | Cloudflare Worker environment variable | Encrypts/decrypts PDF passwords at rest | N/A (key itself) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Cloudflare Worker environment variable | Gmail OAuth flow | N/A |
| Supabase service-role key | Cloudflare Worker environment variable | DB admin operations from API | N/A |
| Supabase anon key | Cloudflare Worker environment variable + web bundle | Client-side auth | N/A (public by design) |

---

## PDF Password Lifecycle

### Storage

- PDF passwords are stored encrypted in `user_settings.pdf_passwords` (JSONB column).
- Encryption key: `USER_SETTINGS_SECRET_KEY` (Cloudflare Worker env var, never logged, never returned to client).
- Algorithm: AES-256-GCM (via Web Crypto API in the Worker runtime).

### Read Path

```
GET /api/user-settings              → returns boolean flags only; never returns raw secrets
GET /api/user-settings/pdf-passwords → decrypts and returns actual values (for use in PDF parsing)
```

The password-bearing endpoint is only called server-side during Gmail sync / manual PDF import. The client never receives plaintext passwords through the general settings endpoint.

### Write Path

```
PUT /api/user-settings (with pdf_passwords field)
  → assert USER_SETTINGS_SECRET_KEY present (500 if missing)
  → encrypt each password value
  → upsert encrypted blob to user_settings
```

### Legacy Plaintext Upgrade

Any row read that contains a plaintext password (pre-encryption migration) is automatically re-encrypted and written back on first read. This backfill is idempotent.

### Rotation Cadence

| Secret | Rotation Trigger | Rotation Action |
|--------|-----------------|-----------------|
| PDF passwords (user data) | User request only | User updates via settings UI; old value overwritten |
| `USER_SETTINGS_SECRET_KEY` | Suspected compromise | Re-encrypt all rows: fetch all user_settings, decrypt with old key, encrypt with new key, write back. Update Cloudflare env var. |
| `GOOGLE_CLIENT_ID/SECRET` | Suspected compromise or Google revocation | Revoke in Google Cloud Console, provision new credentials, update Cloudflare env var, re-run Gmail OAuth flow for all users |
| Supabase service-role key | Suspected compromise | Rotate in Supabase dashboard, update Cloudflare env var |

---

## Plaintext Elimination Targets

| Item | Current State | Target State | Blocking Work |
|------|--------------|--------------|---------------|
| PDF passwords in DB | Encrypted at rest (post-migration); legacy rows auto-upgraded on read | 100% encrypted | Auto-upgrade in place; no further code needed |
| PDF passwords in transit | Only returned via `/api/user-settings/pdf-passwords`, HTTPS only | Maintain | — |
| PDF passwords in logs | Not logged (key assertion, encrypt/decrypt only, no `console.log` of values) | Maintain | Audit log callsites if route is modified |
| Supabase service-role key | Cloudflare Worker env var only; never in code | Maintain | — |
| `USER_SETTINGS_SECRET_KEY` | Cloudflare Worker env var only; never in code or logs | Maintain | Add assertion test to readiness gate |

---

## Readiness Gate Integration

`npm run readiness:first:strict` currently verifies:
- `USER_SETTINGS_SECRET_KEY` is defined in the Worker environment (via health endpoint exposure)

**Backlog**: Add a test that calls `GET /api/user-settings` and confirms the response does **not** contain any raw secret fields (negative assertion).

---

## Non-Negotiable Rules

1. Never log, return, or cache a plaintext PDF password outside of the active parse operation.
2. Never return raw secrets from `GET /api/user-settings` — boolean flags only.
3. `USER_SETTINGS_SECRET_KEY` must never appear in source code, commit history, or logs.
4. Any route that reads secrets must assert the encryption key is present and return 500 (not 200 with empty data) if missing.
5. PDF password rotation does not require a code deploy — only a Cloudflare env var update and re-encrypt script run.
