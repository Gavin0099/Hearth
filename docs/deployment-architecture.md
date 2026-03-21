# Supabase + Cloudflare architecture

Hearth uses Supabase as the system of record and Cloudflare as the delivery and execution layer.

## Responsibilities

### Supabase

- PostgreSQL for household finance data
- Auth for Google sign-in and session management
- Storage for imported CSV and Excel source files
- Row Level Security for per-user isolation

### Cloudflare

- Pages for the React frontend
- Workers for the Hono API
- Cron Triggers for daily quote and FX refresh jobs
- CDN, DNS, TLS, and edge security

## Recommended flow

1. browser uploads import files to Supabase Storage or to a Worker endpoint
2. Worker validates the request and records import metadata
3. parser logic writes normalized records into Supabase tables
4. dashboard queries aggregate data through Worker routes backed by Supabase

## Near-term implementation order

1. wire real Supabase read/write access into the Worker
2. add auth-aware request handling and user scoping
3. implement the first parser endpoint
4. add scheduled market data refresh through Cron Triggers
