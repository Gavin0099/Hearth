# Recurring Templates Slice

This slice adds the first formal recurring-template data path for Hearth.

## What is included

- `recurring_templates` table in Supabase schema
- shared recurring template types
- Worker API:
  - `GET /api/recurring-templates`
  - `POST /api/recurring-templates`
  - `POST /api/recurring-templates/from-import-candidates`
  - `POST /api/recurring-templates/apply`
- frontend recurring template panel for list + create
- frontend import panel action for turning Excel recurring candidates into templates
- frontend recurring template action for applying this month's templates into transactions

## Current model

Each recurring template stores:

- `account_id`
- `name`
- `category`
- `amount`
- `currency`
- `cadence`
- `anchor_day`
- `source_kind`
- `source_section`
- `notes`

## Why this matters

The Excel import work already detects recurring/sidebar candidates.
This slice creates the first official persistence seam for those candidates to land in.

The follow-up import action now allows the user to take the candidates returned
by `excel-monthly` import and bulk-create recurring templates without manually
retyping each sidebar item.

This slice now also closes the first loop back into cashflow:

- recurring templates can be applied for a specific month
- the API writes them into `transactions`
- duplicate month/template combinations are skipped via `source_hash`
- monthly reports and transaction history can refresh off that same data path

## Current limitations

- recurring templates are not yet auto-applied into transactions
- cadence is currently constrained to `monthly`
- imported candidates currently infer:
  - `name` from the candidate label
  - `category` and `source_section` from the detected sidebar section
  - `notes` from the source sheet name
- apply flow currently uses the current month from the frontend action
