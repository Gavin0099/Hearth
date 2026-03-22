# Credit Card Import Slice

This slice adds the first credit-card-specific mapping endpoint on top of the shared import pipeline.

## Scope

Current endpoint:

- `POST /api/import/credit-card-tw`

Current expected minimal columns:

- `交易日期`
- `金額`
- `摘要`

Optional columns:

- `幣別`
- `交易類型`

## Current behavior

- parses credit-card CSV rows into normalized transactions
- normalizes date `YYYY/MM/DD` -> `YYYY-MM-DD`
- defaults spending rows to negative amounts
- treats refund-like rows as positive amounts
- skips subtotal/summary/payment-like rows
- infers category from existing transaction keywords
- computes `source_hash` and skips duplicates that already exist

## Notes

This is a pragmatic v1 parser for TW credit-card statements, designed to fit the existing ingestion contract.
Further bank-specific quirks and encoding variants can be added incrementally.
