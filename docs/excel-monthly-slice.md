# Excel Monthly Import Slice

This slice adds the first `excel-monthly` ingestion seam for Hearth.

## Supported workbook shapes

The current parser intentionally supports two constrained worksheet layouts:

### 1. Grid layout
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

### 2. Horizontal calendar layout
- first sheet only
- first row contains date groups
- second row contains repeated `項目 / 金額` markers under each date
- category boundary rows appear on the left side, such as `飲食費用` or `交通花費`
- detail rows place the description in the `項目` column and amount in the paired `金額` column

Example:

| 分類 |  | 2026/03/01 |  | 2026/03/02 |  |
| --- | --- | --- | --- | --- | --- |
|  |  | 項目 | 金額 | 項目 | 金額 |
| 飲食費用 |  |  |  |  |  |
|  |  | 早餐 | 80 | 午餐 | 120 |
| 交通花費 |  |  |  |  |  |
|  |  | 捷運 | 50 |  |  |

## Current behavior

- scans all worksheets and imports the ones that match a supported monthly layout
- maps Excel categories into Hearth categories:
  - `飲食費用` -> `餐飲`
  - `生活雜費` -> `生活購物`
  - `交通花費` -> `交通`
- supports category boundary rows for the horizontal calendar variant
- ignores non-monthly summary sheets that do not contain a supported date-header pattern
- ignores fixed-sidebar rows that live outside the calendar area and do not contain importable daily amounts
- expands merged cells before parsing so merged date groups and category headers can still be recognized
- can infer full dates from sheet names such as `2026-05` when the worksheet header only contains day numbers like `1`, `2`, `3`
- treats positive values as expenses and stores them as negative transaction amounts
- writes imported rows through the same transaction import pipeline as CSV imports
- keeps `source = excel_monthly`
- applies `source_hash` dedupe through the shared import insertion path
- emits import warnings for recurring/sidebar rows detected inside supported monthly sheets
- emits structured `recurringCandidates` for recurring/sidebar rows detected inside supported monthly sheets

## Current limitations

- does not yet persist recurring/sidebar detections into saved recurring-expense templates
- assumes TWD for this first slice
- still assumes a controlled left-side boundary pattern rather than arbitrary spreadsheet decoration or formula-heavy layouts
- still does not evaluate live Excel formulas when the workbook does not contain cached values

## Why this shape first

This version creates a real Excel ingestion boundary without pretending we already support the final workbook format from `Hearth-plan.md`.
It gives us:

- workbook upload path
- parser contract
- test coverage
- shared dedupe and monthly-report integration

When the real monthly workbook is available, the parser can expand behind the same route instead of redesigning the whole import surface.
