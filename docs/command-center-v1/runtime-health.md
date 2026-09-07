# Command Center v1 runtime health contract

This document defines the personal-release liveness/readiness boundary used by Gate 3 certification.

## Endpoints

### `GET /health`

Backward-compatible process liveness probe.

- does not query PostgreSQL, Sleeper, model services, schedulers, or cron jobs;
- returns HTTP `200` when the Express process can answer requests;
- must remain available even when the private database is unavailable.

### `GET /api/health`

Canonical API liveness probe for Command Center v1.

- same dependency-free semantics as `/health`;
- HTTP `200` means the API process is live, not that the database is ready.

### `GET /api/health/db`

Private-runtime database readiness probe.

- performs a minimal safe PostgreSQL ping through the existing DB pool;
- HTTP `200` + `database_ready` means DB access is ready;
- HTTP `503` + `database_url_missing` means `DATABASE_URL` is not configured;
- HTTP `503` + `database_unavailable` means configuration exists but readiness could not be proven;
- raw provider/connection/password/schema error text is never returned in the response.

A live process with a `503` DB readiness result is **not** a fully ready private Command Center runtime. This separation prevents database incidents from masquerading as Sleeper/API route failures.

## Required private-runtime environment

For the personal Command Center runtime, `DATABASE_URL` must point to an enabled, reachable PostgreSQL database. Production deployment must not depend on a disabled or stale provider endpoint.

`PORT` defaults to `5000` when the deployment platform does not supply it.

## Startup behavior

The production bootstrap binds the release artifact after bounded background initialization. Database migrations and boot-time DB ping remain observable in server logs, while the explicit readiness endpoint provides a stable machine-readable check after startup.

## Sleeper Sync CI

`.github/workflows/sleeper-sync.yml` has two layers:

1. **Always-on release checks**
   - scoped TypeScript regression detection against known repository baseline debt;
   - focused health/Sleeper/truth-boundary tests;
   - full release build via `build.sh`;
   - boot of the built artifact against ephemeral PostgreSQL;
   - `/api/health` and `/api/health/db` smoke checks.

2. **Credentialed external smoke**
   - runs `scripts/test-sleeper-sync.sh` only when `SLEEPER_USERNAME`, `SLEEPER_USER_ID`, and `SLEEPER_LEAGUE_ID` secrets are all configured;
   - absence of those secrets is an explicit skip, not a false failure or false claim that external integration ran;
   - the feature-disabled health behavior is checked after the credentialed external smoke.

## Synthetic-data prohibition

The legacy `/api/sleeper/stats/:playerId` route previously generated random position-shaped usage and fixed fallback values. Personal v1 mounts `sleeperUsageTruthBoundaryRouter` before that legacy route and returns typed `SLEEPER_USAGE_UNAVAILABLE` instead.

Until a verified source owns snap share, route participation, target share, and related usage fields, the active release must fail closed rather than present generated values as observed data.
