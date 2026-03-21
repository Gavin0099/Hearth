# CSV Import Slice

This is the first import path in `Hearth`.

## Scope

This slice intentionally uses a normalized CSV format instead of jumping directly into a bank-specific parser.

Supported columns:

- `date`
- `amount`
- `currency`
- `category`
- `description`

## Flow

1. user selects an owned account
2. user uploads a CSV file
3. Worker parses and validates rows
4. valid rows are inserted into `transactions`
5. monthly report can refresh from the imported data

## Why this first

It establishes the full ingestion path without coupling the system too early to one institution-specific file shape.

That gives `Hearth`:

- import UI
- import API
- CSV parsing seam
- transaction persistence path

before bank-specific parsers are added.
