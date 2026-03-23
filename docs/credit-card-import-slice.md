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
- web Gmail/PDF flow now uses a shared bank-specific PDF parser for Sinopac and Esun statements
- Gmail/PDF imports preserve bank-specific transaction source labels so the combined credit-card ledger can distinguish `永豐` vs `玉山`
- PDF parser supports:
  - statement-year inference from bill header
  - `MM/DD` transaction dates with statement-year backfill
  - Sinopac row shape: `消費日 / 入帳日 / 卡末四(可空) / 說明 / 金額 / 其他尾欄`
  - Esun section gating so only fee/detail sections are parsed, not summary blocks
  - cashback / offset rows as positive amounts
  - payment, summary, card-header, and installment-balance note rows skipped before import
  - installment rows keep the current-period booked amount rather than trailing remaining balance

## Notes

This is a pragmatic v1 parser for TW credit-card statements, designed to fit the existing ingestion contract.
Further bank-specific quirks and encoding variants can be added incrementally.
