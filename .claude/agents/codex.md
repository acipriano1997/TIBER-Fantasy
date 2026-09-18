# Codex — Work Log

Agent: OpenAI Codex
Platform: GitHub (PR-based workflow)
Branch Pattern: `codex/<task-slug>`
Workflow: Creates PRs on GitHub, merged by Architect J after review

---

### Unreleased — 2026-08-09: Rankings season-honesty review corrections
- **Branch:** `codex/pr311-correction-round`
- **Summary:** Closed the remaining Fantasy #307 Phase A review findings across postseason defaults/archive labels and stale-calendar API/UI behavior, including a real mounted fresh-to-stale container regression.
- **Key Files:**
  - `client/src/pages/TiberTiers.tsx` — forward-season archive suffix, retained-selection fail-close, stale-aware query key, calendar-specific unavailable render
  - `client/src/pages/tiberTiersV2Mapper.ts` — distinct calendar-unavailable state and public copy
  - `server/routes/rankingsV2Routes.ts` — target-season default and configured-history-only stale gate
  - focused container, rendered-output, mapper, and Express-route regressions
- **Validation:** Eight focused suites passed 128/128 with `--coverage=false`; build passed with the existing OLC warning; typecheck stayed at the reviewed head's 505 diagnostics with zero new normalized errors; diff check passed.

## Completed Tasks

### Unreleased — 2026-07-31: Active Node admin route authentication hardening
- **Branch:** `codex/protect-active-admin-routes`
- **Summary:** Applied fail-closed authentication to the active Node RAG maintenance boundary, protected FORGE status with its existing shared-secret scheme, and removed the invalid bare `modules` Python dependency without changing debug week-summary or legacy Flask behavior.
- **Key Files:**
  - `server/routes/ragRoutes.ts` — mounts `requireAdminAuth` across `/rag/admin/*`
  - `server/routes/adminForge.ts` — requires `X-FORGE-ADMIN-KEY` before status DB reads
  - `server/routes/__tests__/ragAdminAuth.test.ts` — boundary, public-health, and no-side-effect regression coverage
  - `server/routes/__tests__/adminForgeAuth.test.ts` — missing/invalid/unconfigured/valid status coverage
  - `requirements.txt` — removes bare `modules`
- **Validation:** Focused tests passed 11/11; `npm run build` passed with the existing duplicate-member warning; full Jest run passed 105 suites/796 tests with six pre-existing suite-load failures; repo-wide typecheck remains blocked by existing unrelated errors.

### Unreleased — 2026-03-24: Production root serves frontend + health endpoint contract
- **Branch:** current working branch
- **Summary:** Updated production Express routing so `/` now serves the frontend SPA shell when `dist/public/index.html` exists, while `/health` remains the canonical JSON health probe endpoint. Added an explicit production-safe JSON fallback when frontend assets are absent.
- **Key Files:**
  - `server/index.ts` — added `mountProductionFrontend`, root handler SPA-first behavior, and production static mount status logging
  - `server/__tests__/productionRootRouting.test.ts` — focused coverage for health JSON, root SPA serving, API preservation, and non-API SPA fallback
  - `README.md`, `replit.md` — deployment routing contract notes
- **Validation:** `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand server/__tests__/productionRootRouting.test.ts`

### PR #11 — 2026-02-15: Add NFL Personnel Grouping Visibility
- **Branch:** `codex/add-nfl-personnel-grouping-visibility`
- **Commit:** `62042440` (merged via `b75f5a13`)
- **Summary:** Created the full personnel module infrastructure — service layer, classifier, API routes, and backfill script. Added 3 new columns to `bronze_nflfastr_plays` (`offense_personnel`, `defense_personnel`, `offense_formation`). Backfilled 45,184 plays with personnel data from nflverse pbp_participation parquet.
- **Key Files:**
  - `server/modules/personnel/personnelService.ts` — Personnel profile query service
  - `server/modules/personnel/personnelClassifier.ts` — Every-down grade classification
  - `server/routes/personnelRoutes.ts` — GET /api/personnel/profile endpoint
  - `server/scripts/backfillPersonnel.ts` — Data ingestion script
  - `shared/schema.ts` — 3 columns added to bronzeNflfastrPlays
- **Validation:** 92.6% personnel data coverage across 2025 plays

### PR #9 — 2025-12-28: NFLfastR Inventory Audit
- **Branch:** `codex/produce-nflfastr-inventory-audit`
- **Summary:** Produced audit of nflfastr data inventory.

### PR #8 — 2025-12-16: FORGE Scoring Audit & Playbook Sync
- **Branch:** `codex/audit-forge-scoring-and-playbook-sync`
- **Summary:** Audited FORGE scoring system and synced playbook documentation.

### PR #7 — 2025-12-16: UI/UX Cleanup for Homepage Redesign
- **Branch:** `codex/ui/ux-cleanup-for-homepage-redesign`
- **Summary:** UI/UX cleanup work supporting the homepage redesign effort.

### PR #6 — 2025-12-14: Sleeper Sync & League Overview
- **Branch:** `codex/implement-sleeper-sync-and-league-overview`
- **Summary:** Implemented Sleeper league sync and overview features.

### PR #5 — 2025-12-13: Sleeper League Sync v1
- **Branch:** `codex/implement-sleeper-league-sync-v1`
- **Summary:** First version of Sleeper league synchronization.

### PR #4 — 2025-12-11: Command Hub & Journal Analysis
- **Branch:** `codex/analyze-command-hub-and-journal-implementation`
- **Summary:** Analysis of command hub and journal implementation patterns.

### PR #3 — 2025-12-10: Remove Legacy Oasis/OTC Naming
- **Branch:** `codex/remove-legacy-oasis/otc-naming`
- **Summary:** Cleaned up legacy naming references (Oasis, OTC).

### PR #2 — 2025-12-10: Rebrand to Tiber/TrackStar
- **Branch:** `codex/replace-otc,-oasis,-hardening-with-tiber,-trackstar`
- **Summary:** Replaced all OTC/Oasis/Hardening references with Tiber/TrackStar branding.

### PR #1 — 2025-12-09: FORGE Scoring Documentation
- **Branch:** `codex/generate-internal-documentation-for-forge-scoring-system`
- **Summary:** Generated comprehensive internal documentation for the FORGE scoring system.

---

## Notes for Future Sessions

