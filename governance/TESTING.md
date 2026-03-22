# TESTING.md — Hearth Verification Baseline

Version: 1.0

## Default verification commands

- API tests:
  - `npm --workspace @hearth/api run test`
- API build:
  - `npm --workspace @hearth/api run build`
- Web type-check:
  - `npm --workspace @hearth/web run check`
- Readiness:
  - `npm run readiness:first:codeonly`
  - `npm run readiness:first`
  - `npm run readiness:first:strict`
- Post-deploy smoke:
  - `npm run smoke:postdeploy`

## By change type

- UI-only L1:
  - web check + targeted API tests if API contract consumed changed
- API/domain L1:
  - API tests + API build + web check when client contract changed
- L2 domain/security/schema/deploy:
  - readiness strict before release
  - post-deploy smoke after deployment

## Minimum evidence bar

- No merge/push for functional changes without at least one passing automated verification command.
- For L2, include explicit mention of the executed commands in commit-adjacent notes (`memory/YYYY-MM-DD.md`).
