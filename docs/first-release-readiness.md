# First Release Readiness

This document defines the minimum check before sharing the first Hearth build.

## Commands

- Code-only path (skip env + web build):
  - `npm run readiness:first:codeonly`
- Fast path (skip local web build):
  - `npm run readiness:first`
- Full path (includes web build):
  - `npm run readiness:first:strict`

## What is verified

The readiness script checks:

1. Environment files are configured (unless `-SkipEnv` is used)
2. API test suite passes
3. API TypeScript build passes
4. Web TypeScript check passes
5. Optional web production build passes

## Required files

- `.env`
- `apps/api/.dev.vars`

The script rejects known placeholder values from `.env.example` and `.dev.vars.example`.

## Recommended release flow

1. Configure `.env` and `apps/api/.dev.vars`
2. Run `npm run readiness:first`
3. If all green, run `npm run readiness:first:strict`
4. Deploy web and API after strict pass