- Codex works via GitHub PRs — always create a branch named `codex/<task-slug>` before starting work.
- PRs are reviewed and merged by Architect J.
- Codex has been strong at audits, data pipeline work, refactoring, and documentation.
- Personnel module was originally built by Codex (PR #11), then the frontend was added by Replit Agent, then the undercounting fix was done by Claude Code.

### Unreleased — 2026-02-16: FORGE tiers cache migration
- **Branch:** current working branch
- **Summary:** Migrated Tiers page from live batch/PPG-derived behavior to cached canonical FORGE Alpha grades. Added `forge_grade_cache` DB table, a compute-and-cache service, and new FORGE endpoints for cache reads and admin-triggered recomputation.
- **Key Files:**
  - `shared/schema.ts` — `forge_grade_cache` table + indexes + types
  - `server/modules/forge/forgeGradeCache.ts` — compute pipeline, fantasy stat enrichment, upsert, cache reads
  - `server/modules/forge/routes.ts` — GET `/api/forge/tiers`, POST `/api/forge/compute-grades`
  - `client/src/pages/TiberTiers.tsx` — switched data source to `/api/forge/tiers`, fallback UX, FORGE-native table fields
- **Validation:** `npm run build` succeeds; db/test/dev commands blocked by missing DB env in this container.

### Unreleased — 2026-02-17: FORGE snapshot data quality guardrails
- **Branch:** current working branch
- **Summary:** Implemented `snapshotDataValidator` for FORGE snapshot ingestion and wired it into xFP volume, role consistency, and context path snapshot validation. Added unit coverage for all core rules plus low-sample warning behavior.
- **Key Files:**
  - `server/modules/forge/snapshotDataValidator.ts` — Validator rules, warning model, summary logging
  - `server/modules/forge/xfpVolumePillar.ts` — Validates snapshot rows before xFP aggregation
  - `server/modules/forge/roleConsistencyPillar.ts` — Validates rows in `fetchWeeklyRoleData`
  - `server/modules/forge/forgeEngine.ts` — Validates context snapshot rows and aligns games played with clean snapshot weeks
  - `server/modules/forge/__tests__/snapshotDataValidator.test.ts` — Rule-by-rule validator tests
- **Validation:** `npm test -- server/modules/forge/__tests__/snapshotDataValidator.test.ts` passed; `npm run test:forge` blocked by missing `DATABASE_URL` in this environment.

### Unreleased — 2026-02-17: FORGE end-to-end integration tests
- **Branch:** current working branch
- **Summary:** Created `forgeIntegration.test.ts` for real DB-backed FORGE coverage with five categories: per-position sanity checks, seasonal pinned-player assertions, cross-position consistency rules, mode consistency checks, and explicit stability regression guards.
- **Key Files:**
  - `server/modules/forge/__tests__/forgeIntegration.test.ts` — New integration suite using `runForgeEngineBatch`, `gradeForgeWithMeta`, and direct `player_identity_map` canonical-ID lookup via `db`
- **Validation:** `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand server/modules/forge/__tests__/forgeIntegration.test.ts` failed in this environment because `DATABASE_URL` is unset.

### Unreleased — 2026-02-17: FORGE QB continuous volume via xFP
- **Branch:** current working branch
- **Summary:** Migrated QB volume pillar from quantized role-bank metrics to derived `xfp_per_game` (v3 xFP), matching RB/WR/TE continuous volume treatment and reducing bucketed rank ties.
- **Key Files:**
  - `server/modules/forge/forgeEngine.ts` — QB volume pillar now uses `{ metricKey: 'xfp_per_game', source: 'derived', weight: 1.0 }`
  - `server/services/xFptsConfig.ts` — added QB xFP sanity documentation and adjusted QB normalization range to `{ min: 7.5, max: 24.0 }`
- **Validation:** `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand server/modules/forge/__tests__/forgeIntegration.test.ts` blocked by missing `DATABASE_URL`; `npm run build` passed.

### Unreleased — 2026-02-17: FORGE FPOE-first efficiency pillar
- **Branch:** current working branch
- **Summary:** Updated FORGE efficiency pillar configs to center on derived `fpoe_per_game` for WR/RB/TE/QB, reducing overlap with the xFP-based volume pillar and preserving QB passing-skill context with EPA/CPOE/sack-rate secondary metrics.
- **Key Files:**
  - `server/modules/forge/forgeEngine.ts` — updated per-position efficiency metric weights/sources; retained and annotated FPOE normalization `[-5, +10]`
- **Validation:** `npm test -- server/modules/forge/__tests__/snapshotDataValidator.test.ts` passed; `npm run build` passed with existing warning in `server/olc/adjusters.ts`.
- **Notes:** Requested FPOE percentile SQL validation blocked in this environment because `DATABASE_URL` is unset.

### Unreleased — 2026-02-18: Fantasy Lab Phase 1 weekly data foundation
- **Branch:** `feature/fantasy-lab-phase1`
- **Summary:** Implemented backend-only Phase 1 foundation for Fantasy/Market Lab by adding a consolidated weekly materialized view (`fantasy_metrics_weekly_mv`) and new APIs for weekly + player time-series access, plus admin-controlled MV refresh.
- **Key Files:**
  - `migrations/0011_fantasy_lab_weekly_mv.sql` — consolidated MV definition + indexes
  - `server/routes/fantasyLabRoutes.ts` — `/weekly`, `/player`, and `/refresh` handlers
  - `server/routes.ts` — mounted `/api/fantasy-lab/*` and `/api/admin/fantasy-lab/*`
  - `server/scripts/qaFantasyLabPhase1.ts` — sanity checks for non-zero rows, xFP not-all-null, uniqueness
  - `server/modules/fantasyLab/README.md` — source lineage and latest-vs-weekly field docs
- **Validation:** `npm run build` passed (existing duplicate-member warning in `server/olc/adjusters.ts`), `npm run typecheck` failed due unrelated repo-wide TS issues, `npm run qa:fantasy-lab -- 2025 1` failed in this container due PostgreSQL connection refusal.

### 2026-02-19 — Fantasy Lab Phase 2 (FIRE + Delta + Minimal UI)
- Implemented new APIs:
  - `GET /api/fire/eg/batch`
  - `GET /api/fire/eg/player`
  - `GET /api/delta/eg/batch`
- FIRE details:
  - RB/WR/TE-only, rolling 4-week window anchored to `week`
  - Eligibility by rolling snaps (RB >= 50, WR/TE >= 80)
  - Pillars via position-percentile ranks (opportunity, role, conversion)
  - Composite formula: `0.60*Opp + 0.25*Role + 0.15*Conv`
  - RoleIndex includes fallback logic for missing route/target fields with metadata flags
- Delta details:
  - Hybrid delta where display uses percentile (`ForgePct - FirePct`) and ranking uses z-score delta (`z(alpha)-z(fire)`)
  - BUY_LOW / SELL_HIGH labels based on rankZ and displayPct thresholds
- Frontend:
  - Added `/fantasy-lab` route and sidebar nav entry
  - Added controls and tables for FIRE and DELTA tabs
  - Added explicit QB-FIRE-unavailable notice and empty-state handling
- Validation:
  - `npm run build` ✅
  - `npm run dev` blocked (no `DATABASE_URL` in environment)

### 2026-02-20 — QB FIRE v1 (Opportunity + Role only)
- Added migration `0012_qb_fire_v1.sql` to create `qb_xfp_weekly` and augment `fantasy_metrics_weekly_mv` with QB xFP + role-support fields.
- Added ETL entrypoint `scripts/etl/qb_xfp_weekly.py` implementing:
  - Bucketed pass TD / INT / rush TD probabilities with Beta smoothing (`alpha=1`, `beta=20`)
  - Conditional pass yardage by air-yards bucket and QB rush yardage by league QB YPC
  - Upsert into `qb_xfp_weekly` and scoring outputs for redraft/dynasty presets.
- Updated FIRE route logic to include QBs in `/api/fire/eg/batch` and `/api/fire/eg/player`:
  - Added `scoringPreset` param (`redraft|dynasty`, default redraft)
  - QB eligibility: `dropbacks_R >= 80 OR snaps_R >= 100`
  - QB RoleIndex = `0.60*rank(dropbacks_R)+0.25*rank(qb_rush_attempts_R)+0.15*rank(inside10_dropbacks_R)`
  - QB composite: `0.75*Opportunity + 0.25*Role` (no conversion pillar yet)
- Updated fantasy-lab admin refresh endpoint to run the QB xFP ETL before refreshing the MV.
- Added reports:
  - `reports/qb_fire_v1_data_audit.md`
  - `reports/qb_fire_v1_validation.md`
- Validation:
  - `npm run build` ✅
  - DB-dependent checks blocked (`DATABASE_URL` missing in environment).

### 2026-02-23 — FORGE IDP Phase 1 integration scaffold
- Added new IDP modules under `server/modules/forge/idp/`:
  - `idpIngestion.ts` (nflverse defensive CSV pull + upsert into `idp_player_week` / `idp_player_season`)
  - `idpBaselines.ts` (season baseline aggregation into `idp_position_baselines`)
  - `idpPillars.ts` (pillar/weight config for EDGE/DI/LB/CB/S)
  - `idpTeamContext.ts` (defense personnel parser + simple scheme fit scoring)
  - `idpCalibration.ts` (placeholder percentile anchors)
  - `idpForgeEngine.ts` (IDP context + metric lookup + pillar computation)
- Added shared IDP constants/types in `shared/idpSchema.ts`.
- Extended FORGE position typing in `forgeEngine.ts` with offensive/defensive splits and guards (`isDefensivePosition`, `isOffensivePosition`), then routed defensive requests through `runIdpForgeEngine`.
- Updated batch logic to source defensive player IDs from `idp_player_season` with concurrency control.
- Updated grading/cache/types integration to accept defensive positions (`forgeGrading.ts`, `forgeGradeCache.ts`).
- Added admin API router `server/routes/idpAdminRoutes.ts` and mounted it at `/api/admin/idp` in `server/routes.ts`.
- Validation:
  - `npx tsc --noEmit` (fails due existing repo-wide TS issues)
  - `npx tsc --noEmit --pretty false <changed files...>` (fails due existing dependency/global typing issues)

### 2026-02-24 — CATALYST Phase 0 PBP enrichment (wp + score differential)
- Added `wp` and `score_differential` fields to `bronze_nflfastr_plays` Drizzle schema in `shared/schema.ts`.
- Added migration `0013_catalyst_pbp_enrichment.sql`:
  - `ALTER TABLE` add columns if missing
  - backfill from `raw_data->>'wp'` and `raw_data->>'score_differential'`
  - add supporting season/week composite indexes including each new metric.
- Updated NFLfastR ingestion scripts to populate the new columns during imports:
  - `server/scripts/import_nflfastr_2024_bulk.py`
  - `server/scripts/import_nflfastr_2025_bulk.py`
  - `server/scripts/fast_nflfastr_import.py`
- Added `server/scripts/validate_catalyst_pbp_enrichment.py` to run coverage/range checks and a 100-play 2024 Week 1 spot-check sample.
- Validation:
  - `python -m py_compile server/scripts/import_nflfastr_2024_bulk.py server/scripts/import_nflfastr_2025_bulk.py server/scripts/fast_nflfastr_import.py server/scripts/validate_catalyst_pbp_enrichment.py` ✅
  - `npm run build` ✅ (with pre-existing duplicate class member warning in `server/olc/adjusters.ts`)
  - DB checks blocked in this environment because `DATABASE_URL` is not set.

### 2026-03-02 — Rookie profiles DB schema + seed script
- Added `rookie_profiles` table in `shared/schema.ts` with profile/grade/combine fields and supporting indexes.
- Added `scripts/seed-rookie-profiles.ts` that reads `data/rookies/2026_combine_results.json` + `data/rookies/2026_rookie_grades.json`, merges by normalized player name, validates 91 rows, and inserts into `rookie_profiles` via `server/infra/db.ts`.
- Validation: `npm run db:push` attempted, but environment has no `DATABASE_URL`.

### 2026-03-06 — Canonical trade analyze endpoint (v1) + comparison semantic cleanup
- Added compatibility-aware compare semantics in `POST /api/v1/intelligence/compare` by accepting canonical `player_a/player_b` and transitional aliases `player1/player2`, while keeping canonical `ComparisonResponse` output and existing comparison service logic unchanged.
- Implemented `POST /api/v1/intelligence/trade/analyze` returning canonical `TradeAnalysisResponse` by adapting existing `evaluateTradePackage` output through a new mapper (`server/api/v1/mappers/toTradeAnalysisResponse.ts`).
- Kept legacy trade routes/services working; no changes to transitional routes in `server/routes/*` or trade service scoring logic.
- Validation run:
  - `npm run typecheck` (fails due pre-existing repository-wide TS errors)
  - `npm test` (fails in existing suites; includes `DATABASE_URL`-dependent failure)
  - `npx tsc --noEmit server/api/v1/routes.ts server/api/v1/mappers/toTradeAnalysisResponse.ts` (fails due pre-existing global typings/dependency issues)

### 2026-03-20 — External model adapter layer for role opportunity
- Added `server/modules/externalModels/` as the first dedicated boundary for promoted lab/model repos.
- Implemented `Role-and-opportunity-model` integration as a focused client/adapter/service stack:
  - `roleOpportunityClient.ts` for env-based config, timeout handling, and HTTP→typed error mapping.
  - `roleOpportunityAdapter.ts` for canonical payload validation and stable TIBER insight mapping.
  - `roleOpportunityService.ts` for the internal interface consumed by routes.
- Added contained integration routes in `server/routes/roleOpportunityIntegrationRoutes.ts`:
  - `GET /api/integrations/role-opportunity/:playerId?season=2025&week=17`
  - `GET /api/integrations/role-opportunity/health`
- Registered the new route module in `server/routes.ts` without widening the integration surface elsewhere.
- Updated docs/conventions (`README.md`, `replit.md`, `.claude/conventions.md`) to document the adapter pattern and required env vars.
- Added tests covering:
  - canonical payload → internal insight mapping
  - malformed payload rejection
  - timeout mapping
  - 404 mapping
  - integration endpoint envelope
  - disabled/missing-config behavior
- Validation:
  - `npm test -- roleOpportunityAdapter.test.ts` ✅
  - `npm test -- roleOpportunityIntegrationRoutes.test.ts` ✅
  - `npm run build` ✅
  - `curl http://127.0.0.1:<port>/api/integrations/role-opportunity/health` against a minimal local Express mount ✅

### 2026-03-20 — Player detail role opportunity enrichment
- Added opt-in `roleOpportunityInsight` enrichment to `GET /api/player-identity/player/:id` using the existing external-model adapter/service rather than direct upstream calls.
- Added `playerDetailEnrichment.ts` helper to convert role-opportunity success/failure into a stable player-detail status envelope with `available`, `fetchedAt`, and either `data` or `error`.
- Added focused tests covering:
  - normal player detail response with no enrichment request
  - enriched player detail response when requested
  - successful upstream mapping into the player-detail envelope
  - timeout, unavailable, not-found, disabled-config, and malformed-payload containment
- Updated `README.md`, `replit.md`, and `server/modules/externalModels/MODULE.md` with the endpoint contract, opt-in query params, example payloads, and explicit non-fatal behavior.
- Validation:
  - `npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/roleOpportunity/__tests__/playerDetailEnrichment.test.ts` ✅
  - `npx jest --config jest.config.cjs --runInBand --coverage=false server/routes/__tests__/playerIdentityRoutes.test.ts` ✅
  - `npm run build` ✅ (with existing duplicate-class-member warning in `server/olc/adjusters.ts`)

### 2026-03-20 — Player detail enrichment orchestrator for external insights
- Added `server/modules/externalModels/playerDetailEnrichment/` with:
  - `types.ts` defining stable request/result contracts for player-detail external insights.
  - `playerDetailEnrichmentOrchestrator.ts` delegating enrichment assembly and keeping role-opportunity failure-tolerant.
- Refactored `server/routes/playerIdentityRoutes.ts` so the route now parses/validates query params, fetches the base player identity, and delegates opt-in external insight assembly to the orchestrator.
- Added/updated tests covering:
  - empty orchestration result when no enrichments are requested
  - happy-path role-opportunity orchestration
  - preserved unavailable/error envelopes
  - clear missing-season/week handling inside the orchestrator
  - route compatibility for happy path, unavailable path, and missing-param validation
- Updated docs (`README.md`, `server/modules/externalModels/MODULE.md`, `replit.md`) to document the orchestrator as the extension point for future player-detail insights.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/playerDetailEnrichment/__tests__/playerDetailEnrichmentOrchestrator.test.ts server/routes/__tests__/playerIdentityRoutes.test.ts server/modules/externalModels/roleOpportunity/__tests__/playerDetailEnrichment.test.ts` ✅
  - `npm run build` ✅ (existing duplicate-class-member warning remains in `server/olc/adjusters.ts`)


### 2026-03-20 — Module classification audit + architecture doctrine
- Added `docs/architecture/TIBER_FANTASY_MODULE_CLASSIFICATION_AUDIT.md` to classify major in-repo model-like systems as `CORE`, `LEGACY_CORE_TEMP`, `EXTRACT`, `DEPRECATE_NOW`, `DELETE_AFTER_REPLACEMENT`, or `UNKNOWN`.
- Documented the cleanup map with executive summary, classification table, extraction priorities, safe-to-keep core list, orphan/unclear list, and staged cleanup plan.
- Updated `README.md`, `server/modules/externalModels/MODULE.md`, and `replit.md` with a short doctrine note: TIBER-Fantasy is the shell/orchestration core, while standalone model brains should live outside core when practical and be consumed through adapters/orchestrators.
- Validation run:
  - `git diff --check` ✅
  - `npm run build` ✅ (existing duplicate class member warning remains in `server/olc/adjusters.ts`)

### 2026-03-20 — Legacy module freeze/extraction notices
- Added visible local notices for the highest-priority audit targets so contributors see freeze/extract guidance inside the module folders they are most likely to open.
- Updated module docs for FORGE, Metric Matrix, Start/Sit, and OVR.
- Added new local module notices for CATALYST, doctrine, and tiberMatrix.
- Added FIRE extraction/freeze notices in both `server/modules/fantasyLab/README.md` and the top of `server/routes/fireRoutes.ts`.
- Added `docs/architecture/LEGACY_MODULE_WORK_RULES.md` to convert the audit doctrine into practical contribution rules.
- Validation:
  - `git diff --check` ✅
  - `npm run build` ✅ (existing duplicate class member warning remains in `server/olc/adjusters.ts`)

### 2026-03-21 — Codex: FORGE externalization transition spec
- **What changed:** Added a concrete FORGE externalization transition spec defining the future external service contract, TIBER/core responsibilities, and staged migration plan. Updated FORGE module docs to point contributors at the new spec, added an external-models note that FORGE is the next planned target, and refreshed the architecture doctrine summary.
- **Files modified:** `docs/architecture/FORGE_EXTERNALIZATION_TRANSITION_SPEC.md`, `server/modules/forge/MODULE.md`, `server/modules/externalModels/MODULE.md`, `replit.md`
- **Validation:** Ran `git diff --check` and `npm run build` (passes with the existing duplicate-class-member warning in `server/olc/adjusters.ts`).
- **Notes:** This PR is documentation-only. It does not extract, delete, or rewrite runtime FORGE code; any unconfirmed FORGE consumers remain explicitly marked as identified/likely/unknown in the spec.

### 2026-03-21 — Codex: External FORGE adapter + compare endpoint
- **What changed:** Added a migration-safe external FORGE adapter/client/service layer under `server/modules/externalModels/forge/`, introduced a dual-run compare service and contained `/api/integrations/forge/compare` + `/api/integrations/forge/health` routes, and documented the compare-only rollout plus required env vars.
- **Files modified:** `server/modules/externalModels/forge/*`, `server/routes/forgeIntegrationRoutes.ts`, `server/routes.ts`, `server/routes/__tests__/forgeIntegrationRoutes.test.ts`, `README.md`, `server/modules/externalModels/MODULE.md`, `replit.md`
- **Validation:** Ran targeted Jest suites for the external FORGE adapter/service/compare route and ran `npm run build` (passes with the existing duplicate-class-member warning in `server/olc/adjusters.ts`).
- **Notes:** The integration point is intentionally narrow: single-player offensive FORGE E+G comparison only. Live `/api/forge/*` production behavior remains unchanged.

### 2026-03-21 — FORGE parity fixture pack + snapshot harness
- Added committed fixture coverage for elite, stable, volatile, weak-opportunity, low-availability, dynasty, and best-ball FORGE compare cases.
- Added `forgeParityHarness.ts` + `runForgeParityHarness.ts` for deterministic parity summaries/snapshot-style reporting without touching production `/api/forge/*` traffic.
- Added focused Jest coverage for fixture stability, deterministic summary output, aggregation counts, and contained partial failures.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand server/modules/externalModels/forge/__tests__/forgeParityFixtures.test.ts server/modules/externalModels/forge/__tests__/forgeParityHarness.test.ts` ✅
  - `npm run build` ✅ (existing duplicate member warning in `server/olc/adjusters.ts`)
  - `git diff --check` ✅

### 2026-03-21 — Codex: FORGE parity harness debug metadata + npm runner
- **What changed:** Extended the FORGE parity harness summary with a stable `results` array alias and per-fixture `confidenceDelta`/`componentDeltas` metadata in deterministic snapshot output, added an `npm run forge:parity` helper, and refreshed migration docs to point contributors at the runner plus debug fields.
- **Files modified:** `server/modules/externalModels/forge/forgeParityHarness.ts`, `server/modules/externalModels/forge/__tests__/forgeParityHarness.test.ts`, `server/modules/externalModels/forge/README.md`, `server/modules/externalModels/MODULE.md`, `README.md`, `replit.md`, `package.json`
- **Validation:** Ran targeted Jest parity suites with snapshot update and ran `npm run build` (passes with the existing duplicate-class-member warning in `server/olc/adjusters.ts`).
- **Notes:** This keeps the existing compare endpoint contract intact; the new `results` field is additive and mirrors `perFixture` for deterministic migration reporting.

### 2026-03-21 — FORGE parity report endpoint + exporter
- Added `forgeParityReportService.ts` to wrap the existing parity harness in a stable migration-only contract with `generatedAt`, integration readiness metadata, summary counts, and deterministic `results`.
- Added `GET /api/integrations/forge/parity-report` in `server/routes/forgeIntegrationRoutes.ts` without changing legacy `/api/forge/*` behavior or the existing compare endpoint.
- Added `forgeParityReportExporter.ts` plus `runForgeParityReport.ts` and `npm run forge:parity:report` for local stdout/JSON export of the parity report contract.
- Expanded focused Jest coverage for the new report route, report service, and exporter while keeping the compare/health route tests intact.
- Updated `README.md`, `server/modules/externalModels/forge/README.md`, `server/modules/externalModels/MODULE.md`, and `replit.md` to document the migration-only endpoint, exporter usage, and parity-status interpretation.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/routes/__tests__/forgeIntegrationRoutes.test.ts server/modules/externalModels/forge/__tests__/forgeParityHarness.test.ts server/modules/externalModels/forge/__tests__/forgeParityReportService.test.ts server/modules/externalModels/forge/__tests__/forgeParityReportExporter.test.ts` ✅
  - `npm run build` ✅ (existing duplicate-class-member warning remains in `server/olc/adjusters.ts`)
  - `git diff --check` ✅


### 2026-03-21 — Codex: Opt-in external FORGE player detail preview
- **What changed:** Added an additive `externalForgeInsight` preview path to `GET /api/player-identity/player/:id` behind `includeExternalForge=true`, reused the existing external FORGE adapter/service boundary via the player-detail enrichment orchestrator, and kept failures non-fatal with a stable unavailable/error envelope.
- **Files modified:** `server/routes/playerIdentityRoutes.ts`, `server/modules/externalModels/playerDetailEnrichment/*`, `server/modules/externalModels/forge/playerDetailEnrichment.ts`, `server/modules/externalModels/forge/__tests__/playerDetailEnrichment.test.ts`, `server/routes/__tests__/playerIdentityRoutes.test.ts`, `README.md`, `server/modules/externalModels/MODULE.md`, `server/modules/externalModels/forge/README.md`, `replit.md`
- **Validation:** Ran targeted Jest suites for the player-detail orchestrator, new external FORGE player-detail helper, and player identity route; ran `npm run build`; ran `git diff --check`.
- **Notes:** Legacy FORGE remains the default everywhere else. External FORGE preview currently stays narrow to QB/RB/WR/TE player detail and defaults preview `week` to `season` plus mode to `redraft` unless explicitly overridden.

### 2026-03-21 — Codex: Player detail FORGE comparison preview
- **What changed:** Added opt-in `includeForgeComparison=true` support to `GET /api/player-identity/player/:id`, reused the existing dual-run compare service on the player-detail surface, and returned stable `forgeComparison` envelopes with side-by-side legacy/external insight plus parity metadata.
- **Files modified:** `server/routes/playerIdentityRoutes.ts`, `server/modules/externalModels/playerDetailEnrichment/*`, `server/modules/externalModels/forge/playerDetailEnrichment.ts`, `server/routes/__tests__/playerIdentityRoutes.test.ts`, `server/modules/externalModels/forge/__tests__/playerDetailEnrichment.test.ts`, `server/modules/externalModels/playerDetailEnrichment/__tests__/playerDetailEnrichmentOrchestrator.test.ts`, `README.md`, `server/modules/externalModels/MODULE.md`, `server/modules/externalModels/forge/README.md`, `replit.md`
- **Validation:** `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/playerDetailEnrichment/__tests__/playerDetailEnrichmentOrchestrator.test.ts server/modules/externalModels/forge/__tests__/playerDetailEnrichment.test.ts server/routes/__tests__/playerIdentityRoutes.test.ts server/modules/externalModels/forge/__tests__/forgeCompareService.test.ts` ✅; `npm run build` ✅; `git diff --check` ✅
- **Notes:** This stays migration-only and non-fatal. `includeExternalForge=true` remains external-only preview, while `includeForgeComparison=true` explicitly requests both sides for one player detail response.

### 2026-03-21 — FORGE migration review endpoint for sampled comparisons
- Added `forgeMigrationReviewService.ts` to sample offensive players from the existing legacy FORGE batch source, reuse the existing compare service per sampled player, aggregate stable summary metrics, and contain per-player errors instead of failing the whole review.
- Added `GET /api/integrations/forge/review` with query validation for `position`, `season`, `week`, `limit`, `mode`, and additive metadata describing integration readiness / skipped-review states.
- Added focused Jest coverage for stable review output, summary aggregation, partial failure containment, disabled integration behavior, and route-level validation.
- Updated migration docs in `README.md`, `server/modules/externalModels/forge/README.md`, `server/modules/externalModels/MODULE.md`, and `replit.md` to describe the operator-only review surface and make clear it does not change production FORGE defaults.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/forge/__tests__/forgeMigrationReviewService.test.ts server/routes/__tests__/forgeIntegrationRoutes.test.ts` ✅
  - `npm run build` ✅ (existing duplicate-class-member warning remains in `server/olc/adjusters.ts`)
  - `git diff --check` ✅
  - `curl -sv "http://127.0.0.1:5051/api/integrations/forge/review?position=WR&season=2025&week=17&limit=2&mode=redraft" -o /tmp/forge-review-body.json` ✅ (against a mocked local Express app wired to the router)

### 2026-03-23 — Codex: WR Breakout Lab Signal-Validation promotion
- Added `server/modules/externalModels/signalValidation/` with a filesystem-backed client, CSV/JSON adapter, stable service interface, README, and focused adapter tests for promoted Signal-Validation-Model exports.
- Added `GET /api/data-lab/breakout-signals[?season=<year>]` through `server/routes/dataLabBreakoutSignalsRoutes.ts`, mounted it in `server/routes.ts`, and covered ready/empty/not-found responses with focused route tests.
- Added the new `/tiber-data-lab/breakout-signals` UI, including best-recipe badge/header, ranked WR signal table, season selector, guarded empty/loading/error states, and expandable full-field detail rows.
- Updated Data Lab discovery/docs in `client/src/pages/DataLabHub.tsx`, `client/src/lib/metricRegistry.ts`, `README.md`, `server/modules/externalModels/MODULE.md`, and `replit.md` to clarify that TIBER-Fantasy consumes promoted Signal-Validation-Model outputs and does not recompute scores.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/signalValidation/__tests__/signalValidationAdapter.test.ts server/routes/__tests__/dataLabBreakoutSignalsRoutes.test.ts client/src/__tests__/breakoutSignalsView.test.ts` ✅
  - `npm run build` ✅ (existing duplicate-class-member warning remains in `server/olc/adjusters.ts`)
  - `git diff --check` ✅
  - `npm run typecheck` ❌ (repo-wide pre-existing TypeScript errors outside this PR)


### 2026-03-23 — Codex: WR Breakout Lab polish pass
- Added client-side sorting, search, and quick filters to the WR Breakout Lab without altering upstream scoring.
- Reworked expanded detail rows into grouped read-only sections for ranking summary, signal components, breakout context, cohort/role context, and raw export metadata.
- Improved best-recipe provenance copy plus loading/empty/error operator guidance.
- Updated focused frontend tests and module docs.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false client/src/__tests__/breakoutSignalsView.test.ts` ✅
  - `npm run build` ✅ (existing duplicate-class-member warning remains in `server/olc/adjusters.ts`)
  - `git diff --check` ✅

### 2026-03-23 — Codex: Age Curve / ARC Lab promotion
- Added `server/modules/externalModels/ageCurves/` with a read-only client/adapter/service stack, README, and focused adapter tests for promoted ARC exports or compatibility payloads.
- Added `GET /api/data-lab/age-curves[?season=<year>]` through `server/routes/dataLabAgeCurvesRoutes.ts`, mounted it in `server/routes.ts`, and covered ready/empty/malformed responses with focused route tests.
- Added the new `/tiber-data-lab/age-curves` UI, including season/team/position/search controls, sortable developmental-context table columns, expandable detail/provenance sections, explicit loading/empty/error guards, and a lightweight expected-vs-actual comparison bar card.
- Updated Data Lab discovery/docs in `client/src/pages/DataLabHub.tsx`, `client/src/lib/metricRegistry.ts`, `README.md`, `server/modules/externalModels/MODULE.md`, and `replit.md` to document the third promoted read-only sub-model and its no-recomputation posture.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/ageCurves/__tests__/ageCurvesAdapter.test.ts server/routes/__tests__/dataLabAgeCurvesRoutes.test.ts client/src/__tests__/ageCurvesView.test.ts` ✅
  - `npm run build` ✅ (existing duplicate-class-member warning remains in `server/olc/adjusters.ts`)
  - `git diff --check` ✅
  - `curl -sS "http://127.0.0.1:5055/api/data-lab/age-curves?season=2025"` ✅ (against a mocked local Express mount wired to the router)

### 2026-03-23 — Data Lab promoted-module cohesion pass
- Reworked the Data Lab hub so Breakout, Role & Opportunity, and Age Curve / ARC Lab sit in a dedicated promoted-module system section with stable promoted/read-only badges plus concise "what this module is for" and "when to use this" copy.
- Added reusable related-module framing for all three promoted lab pages and wired lightweight player carry-through using `playerId` / `playerName` query params.
- Added focused frontend coverage for hub rendering, related-module links, and carry-through helpers while keeping scope product-only.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false client/src/__tests__/breakoutSignalsView.test.ts client/src/__tests__/roleOpportunityView.test.ts client/src/__tests__/ageCurvesView.test.ts client/src/__tests__/dataLabHub.test.ts client/src/__tests__/dataLabPromotedModules.test.ts` ✅
  - `npm run build` ✅ (existing duplicate-class-member warning remains in `server/olc/adjusters.ts`)
  - `git diff --check` ✅

### 2026-03-23 — Codex: Point Scenario Lab promotion
- Added `server/modules/externalModels/pointScenarios/` with a read-only client/adapter/service stack, README, and focused adapter tests for promoted Point-prediction-Model scenario outputs or compatibility payloads.
- Added `GET /api/data-lab/point-scenarios[?season=<year>]` through `server/routes/dataLabPointScenariosRoutes.ts`, mounted it in `server/routes.ts`, and covered ready/empty/malformed responses with focused route tests.
- Added the new `/tiber-data-lab/point-scenarios` UI, including season/event-type/search controls, a scenario table, a read-only detail drawer for full scenario/explanation/provenance payloads, and related-module carry-through links back to Breakout, Role & Opportunity, and Age Curve / ARC Lab.
- Updated Data Lab discovery/docs in `client/src/pages/DataLabHub.tsx`, `client/src/lib/dataLabPromotedModules.ts`, `client/src/lib/metricRegistry.ts`, `README.md`, `server/modules/externalModels/MODULE.md`, and `replit.md` to document the fourth promoted read-only sub-model and its scenario-analysis framing.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/pointScenarios/__tests__/pointScenariosAdapter.test.ts server/routes/__tests__/dataLabPointScenariosRoutes.test.ts client/src/__tests__/pointScenariosView.test.ts client/src/__tests__/dataLabHub.test.ts client/src/__tests__/dataLabPromotedModules.test.ts` ✅
  - `npm run build` ✅ (existing duplicate-class-member warning remains in `server/olc/adjusters.ts`)
  - `git diff --check` ✅

### 2026-03-23 — Player Research Workspace cross-model synthesis surface
- **Branch:** current working branch
- **Summary:** Added the read-only Player Research Workspace at `/tiber-data-lab/player-research` plus a new `playerResearch/` external-model orchestrator and `/api/data-lab/player-research` endpoint. The workspace aggregates promoted breakout, role, ARC, and point-scenario summaries for one player with search, deep-linking, partial-data handling, and direct link-outs to the deeper promoted labs.
- **Key Files:**
  - `server/modules/externalModels/playerResearch/playerResearchService.ts` — cross-model aggregation + normalization layer
  - `server/routes/dataLabPlayerResearchRoutes.ts` — read-only API route for the workspace
  - `client/src/pages/PlayerResearchLab.tsx` — route-level page wiring
  - `client/src/components/data-lab/PlayerResearchWorkspaceView.tsx` — player-centric synthesis UI
  - `client/src/lib/playerResearch.ts` — client contract, query helpers, and formatting/search utilities
- **Validation:** Focused Jest suites passed for the new service, route, hub/module helpers, and workspace rendering; `npm run build` passed with the existing warning in `server/olc/adjusters.ts`.

### 2026-03-23 — Codex: Data Lab promoted-module stabilization pass
- Standardized promoted-module UX patterns across Breakout, Role & Opportunity, Age Curve / ARC, Point Scenario, and Player Research with a shared state card, shared provenance/dependency copy, and normalized “go to module / go to player research” navigation language.
- Preserved season carry-through across promoted deep links by threading `season` alongside `playerId` / `playerName` in promoted module context helpers and target pages.
- Added additive operator-facing route diagnostics for promoted-module config/no-data/contract/upstream states via `promotedModuleOperator.ts`, then surfaced those diagnostics inside the client hint copy.
- Added a lightweight Data Lab Hub status/help surface describing promoted modules as read-only model surfaces plus their main upstream dependencies.
- Updated focused view/helper/route tests and refreshed docs in `README.md`, `server/modules/externalModels/MODULE.md`, and `replit.md`.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false client/src/__tests__/pointScenariosView.test.ts client/src/__tests__/breakoutSignalsView.test.ts client/src/__tests__/roleOpportunityView.test.ts client/src/__tests__/ageCurvesView.test.ts client/src/__tests__/playerResearchWorkspaceView.test.ts client/src/__tests__/dataLabHub.test.ts client/src/__tests__/dataLabPromotedModules.test.ts server/routes/__tests__/dataLabBreakoutSignalsRoutes.test.ts server/routes/__tests__/dataLabRoleOpportunityRoutes.test.ts server/routes/__tests__/dataLabAgeCurvesRoutes.test.ts server/routes/__tests__/dataLabPointScenariosRoutes.test.ts` ✅
  - `npm run build` ✅ (existing duplicate-class-member warning remains in `server/olc/adjusters.ts`)
  - `git diff --check` ✅

### 2026-03-23 — Codex: Team Research Workspace team-level synthesis surface
- Added the read-only Team Research Workspace at `/tiber-data-lab/team-research` plus a new `teamResearch/` external-model orchestrator and `/api/data-lab/team-research` endpoint.
- Aggregated promoted breakout, role, ARC, and point-scenario outputs by team with team search, `team` deep-linking, team identity/header context, key-player summaries, and direct link-outs back into Player Research.
- Extended promoted-module navigation/docs so Team Research sits alongside Player Research and the four promoted labs with season/team carry-through.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/teamResearch/__tests__/teamResearchService.test.ts server/routes/__tests__/dataLabTeamResearchRoutes.test.ts client/src/__tests__/teamResearchWorkspaceView.test.ts client/src/__tests__/dataLabPromotedModules.test.ts client/src/__tests__/dataLabHub.test.ts client/src/__tests__/playerResearchWorkspaceView.test.ts` ✅
  - `npm run build` ✅ (existing duplicate-class-member warning remains in `server/olc/adjusters.ts`)

### Unreleased — 2026-03-23: Core-flow Data Lab discovery hooks
- **Branch:** current working branch
- **Summary:** Surfaced lightweight promoted-research entry points in normal product flows by adding reusable Player Research / Team Research quick links to the player page and Tiers rankings table, plus a compact read-only dashboard widget that opens the Data Lab Command Center and highlights a few promoted priorities.
- **Key Files:**
  - `client/src/components/data-lab/CoreResearchQuickLinks.tsx` — shared read-only Player Research / Team Research / Command Center quick links
  - `client/src/components/data-lab/DataLabDiscoveryWidget.tsx` — compact dashboard insight widget driven by Command Center data
  - `client/src/pages/PlayerPage.tsx` — player-header research entry points
  - `client/src/pages/TiberTiers.tsx` — rankings-row research entry points
  - `client/src/pages/Dashboard.tsx` — command-center-backed discovery widget
  - `client/src/__tests__/coreResearchQuickLinks.test.ts` / `client/src/__tests__/dataLabDiscoveryWidget.test.ts` — focused rendering + carry-through coverage
- **Validation:** `npm test -- client/src/__tests__/coreResearchQuickLinks.test.ts client/src/__tests__/dataLabDiscoveryWidget.test.ts client/src/__tests__/dataLabPromotedModules.test.ts`, `git diff --check`, `npm run build`.


### 2026-03-23 — Codex: Player-page inline Research Summary block
- Added `client/src/components/data-lab/PlayerResearchSummaryBlock.tsx` to render a lightweight read-only inline research strip on player pages using existing Player Research orchestration outputs.
- Wired `client/src/pages/PlayerPage.tsx` to fetch `GET /api/data-lab/player-research` for the viewed player/season and render compact breakout, recipe, role/opportunity, age-curve, and point-scenario notes only when promoted summaries are present.
- Preserved trust posture with explicit promoted/read-only wording, a stable CTA into `/tiber-data-lab/player-research`, and separate empty vs unavailable behavior for missing summaries vs system trouble.
- Added focused rendering coverage in `client/src/__tests__/playerResearchSummaryBlock.test.ts` for full, partial, CTA, and empty/unavailable states.
- Updated `README.md` and `replit.md` so the core-flow documentation now mentions the new inline player-page Research Summary block.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false client/src/__tests__/playerResearchSummaryBlock.test.ts client/src/__tests__/coreResearchQuickLinks.test.ts` ✅
  - `npm run build` ✅ (existing duplicate-class-member warning remains in `server/olc/adjusters.ts`)
  - `git diff --check` ✅

### 2026-03-23 — Codex: Team-page inline Team Research summary
- Added `client/src/components/data-lab/TeamResearchSummaryBlock.tsx` to render a lightweight read-only inline Team Research strip from existing Team Research orchestration outputs.
- Wired `client/src/pages/SchedulePage.tsx` so the routed Team SoS surface now selects a team from the grid and renders compact offensive-environment, role concentration, breakout, scenario, and developmental cues when promoted data exists.
- Preserved trust posture with promoted/read-only wording, a stable CTA into `/tiber-data-lab/team-research`, and distinct empty vs unavailable handling.
- Added focused coverage in `client/src/__tests__/teamResearchSummaryBlock.test.ts` and refreshed README/replit core-flow notes.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false client/src/__tests__/teamResearchSummaryBlock.test.ts client/src/__tests__/coreResearchQuickLinks.test.ts` ✅
  - `npm run build` ✅ (existing duplicate-class-member warning remains in `server/olc/adjusters.ts`)
  - `git diff --check` ✅

### 2026-03-24 — WR Breakout artifact handoff hardening + readiness tests
- Added a dedicated operator runbook at `docs/runbooks/WR_BREAKOUT_SIGNAL_VALIDATION_HANDOFF.md` documenting the Signal-Validation export command, required file paths, copy/mount flow, season-token alignment, and `/api/data-lab/promoted-status` verification.
- Updated the Signal Validation adapter client to return clearer season-mismatch not-found messaging with available export seasons and feature-season filename guidance.
- Added focused readiness coverage in `server/modules/externalModels/__tests__/promotedModelStatusService.test.ts`:
  - happy path: required breakout artifacts exist and status reports `ready`
  - missing-artifact path: no exports present and status reports `missing_export_artifact`
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/__tests__/promotedModelStatusService.test.ts`

### 2026-03-24 — Promoted WR breakout season defaulting fix
- Removed client-side hard fallback to current NFL season for promoted Data Lab surfaces that were forcing `season` into requests.
- Updated Command Center, Player Research, Team Research, and Dashboard discovery flows to preserve explicit season params but otherwise defer to backend/export-driven season selection.
- Hardened season-selector rendering for empty/no-season states without silently rewriting query-param input.
- Added focused tests for: explicit season precedence, defaulting to latest breakout export season, and no-season available/unavailable behavior.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/dataLabCommandCenter/__tests__/dataLabCommandCenterService.test.ts server/routes/__tests__/dataLabCommandCenterRoutes.test.ts client/src/__tests__/dataLabCommandCenterView.test.ts client/src/__tests__/dataLabDiscoveryWidget.test.ts client/src/__tests__/playerResearchWorkspaceView.test.ts client/src/__tests__/teamResearchWorkspaceView.test.ts` ✅

### 2026-03-24 — Command Center lane-level season honesty UX
- Added lane-level season honesty states for promoted Data Lab modules so Command Center module cards can now report `ready`, `other_seasons`, `empty`, or `unavailable` with explicit per-lane `availableSeasons` metadata.
- Updated Command Center section-level fallback messaging so empty states now distinguish: no rows for selected season vs healthy rows existing for other seasons.
- Extended promoted-status service/contracts with `available_other_seasons` and `availableSeasons`, then surfaced those signals in the promoted status panel to reduce false “broken” interpretation during season mismatch.
- Added focused test coverage for:
  - one lane ready in selected season while another lane is only healthy in a different season,
  - distinction between healthy-but-different-season and missing artifact / unavailable failures.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/dataLabCommandCenter/__tests__/dataLabCommandCenterService.test.ts server/modules/externalModels/__tests__/promotedModelStatusService.test.ts client/src/__tests__/dataLabCommandCenterView.test.ts server/routes/__tests__/dataLabCommandCenterRoutes.test.ts server/routes/__tests__/dataLabPromotedStatusRoutes.test.ts` ✅
### 2026-03-26 — Codex: Promoted rookie artifact integration + product route hardening
- **Branch:** current working branch
- **Summary:** Implemented a dedicated promoted rookie artifact consumer boundary (`server/modules/externalModels/rookies/`) and rewired `/api/rookies/:season` + `/rookies` to render model-backed rookie content from a producer artifact instead of the legacy in-repo DB table query. Added consumer-side contract checks, deterministic field mapping, graceful missing/invalid artifact behavior, and UI-visible promoted model metadata + summary snippets.
- **Key Files:**
  - `server/modules/externalModels/rookies/rookieArtifactClient.ts`
  - `server/modules/externalModels/rookies/rookieArtifactAdapter.ts`
  - `server/modules/externalModels/rookies/rookieArtifactService.ts`
  - `server/routes/rookiesPromotedRoutes.ts`
  - `client/src/pages/RookieBoard.tsx`
  - `docs/runbooks/ROOKIE_PROMOTED_HANDOFF.md`
- **Validation:** `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/rookies/__tests__/rookieArtifactAdapter.test.ts server/routes/__tests__/rookiesPromotedRoutes.test.ts`; `npm run build`.

### 2026-03-26 — Codex: Rookie promoted alpha/tier mapping integrity hotfix
- **Summary:** Fixed promoted rookie composite-field drop-off by expanding adapter mapping aliases to support nested/camelCase producer contracts (`scores.*`, `score.*`, `composite.*`) and alternate row containers (`board.players`, `rookies`), restoring API-level availability of Rookie Alpha, tier, rank, and component scores.
- **Key Files:**
  - `server/modules/externalModels/rookies/rookieArtifactAdapter.ts`
  - `server/modules/externalModels/rookies/__tests__/rookieArtifactAdapter.test.ts`
  - `server/modules/externalModels/rookies/__tests__/rookieArtifactService.test.ts`
- **Validation:** `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/rookies/__tests__/rookieArtifactAdapter.test.ts server/modules/externalModels/rookies/__tests__/rookieArtifactService.test.ts server/routes/__tests__/rookiesPromotedRoutes.test.ts` ✅

### 2026-03-31 — Product shell IA realignment phase-1 pass
- Added `docs/architecture/TIBER_PRODUCT_SHELL_REALIGNMENT_PLAN.md` with architecture-aligned diagnosis, complete mounted-route classification table, vocabulary cleanup recommendations, and a minimal implementation scope.
- Refactored `client/src/components/TiberLayout.tsx` navigation into clearer product-layer sections and demoted legacy/internal surfaces out of primary emphasis while preserving access.
- Refactored `client/src/pages/Dashboard.tsx` into a real front door: lane cards (Rankings, Rookie Board, Research, Agent/API), research signal feed, and a retained but demoted data-backed live snapshot table.
- Added a brief README shell-positioning note.
- Validation:
  - `npm run build` ✅ (existing duplicate-class-member warning remains in `server/olc/adjusters.ts`)

### 2026-04-02 — Codex: Team State artifact consumer boundary + route
- Added `server/modules/externalModels/teamState/` with a read-only artifact client/service/types stack for `tiber_team_state_v0_1`.
- Added `GET /api/data-lab/team-state` via `server/routes/dataLabTeamStateRoutes.ts`, supporting `season` (required) and `throughWeek` (optional) with stable `ok`/`error` envelopes and explicit team-state error codes.
- Wired route registration in `server/routes.ts` and documented the new adapter in `server/modules/externalModels/MODULE.md` and `teamState/README.md`.
- Added focused route coverage in `server/routes/__tests__/dataLabTeamStateRoutes.test.ts` for ready, not-found, and invalid-request paths.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/routes/__tests__/dataLabTeamStateRoutes.test.ts` ✅
  - `npm run build` ✅ (pre-existing warning in `server/olc/adjusters.ts`)

### 2026-04-02 — Codex: PR116 trust-gap follow-up (Team State contract validation)
- Hardened `server/modules/externalModels/teamState/teamStateClient.ts` to validate parsed JSON against required `tiber_team_state_v0_1` artifact shape before returning success.
- Added nested required-key checks for top-level payload, `source`, `teams[]`, `sample`, `features`, and `stability`; parseable-but-contract-invalid artifacts now throw `TeamStateIntegrationError('invalid_payload', ...)`.
- Updated Team State route tests to use a real contract-shaped success payload and added a stable invalid-payload route assertion.
- Added dedicated adapter coverage in `server/modules/externalModels/teamState/__tests__/teamStateClient.test.ts` for valid artifact acceptance and parseable-contract-invalid rejection.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/teamState/__tests__/teamStateClient.test.ts server/routes/__tests__/dataLabTeamStateRoutes.test.ts` ✅
  - `npm run build` ✅ (pre-existing warning in `server/olc/adjusters.ts`)

### 2026-04-02 — Codex: Rankings v2 definition audit/spec
- Added `docs/architecture/TIBER_RANKINGS_V2_DEFINITION.md` as a spec-first architecture/product definition for Rankings v2.
- Audited ranking-related surfaces across:
  - `client/src/pages/TiberTiers.tsx`
  - frontend route wiring/navigation (`client/src/App.tsx`, `Dashboard.tsx`, `ForgeHub.tsx`)
  - backend ranking endpoints (`/api/forge/tiers`, `/api/rankings*`, `/api/power/*`, `/api/rankings/otc-final`, `/api/admin/*-rankings-sandbox`, deprecated `/api/tiber/rankings`)
  - Team State read-only consumer boundary for v2 input-policy framing.
- Produced explicit status taxonomy and keep/replace/hide/fold recommendations, plus phased “first honest rebuild” path and deferrals.
- Validation:
  - repo audit commands (`rg`, `sed`) only; no code-path or model rebuild performed.

### 2026-04-02 — Rankings v2 canonical contract scaffold + surface taxonomy pass
- Added `server/contracts/rankingsV2.ts` as the canonical Rankings v2 public contract scaffold with stable top-level response fields, item-level explanation spine, and trust envelope.
- Added concise in-code status labeling comments for key ranking lanes:
  - Canonical current `/tiers` + `/api/forge/tiers`
  - Legacy `/api/rankings*` and `/api/rankings/otc-final`
  - Experimental/internal `/api/power/*`
  - Internal-only admin ranking sandboxes
  - Legacy/deprecated `/api/tiber`
- Fixed dead ForgeHub ranking shortcuts by replacing unmounted `/rankings/wr|rb|te|qb` links with canonical `/tiers` links.
- Added an implementation-anchor note in `docs/architecture/TIBER_RANKINGS_V2_DEFINITION.md` pointing to the new contract file.
- Validation:
  - `npm run build` ✅ (pre-existing warning in `server/olc/adjusters.ts` remains)

### 2026-04-12 — Codex: Live scoring-service integration (player + rankings)
- Added `server/modules/externalModels/scoring/` with typed contracts, request mappers, and a thin resilient client/service for:
  - `POST /api/tiber/weekly/player-card`
  - `POST /api/tiber/weekly/rankings`
  - `POST /api/tiber/ros/player-card`
  - `POST /api/tiber/weekly/compare`
- Wired player detail route (`/api/player-identity/player/:id`) to optionally hydrate scoring via `includeScoringWeekly=true` and `includeScoringRos=true`, with safe non-fatal result envelopes.
- Wired Rankings v2 weekly route (`/api/rankings/v2/weekly`) to consume scoring rankings first and gracefully fall back to FORGE cache when scoring is missing/unavailable.
- Added player-page UI surface `ScoringSnapshotCard` and integrated it into `PlayerPage` to render expected points, VORP, floor/median/ceiling, confidence/volatility/fragility tags, weekly outlook, role summary, value summary, and role notes.
- Updated `TiberTiers` table to render scoring-driven rankings columns (rank, player/team/pos, expected, VORP, floor, ceiling, confidence band, weekly outlook).
- Added focused tests for scoring client handling, player-route integration path, rankings-route integration path, and scoring-unavailable UI state.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/scoring/__tests__/scoringServiceClient.test.ts server/routes/__tests__/playerIdentityRoutes.test.ts server/routes/__tests__/rankingsV2Routes.test.ts client/src/__tests__/scoringSnapshotCard.test.ts` ✅
  - `npm run build` ✅ (pre-existing duplicate class member warning in `server/olc/adjusters.ts`)

### 2026-04-12 — Codex: PR123 follow-up wire-contract fixes
- Addressed PR feedback on scoring-service wire compatibility:
  - request bodies now match live upstream contract (`players`, `league_context`, ROS `remaining_weeks`, compare `player_a`/`player_b`)
  - response parsing now unwraps service envelope (`ok` + `data`) and reads route payload layers (`data.card`, `data.view`)
- Hardened client conversions:
  - null/empty numeric fields remain `null` instead of coercing to `0`
  - invalid timeout config now falls back to default timeout
- Updated rankings integration to provide `players` array input to scoring rankings (from existing cache seed set) while retaining graceful FORGE fallback.
- Updated focused tests to validate against envelope + contract-correct request shapes.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/scoring/__tests__/scoringServiceClient.test.ts server/routes/__tests__/playerIdentityRoutes.test.ts server/routes/__tests__/rankingsV2Routes.test.ts client/src/__tests__/scoringSnapshotCard.test.ts` ✅
  - `npm run build` ✅ (pre-existing duplicate class member warning in `server/olc/adjusters.ts`)

### 2026-04-12 — Codex: PR123 semantic mapper-depth follow-up
- Implemented real scoring-input mapping from TIBER data (`weekly_stats`, `player_usage`) so scoring requests now include meaningful opportunity/stat signals:
  - `games_sampled`, `routes_pg`, `targets_pg`, `carries_pg`, `fantasy_points_ppr_pg`, `snap_share`, `target_share`, `volatility_index`.
- Added async mapper functions:
  - `buildScoringPlayerInputFromData(...)` for player-page weekly/ROS scoring calls.
  - `buildRankingsScoringInputs(...)` for rankings scoring payload construction.
  - `hasMeaningfulScoringInputs(...)` for gating scoring preference.
- Updated Rankings v2 route to **not** prefer scoring when mapped inputs are too thin; falls back to FORGE in that case.
- Updated compare normalization to preserve structured view model (`verdict`, `playerA`, `playerB`, nested `deltas`) instead of flattening.
- Extended tests to assert scoring calls now carry real mapped fields and to prove rankings skips scoring preference when inputs are not meaningful.
- Validation:
  - `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/scoring/__tests__/scoringServiceClient.test.ts server/routes/__tests__/playerIdentityRoutes.test.ts server/routes/__tests__/rankingsV2Routes.test.ts client/src/__tests__/scoringSnapshotCard.test.ts` ✅
  - `npm run build` ✅ (pre-existing duplicate class member warning in `server/olc/adjusters.ts`)

### 2026-05-10 — Codex: Stress Lab followup routing precision
- Split broad transaction/teamstate followup detection into explicit transaction cues and Teamstate environment cues.
- Added regression coverage proving rookie/prospect notes keep rookie followups while excluding unrelated transaction and QB/environment guidance, and Jets teamstate notes retain those followups.
- Validation:
  - `npm run test -- client/src/__tests__/stressLab.test.ts` ✅
  - `npm run typecheck` ⚠️ (fails on pre-existing unrelated TypeScript errors in broader repo)
  - `git diff --check` ✅

### 2026-05-10 — Stress Lab capability matrix docs
- Added `docs/stress-lab-capability-matrix.md` as a read-only inventory of Stress Lab capabilities, routing coverage, limitations, failure modes, future artifact targets, ownership boundaries, known gaps, and design philosophy.
- Added a lightweight README link from the Stress Lab feature blurb.
- Validation: `git diff --check`.

### 2026-05-10 — TIBER Observatory UI reset
- Replaced the default homepage route with the existing note-inspection workflow, now branded as TIBER Observatory.
- Added real-system status cards and repo-boundary awareness copy emphasizing read-only routing, uncertainty, and upstream ownership.
- Reduced primary navigation to Observatory, live Rankings, Rookie Board, and reference docs while preserving hidden compatibility routes.
- Validation: `npm run test -- client/src/__tests__/stressLab.test.ts` ✅; `npm run build` ✅ with existing duplicate class-member warning; `npm run typecheck` ⚠️ pre-existing unrelated errors; Vite route smoke checks ✅.

### 2026-05-10 — Observatory on/off split heuristic extraction
- Added deterministic on/off EPA split heuristics for 49ers/Vikings examples, including conservative team/player aliases, metric scaffolds, signal tags, followups, and uncertainty guardrails.
- Updated handoff labeling to TIBER-Fantasy / Observatory and added artifact scaffolds for on/off, team efficiency, offensive environment, and player fantasy signals.
- Validation:
  - `npm run test -- client/src/__tests__/stressLab.test.ts` ✅
  - `npm run typecheck` ⚠️ pre-existing unrelated TypeScript errors remain in broader repo
  - `git diff --check` ✅

### 2026-05-10 — Observatory RB role/market heuristic extraction
- Added deterministic v0 Stress Lab/Observatory heuristic coverage for the RJ Harvey dynasty RB operator note: RJ Harvey/Denver detection, fantasy RB role/receiving/third-down/committee/market/FORGE/coaching-trust tags and metric scaffolds, conservative handoff artifact requirements, followups, and uncertainty guardrails.
- Kept Sean Payton as a cue only via tags/metrics because the current entity contract supports only player/team/division/season.
- Validation:
  - `npm test -- --runTestsByPath client/src/__tests__/stressLab.test.ts` ✅
  - `npm run typecheck` ⚠️ pre-existing unrelated TypeScript errors remain in broader repo

### 2026-05-24 — TIBER-Data player ownership consumer for Player Research
- Added `server/modules/externalModels/playerOwnership/` with client/adapter/service boundaries for read-only `player_ownership_v0` latest-state artifacts and optional event JSONL lookup.
- Mounted `GET /api/data-lab/player-ownership` and wired ownership truth into Player Research response/UI so roster-truth context appears before fantasy model interpretation.
- Covered known player, unknown player, malformed/missing artifact, duplicate/ambiguous name, missing events directory, and route validation behavior.
- Validation:
  - Focused Jest suites for ownership service/route, Player Research service/route, and Player Research UI/summary block: passed
  - Live `tsx` smoke against sibling TIBER-Data artifact for Tee Higgins: passed
  - `npm run typecheck`: still fails on pre-existing repo-wide errors outside the touched ownership/Player Research files
  - `npm run build`: blocked by Windows/esbuild entry-path/access resolution before application code bundling

### 2026-05-29 — Active docs AGI/lore language cleanup
- Rewrote `TIBER-ARCHITECTURE-PERMANENT.md` as the active grounded product architecture record: decision support, interaction-depth modes, upstream consumer boundaries, uncertainty rules, and archived/non-operational treatment for old philosophical framing.
- Added product-doctrine notes to active onboarding/phase docs and removed/renamed legacy phrasing in nearby operating docs (`autopilot`, `consciousness` prompt/module descriptions, River-layer map wording).
- Quarantined `docs/letter-to-ai-agents.md` as historical/non-operational and kept the human-in-the-loop doctrine explicit.
- Validation:
  - Targeted legacy-term `rg` searches before/after ✅
  - `git diff --check` ✅
  - Markdown-only diff check ✅

### 2026-05-30 — TIBER Management Dashboard shell
- Added `/management` and `/team-management` as the first roster-management dashboard shell.
- Promoted a primary nav `Management` entry and wired dashboard sections for sync, active context, roster snapshot, diagnosis, model signals, action queue, and deep links.
- Preserved upstream boundaries: no new model contracts, no scoring/ranking/trade/projection changes, and Teamstate movement remains read-only context only.
- Validation: `npx vite build` ✅; `npm run build` ✅ with existing duplicate class-member warning; targeted league route tests with `--coverage=false` ✅; `npm run typecheck` ⚠️ existing repo-wide errors; screenshot blocked by missing `DATABASE_URL`.

### 2026-05-31 — Management Teamstate readiness truth patch
- Replaced hardcoded Teamstate Movement `ready` state with a focused live read of `/api/data-lab/team-environment-movement`.
- Added conservative readiness helpers and focused tests: ready requires `ok`, `artifactAvailable`, and usable movement context; missing, malformed/error, and present-but-empty states remain unavailable and inspectable.
- Rendered provenance status, upstream warnings, and returned error copy in the read-only model card without using Teamstate in diagnosis or advice.
- Validation: focused Teamstate helper/API and league route Jest suites ✅; `npx vite build` ✅; `npm run build` ✅ with existing warning; `git diff --check` ✅; `npm run typecheck` ⚠️ existing repo-wide failures outside touched files.

### 2026-06-02 — Management Rookie Alpha promoted-artifact fallback
- **Summary:** Wired Management roster rows and Team Direction evidence coverage to the existing read-only TIBER-Rookies promoted adapter when FORGE remains unavailable. Added additive UI context and operator docs for the `exports/promoted/rookie-alpha` lane.
- **Key Files:** `server/services/leagueDashboardService.ts`, `server/services/teamDirectionClassifier.ts`, `server/modules/externalModels/rookies/`, `client/src/pages/TiberManagementDashboard.tsx`, `docs/runbooks/ROOKIE_PROMOTED_HANDOFF.md`
- **Validation:** Targeted Jest suites, build, typecheck review, diff check.


### 2026-06-02 — Management Rookie Alpha FORGE-gate review fix
- **Summary:** Split Management evidence coverage from FORGE scoring coverage, required the FORGE coverage threshold before Team Direction classification, changed generic missing-player UI copy to `Unmatched`, and added the sparse-FORGE regression case.
- **Key Files:** `server/services/teamDirectionClassifier.ts`, `client/src/pages/TiberManagementDashboard.tsx`, `server/routes/__tests__/managementRoutes.test.ts`
- **Validation:** Focused Management/Rookie Jest suite, builds, typecheck review, diff check.

### 2026-06-03 — Management roster coverage diagnostics wording
- **Summary:** Made Management roster coverage auditable by adding explicit visibility states/counts for FORGE scored, Rookie Alpha fallback, known but unscored, unresolved, and evidence coverage. Updated cards/rows to avoid ambiguous `matched` wording and show actual unavailable reasons.
- **Key Files:** `server/services/leagueDashboardService.ts`, `server/services/teamDirectionClassifier.ts`, `client/src/pages/TiberManagementDashboard.tsx`, `client/src/index.css`, `server/services/__tests__/leagueDashboardService.test.ts`, `server/routes/__tests__/managementRoutes.test.ts`
- **Validation:** Focused Management Jest suites ✅; `npm run build` ✅ with existing warning; `npm run typecheck` ⚠️ existing repo-wide failures outside touched files.

### 2026-06-05 — League context raw-row normalization
- **Summary:** Patched `DatabaseStorage` league context methods so raw SQL rows using snake_case columns no longer fail active-team validation or active-context lookup after Sleeper league sync.
- **Key Files:** `server/storage.ts`, `server/__tests__/storageLeagueContext.test.ts`
- **Validation:** Focused storage Jest suite ✅; `npm run typecheck` ⚠️ existing repo-wide failures outside this change.

### 2026-06-05 — Management roster Sleeper identity hydration
- Added a focused roster identity hydration pass in `leagueDashboardService` so Management can resolve active Sleeper roster IDs to explicit `player_identity_map` rows using Sleeper `/players/nfl` metadata.
- Extended the Sleeper client with a typed `getNflPlayers()` method and covered the regression where missing identity-map rows previously rendered as raw IDs/unresolved.
- Preserved explicit unavailable behavior: no metadata means unresolved, and hydrated-but-unscored players remain `known_unscored`/fallback-only rather than receiving fabricated FORGE values.
- Validation:
  - `npm run test -- --runInBand --coverage=false --forceExit server/services/__tests__/leagueDashboardService.test.ts` ✅
  - `git diff --check` ✅
  - `npm run typecheck` ⚠️ pre-existing repo-wide errors outside touched files; filtered touched-file check returned no matches

### 2026-06-05 — Management coverage diagnostics cleanup
- Split Management roster diagnostics into identity coverage, baseline visibility, player-specific FORGE evidence, Rookie Alpha fallback, and evidence coverage.
- Added best-available player-name fallback for resolved roster identities whose stored `fullName` is blank, including generated baseline rows.
- Preserved generated/default FORGE baseline semantics: visible but not counted as player-specific scoring evidence or Team Direction confidence.
- Validation: focused Management Jest suites ✅; `npm run build` ✅ with existing duplicate class-member warning; `npm run typecheck` ⚠️ existing repo-wide failures outside touched files; `git diff --check` ✅.

### 2026-06-09 — Management identity seed export
- Added a Management diagnostics export that builds a full active-roster `TIBER_MANAGEMENT_IDENTITY_SEED_REPORT` with Sleeper IDs, provider canonical IDs, current crosswalk status, FORGE status, and recommended TIBER-Data review actions.
- Extended league dashboard roster rows with existing provider/crosswalk fields without changing scoring, Team Direction thresholds, or FORGE matching semantics.
- Added targeted Jest coverage for the 30-player, 3 matched / 27 missing seed-report case.

### 2026-06-09 — Management identity diagnostics label correction
- Removed the `resolvedCanonicalCount` fallback from the active-roster “Sleeper roster identity resolved” card.
- Added separate diagnostics labels for canonical IDs checked and resolved identity rows scanned.
- Updated the seed report test fixture to use Puka Nacua sleeper ID `9493`.

### 2026-06-10 — Management strategy template eligibility diagnostics
- Added read-only strategy template readiness diagnostics sourced from the validated DYNASTY_STRATEGY_ONTOLOGY_V1 artifact.
- Exposed sanitized template summaries from the dashboard service and emitted `strategy_template_diagnostics` plus `forgeDiagnostics.strategyTemplateDiagnostics` from the Management Team Direction endpoint.
- Preserved disabled template selection, null selected template, unchanged classification output, no template text rendering, and no archetype/player inference.
- Validation: targeted Jest suites passed; `git diff --check` passed; full typecheck remains blocked by existing repo-wide issues outside touched files.

### 2026-06-14 — Phase 3B Strategy Context Management diagnostics
- Added read-only Management Strategy Context model-signal card near Strategy Templates diagnostics.
- Extended targeted Management model-signal tests for present and missing/fail-closed context states.
- Validation: targeted Jest passed, diff check passed, repo typecheck failed on existing unrelated errors outside touched files.

### 2026-08-02 — W6 FORGE G6 Team Direction freshness enforcement
- Added a pure request-time `team_direction_forge_player_static_freshness_v1` receipt sourced only from the artifact root `generated_at`, accepting through 45 elapsed UTC days and rejecting all non-fresh/unknown clock states.
- Passed the same receipt through Team Direction classification, FORGE activation diagnostics, Management presentation, and the agent-readable snapshot export.
- Rejected raw FORGE observations remain inspectable and explicitly labeled; eligible FORGE coverage, scored-position counts, direction influence, and confidence influence are zero.
- Preserved W6 scope: no artifact-byte, scoring-threshold, direction-threshold, G4/#277, FC1/#291, database, auth, or deployment changes.

### 2026-08-03 — Management G6 mounted-receipt expiry review fix
- Added render-time and scheduled `acceptedThrough` enforcement to the Management client, including exact inclusive-boundary behavior, long-timeout chunking, focus/visibility recovery, and one deduplicated authoritative refetch.
- Copy/download and agent-readable snapshots now rebuild against the action clock, preserve the immutable raw receipt, and expose a separately labeled client evaluation while zeroing eligible FORGE coverage after expiry.
- Suppressed cached Alpha rationale, blockers, stale classification failures, and scored-position diagnostics whenever an otherwise accepted receipt becomes locally rejected.
- Validation: six focused Management/FORGE Jest suites passed (133 tests); server and Vite builds passed; diff check passed; repository typecheck retained 505 pre-existing errors with zero touched-file matches.

### 2026-08-05 — Data Lab SQL parameterization
- Bound anonymous Data Lab/xFPTS filter values through Drizzle SQL parameters instead of composing raw query fragments.
- Hardened the dormant legacy Data Lab router alongside the live shared service to prevent a future remount from restoring the unsafe pattern.
- Added compiled-query regressions for the mounted `/usage-agg` call path, player/week filters, and a source guard against interpolated `sql.raw` templates.
- Validation: focused security tests 6/6 passed; build passed with the existing OLC warning; full Jest run executed 850 passing tests while six unrelated baseline suites failed to load; typecheck retained 505 existing errors with zero changed-file matches; diff check passed.

### 2026-08-09 — Observatory human-readable workflow redesign
- Reframed the Observatory as a two-step human workflow: add an observation, then review the route.
- Replaced white result cards with a restrained dark surface and organized the artifact into plain-language detection, required checks, repo handoffs, uncertainty, and advanced details.
- Collapsed architecture, guardrails, provenance, exports, and raw JSON behind disclosures; removed the prefilled note and unmeasured declared-system status badges.
- Preserved the deterministic client-side heuristic, truthful Teamstate live status, explicit unavailable states, export formats, and no-write/no-ranking boundary.
- Validation: focused Observatory Jest suite 22/22 ✅; full production build ✅ with the existing OLC duplicate-member warning; `git diff --check` ✅; repo-wide typecheck ⚠️ existing unrelated backlog, no `StressLab.tsx` error.

### 2026-08-12 — Observatory current-main integration and accessibility hardening
- Integrated current main without dropping the redesign or main's contrast correction.
- Repaired Observatory text, field, and outline-button contrast; preserved semantic hierarchy with the governed dark-shell tokens.
- Cleared stale review output on input/example changes and added semantic headings/live regions.
- Validation: focused Observatory/contrast/outline suites 85/85; deployment-equivalent build passed with baseline warnings; typecheck stayed at 505 baseline diagnostics with no Observatory match; diff check passed.
### 2026-08-09 — Rankings v2 canonical identity boundary corrections
- Resolved ranking producer IDs under explicit GSIS provenance before any canonical lookup, with duplicate and query-outage states that remain visible but never link.
- Bumped Rankings v2 to `v2-canonical-identity-2026-08-09`; server and client schemas now enforce coherent canonical/resolved/unresolved states and equal canonical link keys.
- Added mounted player-route, cache mutation, collision, outage, contract-negotiation, contradictory-render, and composite-row-key regressions.
- Validation: eight focused suites 152/152 with coverage disabled; build passed with the existing OLC warning; reviewed-head typecheck stayed at 505 diagnostics with zero new touched-file errors; diff check passed.
- Operator gate: no database census or production coverage was claimed without `DATABASE_URL`; uniqueness/migration activation still requires an operator-recorded census and cohort review.

### 2026-08-12 — FORGE cache-audit governed Markdown verification
- Added one bounded governed-document tokenizer shared by section discovery and boundaries, with fence/indent/container awareness, ATX and Setext headings, physical escaped-pipe handling, and fail-closed unsupported inline/HTML syntax.
- Manifest-bound checks now cover exact §3 identity, §4.3 declared bounds and observed clamping, and §5.2 summary/top-five disagreement schemas, rows, values, qualitative templates, and total table counts.
- Preserved the frozen cohort and manifest bytes; only the report's blank §3 header became explicit `measure | value`.
- Validation: focused audit Jest suite 190/190; an independent finite replay rejected all 33 prior structural bypass probes and accepted seven inert-code controls; full branch 119 suites/1,240 passing with the same seven baseline suite failures as base (119/1,165); real committed-artifact `--check` passed; build passed with the baseline OLC warning; typecheck stayed identical at 505 diagnostics with no changed-file matches; `git diff --check` passed; frozen cohort/manifest/static bytes stayed unchanged and the cohort digest remained `118c5cc60bc59c6f3b9ca8d35ebcce4cf4e4442adacbb72fa77fd5109204f106`.

### 2026-08-12 — FORGE cache-audit §5.2 narrative binding
- Added a narrow manifest-derived exact-agreement sentence contract for §5.2 and reject any second visible prose claim rooted at `artifacts agree exactly on`.
- Reused the existing bounded governed-document rules; fenced and indented code remain inert, while bounded inline presentation cannot hide a same-root contradiction. No general Markdown or arbitrary-English contradiction parser is claimed.
- Split the governed report sentence into its own paragraph and removed the adjacent redundant ungoverned spread result.
- Validation: focused audit Jest suite 196/196, including reference-link and strikethrough fail-closed regressions; real committed-artifact `--check` passed; `git diff --check` passed; frozen cohort, manifest, and static artifact retained SHA-256 `118c5cc60bc59c6f3b9ca8d35ebcce4cf4e4442adacbb72fa77fd5109204f106`, `8b317b1376ab2ae18f06137730730968efa36f053e43e294b57053f13a58df7a`, and `de0e2c19a7054653c460b9b8597b620d37084b5407d035afb97310c694cd1cf9`.

### 2026-08-12 — FORGE cache-audit rendered narrative boundaries
- Replaced the custom §5.2 prose block scan with pinned Marked GFM tokens while leaving the existing governed section/table tokenizer authoritative and unchanged.
- Paragraphs, headings, tight lists, blockquotes, Setext headings, thematic breaks, and fences now follow rendered block boundaries; code and tables remain inert narrative examples.
- Inline text uses per-token HTML5 decoding for prose and one whole-attribute decode for image alt text, preventing both hidden visible claims and cross-presentation entity invention. Image alt text and strikethrough remain fail-closed as the sole governed sentence.
- Added accumulated adversarial regressions for container boundaries, soft/hard breaks, nested fence exits, tight-list text, entities across inline/image presentation, and image-alt emphasis/link/code/deletion.
- Validation: focused audit 246/246; real `--check`, build, and diff check pass; typecheck remains the exact 505-diagnostic baseline with no audit-file matches; final independent differential replay matched 768 ordinary-inline and 832 image-alt forms against actual Marked/DOM visibility; cohort/manifest/static bytes and hashes unchanged.
- Development-only dependencies are exact-pinned (`marked@15.0.12`, `entities@4.5.0`) with minimal lockfile change. No report, runtime, deployment, readiness, or governed-artifact mutation.

### 2026-08-12 — FORGE static comparison evidence admission
- Added one pure comparison plan that selects only strict raw `player_specific` rows with finite numeric `forge_alpha`, derives the identifier intersection from those rows, and passes that exact collection into the descriptive comparison.
- Baseline/default/unknown/missing/malformed rows remain diagnostic-only and cannot make §5.2 joinable. Duplicate IDs are detected across the entire raw artifact before filtering and fail closed in parity with the promoted adapter.
- Added outcome-level adversarial tests for every non-evidence source, invalid alpha, mixed/intersecting/nonintersecting evidence, and eligible/non-evidence duplicate combinations.
- Validation: focused audit 262/262; full branch 119 suites/1,313 passing with the same seven baseline failures; real `--check`, build, and diff check pass; typecheck remains the 505 baseline with no audit diagnostics; independent final audit clean. Cohort/manifest/report/static bytes remain unchanged.

### 2026-08-12 — FORGE static comparison canonical-ID spelling
- Duplicate detection now keys every raw artifact ID by the same trimmed identity used by the promoted adapter, closing whitespace-only collision bypasses across eligible and non-evidence rows.
- Whitespace-bearing upstream IDs are not normalized into evidence: they are excluded and produce a separate fail-closed blocker, including whitespace-only values.
- Added outcome-level cases for baseline and malformed-alpha twins, lone whitespace evidence, and whitespace-only IDs.
- Validation: focused audit 266/266; full branch 119 suites/1,321 passing with the same seven baseline failures; real `--check`, build, and diff check pass; typecheck remains the 505 baseline with no audit diagnostics; governed artifacts remain byte-identical.

### 2026-08-12 — FORGE static comparison adapter-ID aliases
- Artifact-wide validity and duplicate diagnostics now resolve the adapter's six supported player-ID keys in exact trim-and-skip precedence before evidence filtering.
- Missing/unresolvable IDs fail explicitly; aliases and normalized IDs are never substituted into the evidence comparison, which remains strict raw `player_id` only.
- Added outcome coverage for all aliases, baseline/invalid-alpha twins, precedence, false-duplicate controls, malformed rows, and Unicode whitespace parity; malformed all-static diagnostics no longer crash the audit.
- Validation: audit 294/294 plus adapter 11/11; full branch 119 suites/1,349 passing with the same seven baseline failures; real `--check`, build, baseline typecheck, and diff check pass; governed artifacts remain byte-identical.

### 2026-08-12 — FORGE static comparison row-container parity
- The artifact-level comparison plan now selects the first array under `rows`, `players`, or `data`, matching promoted-adapter precedence exactly; empty selected arrays and absent/invalid containers fail explicitly.
- `auditComparability()` uses that one selected row collection for namespaces, names, baseline diagnostics, strict evidence, intersection, blockers, and descriptive comparison.
- Regressions cover all containers, precedence/fallthrough, terminal empties, invalid roots, malformed rows, ignored lower containers, and alias collisions through alternate containers.
- Validation: audit 311/311 plus adapter 11/11; full branch 119 suites/1,366 passing with the same seven baseline failures; real `--check`, build, baseline typecheck, and diff check pass; governed artifacts remain byte-identical.

### 2026-08-12 — FORGE static comparison runtime-admission parity
- Added one pure contract shared by the promoted runtime client, adapter, and cache audit for root-rows digest verification plus declared artifact ID/version admission.
- The audit now follows runtime order and fails closed before row selection when a present digest is malformed, has no root `rows`, mismatches, cannot canonicalize, or when the adapter would reject the declared ID/version. Digest-free legacy `rows`/`players`/`data` behavior remains unchanged.
- Regressions cover digest syntax/content/root binding, lower-container non-rescue, legacy warning behavior, declaration aliases and precedence, nullish metadata chains, shallow merge order, and the adapter's existing broad v1 spellings.
- Validation: audit 334/334; adapter/client 26/26; full branch 119 suites/1,398 tests with the same seven baseline failures; real `--check`, build, diff check, and frozen hashes pass; typecheck remains the exact 505 baseline with zero touched-file diagnostics; an independent 25,000-case JSON-round-trip differential audit found zero admission mismatches.
### 2026-08-12 — Rankings v2 Rev16 season/cache honesty corrections
- Made resolved phase/default weeks exact, retained newest-cache behavior only for genuinely weekless history, and rejected substituted/mismatched cache rows with explicit-versus-phase-default status honesty.
- Nulled stale and no-forward-target live facts, enforced coherent phase/decision tuples plus the complete zero `no_rankable_source` invariant, and added safe UI copy for rejected-cache responses.
- Validation: five focused suites 225/225; full branch 125 suites/1288 passing with the same seven baseline suite failures as base (125/1245); build passed with the baseline OLC warning; typecheck stayed identical at 505 diagnostics; diff check passed.
- No merge, deployment, readiness change, contract-version bump, or unrelated scope mutation.

### 2026-08-12 — Rankings v2 Rev17 governed ingestion and unavailable-evidence UI corrections
- Added one atomic, phase/calendar-aware evidence season/week resolver for active automated/admin ingestion and monitoring. Preseason, stale calendar, and config mismatch fail closed; January rollover resolves the 2026 football season and Week 17 together. Schedule sync retains a separately typed forward-looking season resolver.
- Removed active UPH/Gold 2025 fallbacks and carried the governed tuple through Bronze, Silver, Gold, and season-fact quality receipts. Source tripwires prevent the active paths from re-importing the legacy 2025 availability helper.
- Corrected the Nightly Buys/Sells summary boundary to carry one target object rather than reversible numeric arguments. Added a separate atomic source-observed target for Sleeper roster events (preseason movement remains attributable to 2026 Week 1), and replaced SeasonService's final wall-year fallback while preserving its Sleeper API and database-observed pairs.
- Gated Data Lab fallback narrative on genuine snapshot availability and derived Tiers research-link season from validated response metadata, omitting it when unknown.
- Validation: final focused replay 17 suites/333 tests plus API smoke 7/7; full branch 134 suites/1,365 passing versus exact-head base 125/1,288 with the same seven failures; build passed with the baseline OLC warning; typecheck stayed exactly 505 diagnostics; diff check passed.
- Explicit archive pairs remain supported; legacy numeric response fields retain rolling compatibility. No merge, deployment, readiness change, database write, or Forecast work.

### 2026-08-12 — NFLfastR completed-archive weekly sync compatibility
- Restored the historical season-only `/api/weekly/sync` contract for the producer-supported 2024 archive with a local immutable Week 18 terminal bound, without widening the live presentation calendar.
- Extracted the existing weekly-sync handler into a thin testable route module and made the route plus `fetchSeasonToDate()` consume the same bound resolver.
- Added service and real HTTP boundary regressions for 2024 Week 18, unknown/future rejection, explicit live-preseason zero elapsed weeks, no-argument preseason fail-closed behavior, January 2026/Week 17 rollover, exact archive pairs, and week-only mismatch rejection.
- Validation: focused ingestion/route/config suites passed 71/71; local curl passed; server build passed with the baseline OLC warning; typecheck stayed at the 505-diagnostic baseline with zero touched-file matches; `git diff --check` passed.

### 2026-08-12 — Bronze-to-Silver season-wide default restoration
- Restored the distinction between a governed default season and an explicitly requested week on `/api/etl/bronze-to-silver`: omitted week stays undefined through the Bronze service query instead of becoming the current evidence week.
- Preserved explicit season-only archive/current processing, exact explicit-week filters, `processAll` limit removal, and preseason/stale fail-closed behavior for omitted targets.
- Audited adjacent ETL routes: weekly writers/computations retain atomic season/week targets, while Bronze status was already season-wide.
- Validation: five focused route/config/service suites passed 69/69; build passed with the baseline OLC warning; typecheck remained 505 diagnostics with the same four pre-existing `etlRoutes.ts` errors and no new test-file diagnostics; diff check passed.

### 2026-08-12 — Automated derived-writer target isolation
- Intelligent Scheduler weekly, incremental, and brand-recompute writers plus all-implicit admin brand streaming now resolve one governed evidence tuple and reuse it for mutations, exact result queries, and receipts; stale SeasonService database observations remain freshness input only.
- Admin replay resolves before force deletion: matching current season-only requests use the governed week, mismatched half-pairs return 400, and explicit archive pairs remain exact. Governed the active RB-context derived writer and write-capable brand week-rollover path as well.
- Preserved source-observed SeasonService behavior for non-writer freshness/status consumers.
- Validation: seven focused suites passed 86/86; full branch passed 141 suites/1,416 tests with the same seven baseline failures; build passed with the baseline OLC warning; typecheck stayed at 505 baseline diagnostics with no new touched-file diagnostics; `git diff --check` passed.

### 2026-08-12 — FORGE cache-audit Rankings v2 week-metadata alignment
- The live-response guard now parses one anchored, closed current FORGE source-note grammar and requires `decisionTargetWeek` and `cacheDeclaredAsOfWeek` to independently match the audit's requested Week 18 before rows are admitted.
- It also requires the exact two-entry cache/confidence source stack, a closed current fallback-reason value, matching structured decision/evidence season metadata, a nonempty same-position item set, and a canonical ISO observation time.
- The superseded bare `asOfWeek` spelling is rejected rather than treated as compatibility evidence because it cannot prove the cache rows' declared week.
- Regressions cover the current emitted shape, malformed/ambiguous note grammar, independently wrong note/structured scope fields, wrong/additional source layers, missing/empty/mixed-position items, invalid timestamps, and the old note shape.
- Validation: focused audit plus real Rankings route 387/387 (380 + 7); real `--check`, build, and diff check pass; governed artifacts remain byte-identical.

### 2026-08-12 — FORGE cache-audit source-clock evidence gate
- The live observation guard now requires one canonical cache-evidence time repeated exactly by the FORGE source, confidence companion, top-level response, `seasonMeta.generatedAt`, and `trust.asOf`, with cache-`computedAt` freshness copy.
- A valid UI response that synthesized top-level `asOf` because cache `computedAt` was null remains valid at runtime but is deliberately inadmissible as fresh audit evidence.
- Adversarial clock/null/copy tests plus the real route branch pin the distinction.
- Validation: focused audit and route suites 415/415; real `--check`, build, diff, and governed hashes pass unchanged.

### 2026-08-12 — FORGE cache-audit per-item source-clock binding
- Every admitted item must now carry an object `trust` with a canonical `asOf` exactly equal to the primary FORGE cache source clock; indexed errors identify the first invalid row.
- Missing/null/malformed/divergent and mixed-item adversaries fail closed, while the real cache route proves all valid rows bind to the envelope source time.
- The null-`computedAt` route still fails at the envelope clock first even though its items inherit the synthesized response time.
- Validation: focused audit plus route 425/425; real `--check`, build, diff, and governed hashes pass unchanged.

### 2026-08-26 — Public redraft Draft Review pilot
- Added a public, read-only Sleeper roster deep-link flow at `/draft-review` backed by a state-isolated context compiler.
- Preserved observed/derived/Forecast claim separation and excluded stale FFC ADP from the default surface.
- Added an agent-ready JSON context export while keeping Forecast projections explicitly unavailable.
- Validated the exact external-user roster, focused tests, deployment build, and diff hygiene.

### 2026-08-26 — Draft Review public-boundary repair
- Repaired PR #343's five P2s: bounded Sleeper reads, in-flight player-cache dedupe, flex-aware geometry, draft endpoint provenance, and explicit unavailable draft UI.
- Added strict HTTPS roster-link parsing, no-store/sanitized public responses, unnecessary-owner-ID minimization, route rate limiting, and untrusted-display-string guidance in the copied agent packet.
- Validation: focused service/route 6/6; external live roster 15/15; deployment and server builds green; diff clean; no touched-file typecheck diagnostics. Full Jest: 156/162 suites and 2,002/2,002 collected tests, with six unrelated existing suite failures. Dependency audit remains a separate repository backlog (44 advisories); dependencies were untouched.

### 2026-08-27 — Draft Review v0.1 public operator entry
- Added league ID plus exact Sleeper league/draft/roster input resolution and a minimal public roster selector without ownership authentication or shared Management state.
- Added normalized scoring, reserve rules/capacity, exact missing-starter and bench flags, complete-board/timer/native-slot/turn-distance evidence, mobile request-race protection, and explicit unavailable eligibility/bye/Forecast states.
- Hardened IDs, strings, collections, response size, source-error classification, route headers, and the player-directory cache boundary; unref'd the legacy security cleanup timer so focused tests exit.
- Validation: focused 11/11; full Jest 156/162 suites with the same six baseline load failures and 2,007/2,007 collected tests passing; deployment build and diff check pass; no touched-file typecheck diagnostics.

### 2026-08-27 — Draft Review fixture privacy hygiene
- Replaced the live external roster URL in the parser fixture with a synthetic identifier and generalized validation records that retained live external display names or league context.
- Added the Draft Review module rule that tracked fixtures and logs use synthetic or generic roster identifiers rather than live-user display names or league IDs.
- Validation: focused Draft Review service suite 8/8, repository identifier scan clean, and `git diff --check` passed. Runtime behavior is unchanged.
### 2026-08-28 — Public Draft Review containment profile
- Added one explicit `TIBER_RUNTIME_PROFILE=public-draft-review` boundary that never imports or starts the database-backed/private runtime and terminates every non-Draft-Review API request uniformly before lookup or mutation.
- The client reads the server-enforced profile and renders a Draft Review-only shell; profile failure is UI fail-closed, public response bodies are not logged, and unknown configured profiles stop startup.
- Validation: focused security/routing suites 11/11, deployment-equivalent build green, no touched-file typecheck diagnostics, diff clean. No deployment or merge authority was exercised.
- Exact-head review repairs: API GETs—including mixed-case paths that Express treats as API routes—are network-only in the service worker and explicitly bypass browser HTTP caching; service-worker activation deletes the legacy dynamic API cache. This prevents a cached `full` capability or private GET response from surviving a profile change or being replayed during an outage. Static/document caching remains versioned and separate. The public-only shell clears the absent sidebar's desktop offset.

### 2026-09-14 — Sleeper smoke repair
- Diagnosed exact-head CI log: jq array/root scope error, before scoring checks.
- Fixed JSON count comparison and stock-macOS shell portability; added actual-shell regression coverage and CI wiring.
- Validation: 7 shell tests, 8 existing suites / 54 tests, release build and diff check passed. Historical portfolio remains 52 RED / 0 GREEN against legacy Forecast; CCF recommendation certification is separate.
