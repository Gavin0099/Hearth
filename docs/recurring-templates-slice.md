# Recurring Templates Slice

This slice adds the first formal recurring-template data path for Hearth.

## What is included

- `recurring_templates` table in Supabase schema
- shared recurring template types
- Worker API:
  - `GET /api/recurring-templates`
  - `POST /api/recurring-templates`
- frontend recurring template panel for list + create

## Current model

Each recurring template stores:

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
This slice creates the first official persistence seam for those candidates to eventually land in.

## Current limitations

- import candidates are not yet auto-created into templates
- recurring templates are not yet auto-applied into transactions
- cadence is currently constrained to `monthly`
