# Manual Transaction Slice

This slice adds the first real transaction write path to `Hearth`.

## What exists now

- `GET /api/transactions`
- `POST /api/transactions`
- frontend manual transaction entry panel
- monthly report refresh after successful transaction creation

## Why this matters

Before this slice, the monthly report route existed but had no practical product-side way to receive fresh transaction data.

Now the product has the first full path:

- sign in
- create/select account
- add transaction
- refresh monthly report

## What is still missing

- CSV import flows
- Excel import flow
- richer transaction history UI
- editing and deleting transactions
