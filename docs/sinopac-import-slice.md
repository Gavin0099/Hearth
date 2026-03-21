# Sinopac Import Slice

This slice upgrades `Hearth` from a bank-agnostic normalized CSV import to the first bank-specific mapping layer.

## Scope

Current endpoint:

- `POST /api/import/sinopac-tw`

Current expected minimal columns:

- `日期`
- `金額`
- `摘要`

Optional columns:

- `幣別`
- `收支別`

## Current behavior

- parses the CSV
- normalizes dates from `YYYY/MM/DD` to `YYYY-MM-DD`
- infers sign from `收支別` when present
- infers category from known transaction keywords
- inserts normalized rows into `transactions`

## Why this is intentionally small

This is not yet the full real-world Sinopac parser. It is the first specialization layer that proves:

- institution-specific column mapping can live above the normalized import seam
- the product does not need to redesign the whole import pipeline for each bank

## Next likely upgrade

- support additional real Sinopac column names
- handle encoding edge cases such as Big5
- add duplicate detection through `source_hash`
