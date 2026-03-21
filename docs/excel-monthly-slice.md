# Excel Monthly Import Slice

This slice adds the first `excel-monthly` ingestion seam for Hearth.

## Supported first-pass workbook shape

The current parser intentionally supports a constrained worksheet layout:

- first sheet only
- one header row containing date columns such as `2026/03/01` or `2026-03-01`
- left-side columns:
  - `分類`
  - `項目`
- each row represents one expense item
- each date column cell contains the expense amount for that item on that day

Example:

| 分類 | 項目 | 2026/03/01 | 2026/03/02 |
| --- | --- | --- | --- |
| 飲食費用 | 早餐 | 80 | 120 |
| 交通花費 | 捷運 |  | 50 |
| 生活雜費 | 日用品 | 300 |  |

## Current behavior

- imports the first worksheet only
- maps Excel categories into Hearth categories:
  - `飲食費用` -> `餐飲`
  - `生活雜費` -> `生活購物`
  - `交通花費` -> `交通`
- treats positive values as expenses and stores them as negative transaction amounts
- writes imported rows through the same transaction import pipeline as CSV imports
- keeps `source = excel_monthly`
- applies `source_hash` dedupe through the shared import insertion path

## Current limitations

- does not yet parse the real horizontal calendar workbook with category boundary rows and paired item/amount columns per day
- does not yet parse recurring-expense sidebars
- does not yet support multiple monthly sheets in one workbook
- assumes TWD for this first slice

## Why this shape first

This version creates a real Excel ingestion boundary without pretending we already support the final workbook format from `Hearth-plan.md`.
It gives us:

- workbook upload path
- parser contract
- test coverage
- shared dedupe and monthly-report integration

When the real monthly workbook is available, the parser can expand behind the same route instead of redesigning the whole import surface.
