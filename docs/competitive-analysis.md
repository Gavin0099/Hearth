# Competitive Analysis Notes

Last updated: 2026-03-21

This note captures external reference products and repositories that are useful for shaping `Hearth`.

## Why this exists

`Hearth` is not being designed in a vacuum. These references help separate:

- product-model inspiration
- domain-model inspiration
- deployment and implementation inspiration

## Highest-value references

### Actual Budget

Best reference for:

- privacy-first positioning
- multi-device sync thinking
- user trust and data ownership narrative

What to borrow for `Hearth`:

- sync and recovery mindset
- user-facing confidence around where data lives
- careful treatment of finance data as something users must trust

What not to copy blindly:

- local-first architecture, because `Hearth` is currently designed as Supabase + Cloudflare

### Firefly III

Best reference for:

- complete personal-finance domain modeling
- recurring transactions
- categories, tags, budgets, reports
- import and rule-processing philosophy

What to borrow for `Hearth`:

- long-term evolution of categories / budgets / recurring items
- richer report surfaces after the basic dashboard exists
- the idea that imports should feed a governed finance model, not only raw tables

What not to copy blindly:

- heavyweight traditional finance scope before `Hearth` finishes core household flows

### rotki

Best reference for:

- portfolio tracking depth
- net-worth and analytics thinking
- accounting-aware investment views

What to borrow for `Hearth`:

- treating portfolio tracking as a serious capability
- time-series net worth and PnL thinking
- investment-focused UX and reporting depth

What not to copy blindly:

- crypto-heavy or investment-only product focus that would distort `Hearth` away from household finance

### thounny/finance-tracker

Best reference for:

- practical API surface decomposition in a finance app
- accounts / categories / transactions / CSV import sequencing
- implementation feel closer to `Hearth`'s current build stage

What to borrow for `Hearth`:

- implementation ordering
- clean API boundaries around finance entities
- how Hono-style routes can map to finance product capabilities

## Repositories that still need exact-link verification

These were identified as promising but should be re-checked with exact repository URLs before using them as stronger references:

- `apptrackit/finance`
- `Wealth Compass`
- `Tracklet`
- `Paysa` / `expense-tracker-rn-hono`

## Product takeaway for Hearth

Short-term:

- follow implementation sequencing closer to `thounny/finance-tracker`
- keep `accounts`, auth, and import flows as the immediate product base

Mid-term:

- use `Firefly III` as the domain-completeness benchmark

Portfolio module:

- use `rotki` as the benchmark for investment depth, not just dashboard cosmetics

Trust / multi-device story:

- use `Actual Budget` as the benchmark for user confidence, sync clarity, and privacy framing
