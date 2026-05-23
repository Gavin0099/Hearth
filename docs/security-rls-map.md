# Security: RLS Hardening Map

> **Last updated**: 2026-05-23
> **Related**: [security-boundary.md](security-boundary.md), [security-route-auth-matrix.md](security-route-auth-matrix.md)

## Overview

Hearth uses Supabase with the **service-role admin client** for all API operations, which means RLS is bypassed at the database layer. The API is the primary enforcement layer. RLS policies exist as a defence-in-depth backstop and are kept in sync with API-level checks.

---

## Table Inventory

### User-Scoped Tables (RLS Enabled)

| Table | RLS | Policy Name | Policy Condition | Ownership Model |
|-------|-----|-------------|------------------|-----------------|
| `accounts` | ✅ | `accounts_owner` | `user_id = auth.uid()` | Direct (`user_id` column) |
| `recurring_templates` | ✅ | `recurring_templates_owner` | `user_id = auth.uid()` | Direct (`user_id` column) |
| `user_settings` | ✅ | `user_settings_owner` | `user_id = auth.uid()` | Direct (`user_id` column) |
| `bank_snapshots` | ✅ | `bank_snapshots_owner` | `user_id = auth.uid()` | Direct (`user_id` column) |
| `categorization_rules` | ✅ | Users can manage their own rules | `user_id = auth.uid()` | Direct (`user_id` column) |
| `net_worth_snapshots` | ✅ | `net_worth_snapshots_owner` | `user_id = auth.uid()` | Direct (`user_id` column) |
| `gmail_sync_queue` | ✅ | `gmail_sync_queue_owner` | `user_id = auth.uid()` | Direct (`user_id` column) |
| `transactions` | ✅ | `transactions_owner` | `EXISTS (SELECT 1 FROM accounts WHERE id = account_id AND user_id = auth.uid())` | Transitive via `accounts` |
| `investment_trades` | ✅ | `investment_trades_owner` | `EXISTS (SELECT 1 FROM accounts WHERE id = account_id AND user_id = auth.uid())` | Transitive via `accounts` |
| `holdings` | ✅ | `holdings_owner` | `EXISTS (SELECT 1 FROM accounts WHERE id = account_id AND user_id = auth.uid())` | Transitive via `accounts` |
| `dividends` | ✅ | `dividends_owner` | `EXISTS (SELECT 1 FROM accounts WHERE id = account_id AND user_id = auth.uid())` | Transitive via `accounts` |

All policies cover SELECT / INSERT / UPDATE / DELETE unless noted otherwise.

### Global Reference Tables (RLS Disabled — Intentional)

| Table | RLS | Rationale | Write Risk |
|-------|-----|-----------|------------|
| `price_snapshots` | ❌ | Global market data; no user_id column | Any authenticated user can write/delete |
| `fx_rates` | ❌ | Global exchange rates; no user_id column | Any authenticated user can write/delete |
| `job_runs` | ❌ | System operational log; no user_id column | Written by cron only (service role) |

---

## Ownership Patterns

### Pattern 1 — Direct ownership
Tables with a `user_id` column. Policy checks `user_id = auth.uid()` directly.

Tables: `accounts`, `recurring_templates`, `user_settings`, `bank_snapshots`, `categorization_rules`, `net_worth_snapshots`, `gmail_sync_queue`

### Pattern 2 — Transitive ownership via `accounts`
Child tables without a `user_id` column. Ownership proven through a JOIN to `accounts`.

Tables: `transactions`, `investment_trades`, `holdings`, `dividends`

```sql
EXISTS (
  SELECT 1 FROM accounts
  WHERE id = <table>.account_id
    AND user_id = auth.uid()
)
```

API enforcement mirrors this: routes fetch all `account_id` values for the authenticated user, then filter/validate against that set.

---

## Gap Analysis

| Gap | Severity | Notes |
|-----|----------|-------|
| `price_snapshots` write/delete — any authenticated user | Medium | Acceptable for single-tenant household use; would need per-user scoping if multi-tenant |
| `fx_rates` write/delete — any authenticated user | Medium | Same as above |
| `job_runs` — no user ownership | Low | Written only by cron (service role), read by ops routes that require auth |
| API bypasses RLS (service-role client) | By design | API is primary enforcement; RLS is backstop only |

---

## Migration Reference

| Migration | Change |
|-----------|--------|
| `20260402000000_add_rls_user_tables.sql` | Initial RLS enablement across all user-scoped tables |

---

## Hardening Backlog

- [ ] Evaluate adding `user_id` to `price_snapshots` and `fx_rates` if Hearth moves multi-tenant
- [ ] Add integration tests that verify service-role bypass does not expose cross-user data at API level
- [ ] Confirm `job_runs` ops routes are scoped to authenticated admin users only (currently: any authenticated user)
