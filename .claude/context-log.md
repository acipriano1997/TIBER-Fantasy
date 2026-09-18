# Tiber Fantasy — Context Log

Running changelog of significant changes across all agents. Most recent entries at top.
Every agent should append an entry here after completing work.

---

### 2026-09-18 — Codex: FFCC deep-analytics coverage audit and inert prework
- **What changed:** Audited current FFCC analytics against live repository capabilities and the 2025–2026 public football-analytics frontier; separated already-covered/legacy signals from true gaps; defined the high-value receiving, trench, redistribution, role-state, joint-distribution, and decision-utility lanes; added a held-prework evidence vocabulary with point-in-time diagnostic eligibility and no runtime authority; demoted the stale metrics roadmap from automatic scoring authority.
- **Files modified:** `docs/architecture/FFCC_DEEP_ANALYTICS_GAP_AUDIT_2026-09-18.md`, `server/prework_deepAnalyticsEvidenceV1.ts`, `server/__tests__/prework_deepAnalyticsEvidenceV1.test.ts`, `METRICS_ROADMAP.md`, `replit.md`, agent/context logs.
- **Validation:** Focused prework test and held-prework inertness guard are expected PR gates; no runtime imports, scoring weights, recommendation authority, source promotion, or final-holdout access were added.
- **Notes:** Highest-value future lanes are route/coverage + intent, run-scheme/blocking, teammate redistribution, latent role-state detection, and joint outcome/decision utility. Tracking-only fields must not be fabricated from nflverse proxies.

### 2026-08-09 — Codex: Rankings season-honesty review corrections
- **What changed:** Corrected `/tiers` archive labels to use the forward ranking season, added a calendar-specific unavailable state, cleared retained season selection on a mounted stale-calendar transition, keyed that transition separately in React Query, defaulted parameterless postseason rankings to the configured forward season, and restricted stale-calendar explicit queries to configured historical seasons before any cache/scoring read.
- **Files modified:** `client/src/pages/TiberTiers.tsx`, `client/src/pages/tiberTiersV2Mapper.ts`, `server/routes/rankingsV2Routes.ts`, and focused rendered/container/route tests.
- **Validation:** Eight focused suites passed 128/128 with `--coverage=false`; server build passed with the existing OLC duplicate-member warning; typecheck retained the exact 505-diagnostic pre-correction baseline with zero new normalized diagnostics; `git diff --check` passed.
- **Notes:** The mounted container regression exercises the actual hook, query key, URL construction, response validation, and render state. Direct API consumers may still request configured historical seasons while the public mounted page fails closed on stale calendar state.

### 2026-07-31 — Codex: Active Node admin route authentication hardening
- **What changed:** Protected all active Node RAG maintenance routes under `/rag/admin/*` with the existing fail-closed `requireAdminAuth` middleware, required the existing FORGE admin key for `/api/admin/forge/status`, and removed the invalid bare `modules` Python dependency.
- **Files modified:** `server/routes/ragRoutes.ts`, `server/routes/adminForge.ts`, `requirements.txt`, `server/routes/__tests__/ragAdminAuth.test.ts`, `server/routes/__tests__/adminForgeAuth.test.ts`
- **Validation:** Focused admin-auth suites passed 11/11; production server build passed with the existing duplicate `applyAdjusters` warning; repository-wide Jest run passed 105 suites and 796 tests, with six pre-existing suite-load failures; `npm run typecheck` remains blocked by broad pre-existing errors outside the touched files; `git diff --check` passed.
- **Notes:** Rejected RAG ingest tests use no-network sentinels and verify article/index state is unchanged. Public RAG health remains open. Debug week-summary and the inactive legacy Flask RAG server were deliberately untouched.

### 2026-03-24 — Codex: Production root now serves frontend SPA shell
- **What changed:** Updated `server/index.ts` production root handling so `GET /` serves `dist/public/index.html` when available, retained `GET /health` JSON health checks, and added an explicit safe JSON fallback when static assets are missing. Added reusable `mountProductionFrontend` helper for production static + SPA fallback wiring.
- **Files modified:** `server/index.ts`, `server/__tests__/productionRootRouting.test.ts`, `README.md`, `replit.md`, `.claude/context-log.md`, `.claude/agents/codex.md`
- **Validation:** Ran focused Jest suite for production routing behavior and confirmed health JSON, root frontend serving, API route preservation, and SPA fallback behavior.
- **Notes:** Change is routing-only; bootstrap path, API mounting, and DB/model logic remain untouched.

### 2026-02-22 — Replit Agent: QB FIRE Support + Snap% Fix + Column Cleanup
- **What changed:** Added full QB support to Fantasy Lab FIRE system. Backend: extended FIRE API with QB per-game stats (passAtt/G, comp%, passY/G, passTD/G, INT/G, rushAtt/G, rushY/G, rushTD/G) computed from silver_player_weekly_stats rolling window. Frontend: added QB to position selector, built position-aware column system (QB-specific columns auto-swap, Conversion column hidden for QB since it's null). Fixed Snap% bug (was dividing by total player-snaps instead of team offensive plays; added `team_off_plays = MAX(snaps)` to `team_weekly_totals_mv`). Cleaned column labels (Opp→Opportunity, Conv→Conversion, FPG→Fantasy PPG, etc).
- **Files modified:** `server/routes/fireRoutes.ts` (WeeklyPlayerStatRow extended, QB stats aggregation, FirePlayer.stats extended), `client/src/pages/FantasyLab.tsx` (Position type, column defs, position selector), `team_weekly_totals_mv` (added team_off_plays column), `replit.md`, `.claude/context-log.md`, `.claude/agents/replit-agent.md`, `server/modules/fantasyLab/README.md`
- **Validation:** API returns QB FIRE data with correct per-game stats. Snap% now shows 60-85% for starters (was 3-8%). E2E test passed.
- **Notes:** QB Conversion pillar still pending — FIRE uses 2-pillar scoring for QB (75% Opportunity + 25% Role). Column system uses `positions?: Position[]` field to control visibility per position.

### 2026-02-17 — Replit Agent: FORGE Pillar Weight Tuning & Calibration Fix
- **What changed:** Recalibrated FORGE redraft pillar weights based on PPG↔pillar correlation analysis. Updated calibration percentile anchors (p10/p90) to reduce ceiling compression. Key findings: RB stability (-0.668 corr) and TE stability (-0.786 corr) are anti-signals; WR stability (+0.801 corr) is positive. QB team context (0.661 corr) was strongest single QB predictor.
- **Files modified:** `server/modules/forge/forgeGrading.ts` (weights + dynasty weights), `server/modules/forge/types.ts` (calibration params), `.claude/tasks/pillar-weight-tuning.md` (research doc with resolution), `replit.md`
- **Validation:** Full recompute of 357 players. RB T1 count: 17→8 (within 5-8 target). Spearman rank correlations: RB 0.943, TE 0.939, WR 0.908, QB 0.623. CMC now tops RB rankings at 91.6 (was tied at 95.0 with Irving/JT).
- **Notes:** Remaining Bucky Irving inversion (91.2, 13.8 PPG) is a Volume pillar design issue — Volume measures opportunity count, not per-play production. Future work: redesign Volume and Stability pillar formulas.

### 2026-02-16 — Replit Agent: Quality Sentinel Dashboard UI
- **What changed:** Built the Quality Sentinel Dashboard frontend at `/sentinel` with health overview cards, module breakdown, interactive Test Lab (12 pre-built scenarios across forge/personnel/datalab/system modules), issues panel with filtering and muting, and event feed with expandable details. Added sentinel to sidebar under System section with NEW badge. Also completed backend integration: added sentinel schema tables to `shared/schema.ts`, integrated sentinel checks into FORGE score and batch endpoints, mounted sentinel routes.
- **Files modified:** `client/src/pages/SentinelDashboard.tsx` (new), `client/src/App.tsx`, `client/src/components/TiberLayout.tsx`, `shared/schema.ts`, `server/modules/forge/routes.ts`
- **Validation:** All sentinel API endpoints tested via curl - health, issues, events, run/forge, run/datalab, run/system all return correct responses. Rules correctly flag out-of-bounds alpha, NaN values, tier mismatches, empty batches, zero snaps, invalid classifications, missing snapshots, and missing response keys.
- **Notes:** Test Lab lets you inject manipulated data and see sentinel flags in real time. Uses project conventions: ember accent (#e2640d), JetBrains Mono for data, default query fetcher pattern.

### 2026-02-16 — Replit Agent: Quality Sentinel Task Spec for Codex
- **What changed:** Created comprehensive Codex task spec for the Quality Sentinel validation layer. Covers rule engine architecture, 16 initial rules across FORGE/Personnel/DataLab/System modules, sentinel_events DB schema, 5 API endpoints, inline integration pattern, and detailed validation criteria with curl commands.
- **Files modified:** `.claude/tasks/build-quality-sentinel.md` (new)
- **Validation:** Spec reviewed for consistency with existing FORGE types, personnel service patterns, and route registration conventions.
- **Notes:** Backend-only scope — frontend admin dashboard and UI badges deferred to Replit Agent as follow-up. Based on deep research report analyzing Great Expectations, Monte Carlo, Datadog, and Sentry patterns. Designed for Codex's PR-based workflow on branch `codex/build-quality-sentinel`.

### 2026-02-16 — Claude Code: Fix Personnel Usage Under-Counting
- **What changed:** Rewrote personnel module to use nflverse `pbp_participation` data instead of only counting primary actors (passer/rusher/receiver). Added `bronze_pbp_participation` table and Python ingest script. Updated frontend labels from "plays" to "snaps".
- **Files modified:** `shared/schema.ts`, `server/modules/personnel/personnelService.ts`, `server/scripts/import_pbp_participation.py` (new), `client/src/pages/PersonnelUsage.tsx`, `server/modules/personnel/MODULE.md`
- **Validation:** Nacua 869 snaps (was 224), Hunter 303 snaps (was 46), top-5 WRs all 800+. All validation criteria passed.
- **Notes:** Task spec at `.claude/tasks/fix-personnel-undercounting.md` has full resolution details. Nacua 869 vs PFR 727 gap is methodology difference (acceptable).

### 2026-02-16 — Replit Agent: Create Personnel Usage Task Spec
- **What changed:** Created enhanced task spec for the personnel undercounting bug with full agent onboarding context, root cause SQL diagnostics, solution paths, and validation criteria.
- **Files modified:** `.claude/tasks/fix-personnel-undercounting.md` (new)
- **Validation:** Spec confirmed root cause via SQL queries showing Nacua 224 primary-actor plays vs 727 PFR snaps.
- **Notes:** This was the first task spec in the `.claude/tasks/` system. Designed as a template for future specs.

### 2026-02-15 — Replit Agent: Build Personnel Usage Page
- **What changed:** Built frontend page at `/personnel` with position tabs, search, sort, expandable player cards, colored personnel breakdown bars, and classification badges. Added SQL-optimized backend aggregation. Added sidebar nav entry with "NEW" badge.
- **Files modified:** `client/src/pages/PersonnelUsage.tsx` (new), `client/src/index.css` (CSS additions), `client/src/App.tsx` (route), `client/src/components/TiberLayout.tsx` (nav), `server/modules/personnel/personnelService.ts` (SQL rewrite)
- **Validation:** API verified via curl returning proper data. Architect review passed.
- **Notes:** Initial version used primary-actor counting (later fixed by Claude Code above).

### 2026-02-15 — Codex: Add NFL Personnel Grouping Visibility (PR #11)
- **What changed:** Created personnel module infrastructure — service, classifier, routes, backfill script. Added `offense_personnel`, `defense_personnel`, `offense_formation` columns to `bronze_nflfastr_plays`. Backfilled 45,184 plays with personnel data from nflverse pbp_participation parquet.
- **Files modified:** `server/modules/personnel/personnelService.ts` (new), `server/modules/personnel/personnelClassifier.ts` (new), `server/routes/personnelRoutes.ts` (new), `server/scripts/backfillPersonnel.ts` (new), `shared/schema.ts` (3 columns added)
- **Validation:** 92.6% personnel data coverage across 2025 plays.
- **Notes:** Branch: `codex/add-nfl-personnel-grouping-visibility`. Merged via PR #11.

### 2026-02-15 — Replit Agent: Module Documentation & Architecture Updates
- **What changed:** Added MODULE.md files and updated architecture documentation.
- **Files modified:** Various MODULE.md files, `replit.md`
- **Validation:** Documentation review.

### 2026-02-14 — Replit Agent: Project Architecture Documentation
- **What changed:** Added comprehensive project architecture and module documentation.
- **Files modified:** Architecture docs, module docs
- **Validation:** Documentation review.

### 2026-02-13 — Replit Agent: FORGE Workbench
- **What changed:** Built interactive FORGE workbench at `/forge-workbench` for exploring player engine internals — search, pillar breakdowns, weight sliders, mode toggle.
- **Files modified:** `client/src/pages/ForgeWorkbench.tsx` (new), route/nav registration
- **Validation:** End-to-end testing.

### 2026-02-13 — Replit Agent: Metrics Dictionary
- **What changed:** Built detailed metrics dictionary page for browsing all NFL data point definitions.
- **Files modified:** `client/src/pages/MetricsDictionary.tsx` (new), route/nav registration
- **Validation:** End-to-end testing.

### 2026-02-12 — Replit Agent: System Architecture Diagram
- **What changed:** Built interactive system architecture visualization page.
- **Files modified:** Architecture page files, route/nav registration
- **Validation:** Visual verification.

### 2026-02-11 — Replit Agent: X Intelligence Scanner
- **What changed:** Built Grok-powered X/Twitter scanning for fantasy football trends, injuries, breakouts. Created scan types, endpoints, and frontend page.
- **Files modified:** `server/services/xIntelligenceScanner.ts`, `client/src/pages/XIntelligence.tsx`, route registration
- **Validation:** End-to-end testing with Grok integration.

### 2026-02-11 — Replit Agent: LLM Gateway
- **What changed:** Built provider-agnostic LLM gateway with automatic fallback across 4 providers (OpenRouter, OpenAI, Anthropic, Gemini). Task-based routing with 9 task types.
- **Files modified:** `server/llm/` directory (types, config, logger, fallback, providers, index)
- **Validation:** Multi-provider fallback testing.

### 2026-02-10 — Replit Agent: v2 Light Mode Redesign
- **What changed:** Complete UI redesign from dark to light mode. New design system with ember accent, three-font system, fixed sidebar layout.
- **Files modified:** `client/src/index.css`, `client/src/components/TiberLayout.tsx`, multiple page files
- **Validation:** Visual verification across all pages.

### Earlier History (Pre-2026-02-10)

#### Codex Contributions (via GitHub PRs)
- **PR #9** (2025-12-28): NFLfastR inventory audit
- **PR #8** (2025-12-16): FORGE scoring audit and playbook sync
- **PR #7** (2025-12-16): UI/UX cleanup for homepage redesign
- **PR #6** (2025-12-14): Sleeper sync and league overview
- **PR #5** (2025-12-13): Sleeper league sync v1
- **PR #4** (2025-12-11): Command hub and journal analysis
- **PR #3** (2025-12-10): Remove legacy Oasis/OTC naming
- **PR #2** (2025-12-10): Replace OTC/Oasis/Hardening with Tiber/TrackStar
- **PR #1** (2025-12-09): Internal documentation for FORGE scoring system

### 2026-02-16 — Codex: FORGE tiers cache migration
- **What changed:** Added precomputed `forge_grade_cache` schema, implemented `forgeGradeCache` service for compute+upsert+read, added `/api/forge/tiers` and `/api/forge/compute-grades` endpoints, and migrated `/tiers` UI to consume cached FORGE Alpha/tier data with fallback messaging.
- **Files modified:** `shared/schema.ts`, `server/modules/forge/forgeGradeCache.ts`, `server/modules/forge/routes.ts`, `client/src/pages/TiberTiers.tsx`
- **Validation:** Ran build, attempted db push + tests + dev server (blocked by missing `DATABASE_URL`), verified route and schema wiring via source inspection.
- **Notes:** Admin endpoint expects `FORGE_ADMIN_KEY`; cache version defaults to `v1`; frontend now treats cache-empty responses as compute-in-progress.

### 2026-02-17 — Codex: FORGE snapshot data quality guardrails
- **What changed:** Added a new snapshot validator module with row-level guardrails (null/anomalous snap share handling, ghost/inactive row drops, and outlier warnings), and integrated it into FORGE xFP volume, role consistency ingestion, and context snapshot week counting.
- **Files modified:** `server/modules/forge/snapshotDataValidator.ts`, `server/modules/forge/xfpVolumePillar.ts`, `server/modules/forge/roleConsistencyPillar.ts`, `server/modules/forge/forgeEngine.ts`, `server/modules/forge/__tests__/snapshotDataValidator.test.ts`
- **Validation:** Ran focused validator unit tests (pass), attempted existing FORGE test suite (blocked by missing `DATABASE_URL`).
- **Notes:** Validator emits summary logs per player and detailed warnings only when fewer than 5 clean weeks remain.

### 2026-02-17 — Codex: FORGE end-to-end integration test coverage
- **What changed:** Added full FORGE integration test suite covering batch sanity, pinned player ranking guards, cross-position calibration checks, mode consistency, and stability regression protections using live DB reads and real E+G pipeline functions.
- **Files modified:** `server/modules/forge/__tests__/forgeIntegration.test.ts`
- **Validation:** Attempted targeted Jest run; blocked in this container because `DATABASE_URL` is not set.
- **Notes:** Test resolves canonical player IDs from `player_identity_map` dynamically to avoid brittle slug assumptions.

### 2026-02-17 — Codex: FORGE QB volume switched to continuous xFP
- **What changed:** Replaced QB volume pillar's role-bank blend with derived `xfp_per_game` (weight 1.0) to remove quantized bucket effects, and calibrated QB xFP normalization bounds for better spread with less clipping.
- **Files modified:** `server/modules/forge/forgeEngine.ts`, `server/services/xFptsConfig.ts`
- **Validation:** Ran TypeScript/Jest FORGE integration suite command (blocked by missing `DATABASE_URL`), then ran full production build successfully.
- **Notes:** QB xFP coefficients remain at dropback=0.50 and rushAttempt=0.65; documented sanity outputs (elite ~20.75, average ~16.95).

### 2026-02-17 — Codex: FORGE FPOE-based efficiency pillar decomposition
- **What changed:** Replaced volume-correlated role-bank efficiency mixes with FPOE-first efficiency pillar configs across WR/RB/TE/QB so volume (xFP/G) and efficiency (FPOE/G) are complementary. Kept QB EPA/CPOE/sack-rate components as secondary passing-efficiency context and documented that current FPOE normalization remains `[-5, +10]` pending DB-backed percentile validation.
- **Files modified:** `server/modules/forge/forgeEngine.ts`
- **Validation:** Ran `npm test -- server/modules/forge/__tests__/snapshotDataValidator.test.ts` (pass) and `npm run build` (pass, pre-existing duplicate-class-member warning in `server/olc/adjusters.ts`).
- **Notes:** Could not run the requested SQL distribution check because this container has no `DATABASE_URL`; normalization range should be revisited once DB access is available.

### 2026-02-18 — Codex: Fantasy Lab Phase 1 weekly data foundation
- **What changed:** Added `fantasy_metrics_weekly_mv` materialized view migration consolidating DataDive weekly usage, xFP v2, and latest market context; implemented `/api/fantasy-lab/weekly`, `/api/fantasy-lab/player`, and admin refresh endpoint `/api/admin/fantasy-lab/refresh`; added Fantasy Lab QA sanity script and backend module documentation.
- **Files modified:** `migrations/0011_fantasy_lab_weekly_mv.sql`, `server/routes/fantasyLabRoutes.ts`, `server/routes.ts`, `server/scripts/qaFantasyLabPhase1.ts`, `server/modules/fantasyLab/README.md`, `package.json`
- **Validation:** Ran `npm run build` (pass with pre-existing warning), attempted `npm run typecheck` (repo-wide pre-existing errors), attempted `npm run qa:fantasy-lab -- 2025 1` (DB unavailable in container: ECONNREFUSED).
- **Notes:** Materialized view uses latest snapshot per season/week and latest-known market signals/facts; xFP surfaced as `x_ppr_v2` + `xfpgoe_ppr_v2`; half/std xFP currently null placeholders pending source availability.

### 2026-02-19 — Codex: Fantasy Lab Phase 2 FIRE + Delta + UI
- **What changed:** Added compute-on-demand FIRE API for RB/WR/TE (`/api/fire/eg/batch`, `/api/fire/eg/player`) using rolling 4-week windows, position-specific snap eligibility, percentile-normalized pillars, and RoleIndex fallback logic. Added Hybrid Delta API (`/api/delta/eg/batch`) joining FORGE alpha and FIRE with percentile display delta + z-score rank delta and BUY_LOW/SELL_HIGH labeling. Added a minimal `/fantasy-lab` page with season/week/position/view controls, FIRE table, DELTA table, and explicit QB gap notice.
- **Files modified:** `server/routes/fireRoutes.ts`, `server/routes.ts`, `client/src/pages/FantasyLab.tsx`, `client/src/App.tsx`, `client/src/components/TiberLayout.tsx`
- **Validation:** `npm run build` passed (existing unrelated duplicate member warning in `server/olc/adjusters.ts`). Attempted `npm run dev` for UI verification/screenshot, blocked due missing `DATABASE_URL`.
- **Notes:** QB FIRE remains excluded by design; endpoints include metadata notes/thresholds and role fallback metadata.

### 2026-02-20 — Codex: QB FIRE v1 opportunity + role integration
- **What changed:** Added QB xFP v1 data model and migration (`qb_xfp_weekly`), created bucket-smoothed QB xFP ETL script, expanded Fantasy Lab MV with QB xFP/role fields, enabled QB in FIRE with scoring presets (`redraft|dynasty`) and QB-specific eligibility/role scoring (Opportunity + Role only), and documented data audit + validation runbook reports.
- **Files modified:** `migrations/0012_qb_fire_v1.sql`, `scripts/etl/qb_xfp_weekly.py`, `server/routes/fireRoutes.ts`, `server/routes/fantasyLabRoutes.ts`, `package.json`, `reports/qb_fire_v1_data_audit.md`, `reports/qb_fire_v1_validation.md`
- **Validation:** Ran build successfully; DB-backed ETL/API validation commands are documented but blocked because `DATABASE_URL` is not set in this container.
- **Notes:** DELTA remains RB/WR/TE-only by design until QB conversion/FPOE lands in v1.1.

### 2026-02-23 — Codex: FORGE IDP Phase 1 scaffold + routing integration
- **What changed:** Added initial IDP ingestion/baseline/engine modules, extended FORGE E+G position typing to include defensive groups, added defensive branch in `runForgeEngine` + `runForgeEngineBatch`, and mounted admin IDP routes (`/api/admin/idp/ingest`, `/baselines`, `/status`).
- **Files modified:** `shared/idpSchema.ts`, `server/modules/forge/forgeEngine.ts`, `server/modules/forge/forgeGrading.ts`, `server/modules/forge/forgeGradeCache.ts`, `server/modules/forge/routes.ts`, `server/routes/idpAdminRoutes.ts`, `server/routes.ts`, `server/modules/forge/idp/*`, plus offensive-helper typing updates in `roleConsistencyPillar.ts`, `xfpVolumePillar.ts`, and `snapshotDataValidator.ts`.
- **Validation:** Ran `npx tsc --noEmit` and a targeted `npx tsc --noEmit ...` command; both are currently blocked by broad pre-existing repository/type dependency issues.
- **Notes:** IDP tables are queried via raw SQL because current Drizzle schema does not expose `idp_*` models yet.

### 2026-02-24 — Codex: Phase 0 CATALYST PBP enrichment plumbing
- **What changed:** Added `wp` + `score_differential` columns to Bronze NFLfastR schema, created migration/backfill SQL to populate from `raw_data`, updated NFLfastR import scripts (2024/2025 bulk + fast import) to persist both fields at ingest time, and added a dedicated DB validation script for coverage/range/spot-check queries.
- **Files modified:** `shared/schema.ts`, `migrations/0013_catalyst_pbp_enrichment.sql`, `server/scripts/import_nflfastr_2024_bulk.py`, `server/scripts/import_nflfastr_2025_bulk.py`, `server/scripts/fast_nflfastr_import.py`, `server/scripts/validate_catalyst_pbp_enrichment.py`
- **Validation:** `python -m py_compile ...` passed for updated scripts; `npm run build` passed (existing warning in `server/olc/adjusters.ts`).
- **Notes:** Could not execute DB-backed enrichment validation because this container does not provide `DATABASE_URL`; run `server/scripts/validate_catalyst_pbp_enrichment.py` in a DB-enabled environment after applying migration.

### 2026-03-02 — Codex: Add rookie profiles schema + seed script
- **What changed:** Added `rookie_profiles` Drizzle table to `shared/schema.ts` and created `scripts/seed-rookie-profiles.ts` to merge combine + grade JSON inputs on player name and insert 91 merged rows.
- **Files modified:** `shared/schema.ts`, `scripts/seed-rookie-profiles.ts`
- **Validation:** Ran `npm run db:push` (blocked by missing `DATABASE_URL` in this environment).
- **Notes:** Seed script expects `data/rookies/2026_combine_results.json` and `data/rookies/2026_rookie_grades.json` to exist and enforces exactly 91 merged rows.

### 2026-03-06 — Codex: Canonical v1 trade analyze endpoint + compare semantic cleanup
- **What changed:** Extended canonical comparison route semantics to accept either `player_a/player_b` or legacy-style `player1/player2` aliases while preserving canonical output. Added new `POST /api/v1/intelligence/trade/analyze` route in v1 API that accepts canonical `side_a/side_b` (plus compatibility aliases `teamA/teamB`) and returns canonical `TradeAnalysisResponse` via a new mapper adapter. Reused existing `evaluateTradePackage` service without introducing new football logic.
- **Files modified:** `server/api/v1/routes.ts`, `server/api/v1/mappers/toTradeAnalysisResponse.ts`
- **Validation:** Ran `npm run typecheck` (fails due broad pre-existing repo TypeScript issues), `npm test` (partial pass; failures include DB-dependent tests due missing `DATABASE_URL` plus existing suite failures), and targeted `npx tsc --noEmit server/api/v1/routes.ts server/api/v1/mappers/toTradeAnalysisResponse.ts` (fails from existing global typing/dependency conflicts).
- **Notes:** Legacy trade surfaces remain untouched; this is additive via `/api/v1/intelligence/trade/analyze`.

### 2026-03-20 — Codex: External model adapter layer for role opportunity
- **What changed:** Added a dedicated external model adapter layer for promoted lab integrations, implemented the first `Role-and-opportunity-model` client/adapter/service stack with canonical edge validation and typed failure mapping, and exposed a contained integration endpoint plus readiness/config status route.
- **Files modified:** `server/modules/externalModels/**`, `server/routes/roleOpportunityIntegrationRoutes.ts`, `server/routes.ts`, `README.md`, `replit.md`, `.claude/conventions.md`
- **Validation:** Ran targeted Jest suites for the adapter/service and integration route, built the production bundle, and smoke-tested the readiness endpoint with curl against a minimal Express app.
- **Notes:** The adapter normalizes share-style metrics into 0..1 decimals for TIBER-facing output while preserving optional raw canonical payloads for debugging.

### 2026-03-20 — Codex: Player detail role opportunity enrichment
- **What changed:** Added opt-in role-opportunity enrichment to `GET /api/player-identity/player/:id`, introduced a failure-tolerant player-detail insight envelope helper, added focused route/enrichment tests, and documented the response contract plus non-fatal behavior.
- **Files modified:** `server/routes/playerIdentityRoutes.ts`, `server/modules/externalModels/roleOpportunity/playerDetailEnrichment.ts`, `server/modules/externalModels/roleOpportunity/__tests__/playerDetailEnrichment.test.ts`, `server/routes/__tests__/playerIdentityRoutes.test.ts`, `README.md`, `replit.md`, `server/modules/externalModels/MODULE.md`
- **Validation:** Ran targeted Jest suites for the player-detail enrichment helper and player identity route, and ran a production build.
- **Notes:** Enrichment is only fetched when `includeRoleOpportunity=true` and still requires explicit `season` + `week`; upstream failures are surfaced inside `roleOpportunityInsight.error` instead of breaking the base player payload.

### 2026-03-20 — Codex: Player detail enrichment orchestrator
- **What changed:** Extracted player-detail external insight assembly into a reusable orchestrator module, moved role-opportunity enrichment behind it, kept the route-level opt-in validation/response semantics intact, and added focused orchestrator + route compatibility coverage.
- **Files modified:** `server/modules/externalModels/playerDetailEnrichment/*`, `server/routes/playerIdentityRoutes.ts`, `server/routes/__tests__/playerIdentityRoutes.test.ts`, `README.md`, `server/modules/externalModels/MODULE.md`, `replit.md`
- **Validation:** Ran targeted Jest suites for the orchestrator, route, and role-opportunity envelope helper; ran production build.
- **Notes:** Future player-detail enrichments should plug into the orchestrator rather than add direct conditionals inside `playerIdentityRoutes.ts`.


### 2026-03-20 — Codex: Module classification audit + architecture doctrine
- **What changed:** Added a repo-level module classification audit documenting which in-repo model-like systems are core, temporary legacy core, extract candidates, deprecations, deletes-after-replacement, or unknown. Added explicit architecture doctrine notes clarifying that TIBER-Fantasy is the shell/orchestration core and that standalone model brains should move behind adapters/orchestrators when practical.
- **Files modified:** `docs/architecture/TIBER_FANTASY_MODULE_CLASSIFICATION_AUDIT.md`, `README.md`, `server/modules/externalModels/MODULE.md`, `replit.md`
- **Validation:** Ran `git diff --check` and `npm run build` (passes with a pre-existing duplicate-class-member warning in `server/olc/adjusters.ts`).
- **Notes:** This PR is documentation-only and does not move, delete, or rewrite business logic; `UNKNOWN` is used where runtime usage could not be confirmed from the audit.
### 2026-03-20 — Codex: Legacy module freeze/extraction notices
- **What changed:** Added blunt module-level classification notices for FORGE, CATALYST, FIRE, doctrine modules, Metric Matrix, Start/Sit, OVR, and tiberMatrix, plus a short architecture work-rules doc that makes the repo-wide audit operational.
- **Files modified:** `server/modules/forge/MODULE.md`, `server/modules/catalyst/MODULE.md`, `server/modules/fantasyLab/README.md`, `server/routes/fireRoutes.ts`, `server/doctrine/MODULE.md`, `server/modules/metricMatrix/MODULE.md`, `server/modules/startSit/MODULE.md`, `server/modules/ovr/MODULE.md`, `server/modules/tiberMatrix/MODULE.md`, `docs/architecture/LEGACY_MODULE_WORK_RULES.md`
- **Validation:** `git diff --check` passed; `npm run build` passed with the existing duplicate-class-member warning in `server/olc/adjusters.ts`.
- **Notes:** This PR is documentation-only and intentionally does not extract, delete, or rewrite any legacy module runtime paths.

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

### 2026-03-21 — Codex: FORGE parity fixture pack + snapshot harness
- **What changed:** Added a committed FORGE parity fixture pack, a deterministic parity harness/snapshot formatter, focused harness tests, and brief migration docs for rerunning labeled compare fixtures without changing production FORGE traffic.
- **Files modified:** `server/modules/externalModels/forge/fixtures/forgeParityFixtures.ts`, `server/modules/externalModels/forge/forgeParityHarness.ts`, `server/modules/externalModels/forge/runForgeParityHarness.ts`, `server/modules/externalModels/forge/__tests__/forgeParityFixtures.test.ts`, `server/modules/externalModels/forge/__tests__/forgeParityHarness.test.ts`, `server/modules/externalModels/forge/README.md`, `README.md`, `server/modules/externalModels/MODULE.md`, `replit.md`
- **Validation:** Focused Jest parity fixture/harness suites passed; `npm run build` passed with the existing duplicate-class-member warning in `server/olc/adjusters.ts`; `git diff --check` passed.
- **Notes:** Harness intentionally reuses the existing compare service and preserves compare-only migration semantics; optional local runner is `tsx server/modules/externalModels/forge/runForgeParityHarness.ts`.

### 2026-03-21 — Codex: FORGE parity harness debug metadata + npm runner
- **What changed:** Extended the FORGE parity harness summary with a stable `results` array alias and per-fixture `confidenceDelta`/`componentDeltas` metadata in deterministic snapshot output, added an `npm run forge:parity` helper, and refreshed migration docs to point contributors at the runner plus debug fields.
- **Files modified:** `server/modules/externalModels/forge/forgeParityHarness.ts`, `server/modules/externalModels/forge/__tests__/forgeParityHarness.test.ts`, `server/modules/externalModels/forge/README.md`, `server/modules/externalModels/MODULE.md`, `README.md`, `replit.md`, `package.json`
- **Validation:** Ran targeted Jest parity suites with snapshot update and ran `npm run build` (passes with the existing duplicate-class-member warning in `server/olc/adjusters.ts`).
- **Notes:** This keeps the existing compare endpoint contract intact; the new `results` field is additive and mirrors `perFixture` for deterministic migration reporting.

### 2026-03-21 — Codex: FORGE parity report endpoint + exporter
- **What changed:** Added a migration-only `GET /api/integrations/forge/parity-report` route plus a dedicated parity report service that wraps the existing FORGE parity harness in a stable readiness-aware contract. Added a small report exporter/runner for local stdout or JSON inspection without changing production `/api/forge/*` behavior.
- **Files modified:** `server/modules/externalModels/forge/*`, `server/routes/forgeIntegrationRoutes.ts`, `server/routes/__tests__/forgeIntegrationRoutes.test.ts`, `README.md`, `server/modules/externalModels/forge/README.md`, `server/modules/externalModels/MODULE.md`, `replit.md`, `package.json`
- **Validation:** Ran targeted Jest suites for the integration route, parity harness, report service, and exporter; ran `npm run build`; ran `git diff --check`.
- **Notes:** When external FORGE is disabled or `FORGE_SERVICE_BASE_URL` is missing, the parity report returns a deterministic unavailable summary with `harnessRan=false` and `skippedReason` metadata instead of throwing.


### 2026-03-21 — Codex: Opt-in external FORGE player detail preview
- **What changed:** Added an additive `externalForgeInsight` preview path to `GET /api/player-identity/player/:id` behind `includeExternalForge=true`, reused the existing external FORGE adapter/service boundary via the player-detail enrichment orchestrator, and kept failures non-fatal with a stable unavailable/error envelope.
- **Files modified:** `server/routes/playerIdentityRoutes.ts`, `server/modules/externalModels/playerDetailEnrichment/*`, `server/modules/externalModels/forge/playerDetailEnrichment.ts`, `server/modules/externalModels/forge/__tests__/playerDetailEnrichment.test.ts`, `server/routes/__tests__/playerIdentityRoutes.test.ts`, `README.md`, `server/modules/externalModels/MODULE.md`, `server/modules/externalModels/forge/README.md`, `replit.md`
- **Validation:** Ran targeted Jest suites for the player-detail orchestrator, new external FORGE player-detail helper, and player identity route; ran `npm run build`; ran `git diff --check`.
- **Notes:** Legacy FORGE remains the default everywhere else. External FORGE preview currently stays narrow to QB/RB/WR/TE player detail and defaults preview `week` to `season` plus mode to `redraft` unless explicitly overridden.

### 2026-03-21 — Codex: Player detail FORGE comparison preview
- **What changed:** Added opt-in `includeForgeComparison=true` support to player detail, reusing the existing external FORGE compare service to return side-by-side legacy/external FORGE insight plus stable parity metadata while keeping failures non-fatal and defaults unchanged.
- **Files modified:** `server/routes/playerIdentityRoutes.ts`, `server/modules/externalModels/playerDetailEnrichment/*`, `server/modules/externalModels/forge/playerDetailEnrichment.ts`, `server/routes/__tests__/playerIdentityRoutes.test.ts`, `server/modules/externalModels/forge/__tests__/playerDetailEnrichment.test.ts`, `server/modules/externalModels/playerDetailEnrichment/__tests__/playerDetailEnrichmentOrchestrator.test.ts`, `README.md`, `server/modules/externalModels/MODULE.md`, `server/modules/externalModels/forge/README.md`, `replit.md`
- **Validation:** Ran targeted Jest suites for the route/orchestrator/player-detail FORGE helpers, `npm run build`, and `git diff --check`.
- **Notes:** Comparison mode is migration-only preview behavior. Legacy FORGE remains the default; external-only preview via `includeExternalForge=true` is still supported unchanged.

### 2026-03-21 — Codex: FORGE migration review endpoint for sampled comparisons
- **What changed:** Added a migration-only `GET /api/integrations/forge/review` endpoint plus `forgeMigrationReviewService.ts` to sample existing legacy FORGE batch players, reuse the compare service per player, aggregate stable summary metrics, and contain per-player failures/disabled-integration states without changing live FORGE defaults.
- **Files modified:** `server/modules/externalModels/forge/*`, `server/routes/forgeIntegrationRoutes.ts`, `server/routes/__tests__/forgeIntegrationRoutes.test.ts`, `README.md`, `server/modules/externalModels/forge/README.md`, `server/modules/externalModels/MODULE.md`, `replit.md`
- **Validation:** Ran focused Jest suites for the migration review service and route, ran `npm run build`, ran `git diff --check`, and smoke-tested the new route shape with `curl` against a mocked local Express app.
- **Notes:** Sampling intentionally reuses `runForgeEngineBatch` so review requests stay tied to existing player sources. The route is operator/migration-only and does not add UI, persistence, or product behavior changes.

### 2026-03-23 — Codex: WR Breakout Lab Signal-Validation promotion
- **What changed:** Added the first read-only Signal-Validation-Model promotion in TIBER Data Lab with a filesystem-backed external-model adapter/service/route, a new `/tiber-data-lab/breakout-signals` page, season-aware WR signal-card table rendering, best-recipe summary display, empty/error/loading states, and lightweight row expansion for full signal-card fields.
- **Files modified:** `server/modules/externalModels/signalValidation/*`, `server/routes/dataLabBreakoutSignalsRoutes.ts`, `server/routes.ts`, `server/routes/__tests__/dataLabBreakoutSignalsRoutes.test.ts`, `client/src/pages/BreakoutSignalsLab.tsx`, `client/src/components/data-lab/BreakoutSignalsView.tsx`, `client/src/lib/breakoutSignals.ts`, `client/src/App.tsx`, `client/src/pages/DataLabHub.tsx`, `client/src/lib/metricRegistry.ts`, `client/src/__tests__/breakoutSignalsView.test.ts`, `README.md`, `server/modules/externalModels/MODULE.md`, `replit.md`, `jest.config.cjs`
- **Validation:** Focused Jest suites for the Signal Validation adapter, Data Lab route, and view rendering passed; `npm run build` passed with the existing duplicate-class-member warning in `server/olc/adjusters.ts`; `git diff --check` passed. Repo-wide `npm run typecheck` still fails on unrelated pre-existing TypeScript issues outside this PR.
- **Notes:** The adapter defaults to `SIGNAL_VALIDATION_EXPORTS_DIR` (or `./data/signal-validation`) and intentionally only consumes promoted exports (`wr_player_signal_cards_{season}.csv` and `wr_best_recipe_summary.json`). No rescoring logic was added to TIBER-Fantasy.

### 2026-03-23 — Codex: WR Breakout Lab polish pass
- **What changed:** Added client-side sort/search/quick-filter controls to the WR Breakout Lab table, grouped read-only detail sections for expanded rows, stronger best-recipe provenance copy, and clearer loading/empty/error/operator-hint states without changing any breakout scoring logic.
- **Files modified:** `client/src/components/data-lab/BreakoutSignalsView.tsx`, `client/src/lib/breakoutSignals.ts`, `client/src/pages/BreakoutSignalsLab.tsx`, `client/src/__tests__/breakoutSignalsView.test.ts`, `README.md`, `server/modules/externalModels/signalValidation/README.md`, `replit.md`
- **Validation:** Ran the focused WR Breakout Lab Jest suite, `npm run build`, and `git diff --check`.
- **Notes:** All new table controls are client-side only and preserve the module's read-only Signal-Validation-Model trust posture.

### 2026-03-23 — Codex: Age Curve / ARC Lab promotion
- **What changed:** Added the third promoted read-only Data Lab sub-model with a new `/tiber-data-lab/age-curves` page, a dedicated external-model adapter/client/service stack under `server/modules/externalModels/ageCurves/`, a normalized `GET /api/data-lab/age-curves` route, searchable/filterable age-curve table rendering, expandable detail/provenance sections, and a lightweight expected-vs-actual bar comparison.
- **Files modified:** `server/modules/externalModels/ageCurves/*`, `server/routes/dataLabAgeCurvesRoutes.ts`, `server/routes/__tests__/dataLabAgeCurvesRoutes.test.ts`, `server/routes.ts`, `client/src/lib/ageCurves.ts`, `client/src/components/data-lab/AgeCurvesView.tsx`, `client/src/pages/AgeCurvesLab.tsx`, `client/src/__tests__/ageCurvesView.test.ts`, `client/src/App.tsx`, `client/src/pages/DataLabHub.tsx`, `client/src/lib/metricRegistry.ts`, `README.md`, `server/modules/externalModels/MODULE.md`, `replit.md`
- **Validation:** Ran focused Jest suites for the Age Curve adapter, route, and view; ran `npm run build`; ran `git diff --check`; smoke-tested `GET /api/data-lab/age-curves?season=2025` against a local mocked Express mount with `curl`.
- **Notes:** The module remains read only and intentionally does not recompute ARC logic. The adapter prefers an upstream compatibility endpoint but can also consume a stable exported artifact at `AGE_CURVE_EXPORTS_PATH`.

### 2026-03-23 — Codex: Data Lab promoted-module cohesion pass
- **What changed:** Reworked the Data Lab hub so the three promoted labs read as one system with consistent promoted/read-only framing, concise module-purpose and usage guidance, and a dedicated promoted-module section. Added cross-module navigation blocks inside Breakout, Role & Opportunity, and Age Curve / ARC Lab plus lightweight player carry-through via `playerId` / `playerName` deep links. Updated focused frontend tests and added a short README/replit architecture note.
- **Files modified:** `client/src/pages/DataLabHub.tsx`, `client/src/components/data-lab/BreakoutSignalsView.tsx`, `client/src/components/data-lab/RoleOpportunityView.tsx`, `client/src/components/data-lab/AgeCurvesView.tsx`, `client/src/components/data-lab/PromotedModuleSystemCard.tsx`, `client/src/lib/dataLabPromotedModules.ts`, `client/src/pages/BreakoutSignalsLab.tsx`, `client/src/pages/RoleOpportunityLab.tsx`, `client/src/pages/AgeCurvesLab.tsx`, `client/src/lib/metricRegistry.ts`, `client/src/__tests__/*`, `README.md`, `replit.md`
- **Validation:** Ran focused Jest suites for the promoted Data Lab views/helpers/hub, `npm run build`, and `git diff --check`.
- **Notes:** This is product-layer integration only. No scoring, adapter, database, or promotion-scope logic changed.

### 2026-03-23 — Codex: Point Scenario Lab promotion
- **What changed:** Added the fourth promoted read-only Data Lab sub-model with a new `/tiber-data-lab/point-scenarios` page, a dedicated external-model adapter/client/service stack under `server/modules/externalModels/pointScenarios/`, a normalized `GET /api/data-lab/point-scenarios` route, a searchable/filterable scenario table, and a detail drawer for full scenario payload/provenance inspection plus light cross-links back to the other promoted labs.
- **Files modified:** `server/modules/externalModels/pointScenarios/*`, `server/routes/dataLabPointScenariosRoutes.ts`, `server/routes/__tests__/dataLabPointScenariosRoutes.test.ts`, `server/routes.ts`, `client/src/lib/pointScenarios.ts`, `client/src/components/data-lab/PointScenariosView.tsx`, `client/src/pages/PointScenariosLab.tsx`, `client/src/App.tsx`, `client/src/pages/DataLabHub.tsx`, `client/src/lib/dataLabPromotedModules.ts`, `client/src/lib/metricRegistry.ts`, `client/src/__tests__/pointScenariosView.test.ts`, `client/src/__tests__/dataLabHub.test.ts`, `client/src/__tests__/dataLabPromotedModules.test.ts`, `README.md`, `server/modules/externalModels/MODULE.md`, `replit.md`
- **Validation:** Ran focused Jest suites for the Point Scenario adapter, route, view, and promoted-module helper/hub coverage; ran `npm run build`; ran `git diff --check`.
- **Notes:** The module remains read only and intentionally does not author scenarios or recompute any Point-prediction-Model logic. The frontend is positioned as scenario-analysis context, not a final rankings surface.

### 2026-03-23 — Codex: Player Research Workspace cross-model synthesis surface
- **What changed:** Added the new read-only `/tiber-data-lab/player-research` surface and `GET /api/data-lab/player-research` route, backed by a `server/modules/externalModels/playerResearch/` orchestration layer that reuses the four promoted lab adapters without rescoring. Added player-name search, `playerId` deep-linking, season carry-through, partial-data/error handling, section-level link-outs, and updated promoted-module docs/hub metadata.
- **Files modified:** `server/modules/externalModels/playerResearch/*`, `server/routes/dataLabPlayerResearchRoutes.ts`, `server/routes.ts`, `client/src/pages/PlayerResearchLab.tsx`, `client/src/components/data-lab/PlayerResearchWorkspaceView.tsx`, `client/src/lib/playerResearch.ts`, `client/src/lib/dataLabPromotedModules.ts`, `client/src/pages/DataLabHub.tsx`, `README.md`, `replit.md`, `server/modules/externalModels/MODULE.md`
- **Validation:** Focused Jest suites for service aggregation, route behavior, client query/search helpers, and rendering all passed. `npm run build` passed with the pre-existing duplicate-class-member warning in `server/olc/adjusters.ts`.
- **Notes:** Workspace preserves a read-only trust posture and gracefully degrades when one or more promoted modules are missing or unavailable.

### 2026-03-23 — Codex: Data Lab promoted-module stabilization pass
- **What changed:** Standardized promoted-module UX patterns across Breakout, Role & Opportunity, Age Curve / ARC, Point Scenario, and Player Research; added shared state/provenance/navigation helpers; preserved season carry-through in promoted deep links; surfaced operator-visible route diagnostics for misconfigured vs no-data vs malformed upstream states; and added a lightweight hub status/help panel for promoted read-only dependencies.
- **Files modified:** `client/src/components/data-lab/*`, `client/src/lib/dataLabPromotedModules.ts`, promoted lab page wrappers, promoted lab/frontend tests, Data Lab hub, `server/routes/dataLab*Routes.ts`, `server/modules/externalModels/promotedModuleOperator.ts`, route tests, `README.md`, `server/modules/externalModels/MODULE.md`, `replit.md`
- **Validation:** Focused Jest suites for promoted Data Lab views/helpers/routes passed; `npm run build` passed with the pre-existing duplicate-class-member warning in `server/olc/adjusters.ts`; `git diff --check` passed.
- **Notes:** This is a hardening pass only — no new model promotions, no scoring changes, and no ingestion/database changes. Route errors now include additive operator metadata that the client uses for clearer operator hints.

### 2026-03-23 — Codex: Team Research Workspace team-level synthesis surface
- **What changed:** Added the read-only Team Research Workspace at `/tiber-data-lab/team-research` plus a new `teamResearch/` external-model orchestrator and `/api/data-lab/team-research` endpoint. The workspace aggregates promoted breakout, role, ARC, and point-scenario summaries for one team with team search, `team` deep-linking, key-player summaries, direct link-outs to Player Research, and explicit partial-data/error handling.
- **Files modified:** `server/modules/externalModels/teamResearch/*`, `server/routes/dataLabTeamResearchRoutes.ts`, `server/routes.ts`, `client/src/pages/TeamResearchLab.tsx`, `client/src/components/data-lab/TeamResearchWorkspaceView.tsx`, `client/src/lib/teamResearch.ts`, `client/src/lib/dataLabPromotedModules.ts`, `client/src/components/data-lab/PromotedModuleSystemCard.tsx`, `client/src/components/data-lab/PlayerResearchWorkspaceView.tsx`, `client/src/pages/DataLabHub.tsx`, `client/src/App.tsx`, `README.md`, `server/modules/externalModels/MODULE.md`, `replit.md`
- **Validation:** Focused Jest suites for the new service, route, promoted-nav helpers, hub, and workspace rendering all passed. `npm run build` passed with the pre-existing duplicate-class-member warning in `server/olc/adjusters.ts`.
- **Notes:** Workspace preserves a read-only trust posture, distinguishes missing team data from upstream/config errors, and intentionally links back into Player Research rather than inventing any new scoring or write paths.

### 2026-03-23 — Codex: Surface Data Lab discovery in core flows
- **What changed:** Added lightweight Player Research / Team Research quick links to core player-facing surfaces, added a compact read-only Data Lab discovery widget on the main dashboard that opens the Command Center, and added focused frontend tests for the new deep-link + widget behavior.
- **Files modified:** `client/src/components/data-lab/CoreResearchQuickLinks.tsx`, `client/src/components/data-lab/DataLabDiscoveryWidget.tsx`, `client/src/pages/PlayerPage.tsx`, `client/src/pages/TiberTiers.tsx`, `client/src/pages/Dashboard.tsx`, `client/src/__tests__/coreResearchQuickLinks.test.ts`, `client/src/__tests__/dataLabDiscoveryWidget.test.ts`, `README.md`, `replit.md`
- **Validation:** Ran targeted Jest suites for the new quick-link/widget coverage, `git diff --check`, and `npm run build` (passes with the existing duplicate-class-member warning in `server/olc/adjusters.ts`).
- **Notes:** This is intentionally an integration/discovery pass only — links reuse existing query-param conventions and the dashboard widget consumes Command Center outputs without recomputing or duplicating Data Lab model logic.


### 2026-03-23 — Codex: Player-page inline Research Summary block
- **What changed:** Added a compact read-only Research Summary block to `PlayerPage.tsx` that fetches the existing promoted Player Research workspace payload and shows a restrained subset of breakout, recipe, role/opportunity, age-curve, and point-scenario notes when available. Added explicit minimal CTA/empty behavior when no promoted summaries exist and a separate unavailable state when the promoted research system cannot be reached.
- **Files modified:** `client/src/components/data-lab/PlayerResearchSummaryBlock.tsx`, `client/src/pages/PlayerPage.tsx`, `client/src/__tests__/playerResearchSummaryBlock.test.ts`, `README.md`, `replit.md`
- **Validation:** Ran focused Jest coverage for the new summary block plus existing research-link behavior; ran `npm run build`; ran `git diff --check`.
- **Notes:** The player page remains read only and does not recompute any model logic locally; it simply surfaces a few promoted/orchestrated Player Research outputs and links users into the full workspace.

### 2026-03-23 — Codex: Schedule / SoS team summary surfacing Team Research
- **What changed:** Added a compact read-only `TeamResearchSummaryBlock` driven by the existing Team Research workspace payload, wired it into the routed Schedule / SoS team surface so a selected team now shows lightweight offensive-context / role / breakout / scenario / developmental notes plus a stable CTA into `/tiber-data-lab/team-research`, and preserved distinct empty vs unavailable states without recomputing model logic locally.
- **Files modified:** `client/src/components/data-lab/TeamResearchSummaryBlock.tsx`, `client/src/pages/SchedulePage.tsx`, `client/src/__tests__/teamResearchSummaryBlock.test.ts`, `README.md`, `replit.md`
- **Validation:** Ran focused Jest coverage for the new summary block + existing team research link helpers, ran `npm run build`, and ran `git diff --check`.
- **Notes:** The inline block intentionally stays lightweight and read only; the Schedule / SoS team table now acts as the main non-Data-Lab team-facing surface for promoted Team Research context.

### 2026-03-24 — Codex: WR Breakout artifact handoff hardening + readiness tests
- **What changed:** Added a dedicated runbook for Signal-Validation-Model → TIBER-Fantasy WR Breakout artifact handoff with exact export/copy/verification steps, clarified season-token behavior in the Signal Validation adapter docs, and tightened not-found messaging to surface available export seasons plus feature-season filename expectations. Added focused promoted-status tests that exercise real filesystem-backed breakout artifacts for both ready and missing-artifact outcomes.
- **Files modified:** `server/modules/externalModels/signalValidation/signalValidationClient.ts`, `server/modules/externalModels/__tests__/promotedModelStatusService.test.ts`, `server/modules/externalModels/signalValidation/README.md`, `docs/runbooks/WR_BREAKOUT_SIGNAL_VALIDATION_HANDOFF.md`, `README.md`, `.claude/context-log.md`, `.claude/agents/codex.md`
- **Validation:** Ran focused Jest suite for promoted model status service breakout artifact readiness scenarios.
- **Notes:** Path remains artifact-based and read-only; no breakout rescoring logic was added to TIBER-Fantasy.

### 2026-03-24 — Codex: Promoted WR breakout season defaulting follows latest export
- **What changed:** Removed current-week fallback season forcing from Command Center, Player Research, Team Research, and dashboard discovery fetches so they only send `season` when explicitly provided. Promoted surfaces now let the backend choose an honest default season from available promoted exports (which prioritizes Signal-Validation breakout exports), while preserving explicit query-param seasons.
- **Files modified:** `client/src/pages/DataLabCommandCenterLab.tsx`, `client/src/pages/PlayerResearchLab.tsx`, `client/src/pages/TeamResearchLab.tsx`, `client/src/pages/Dashboard.tsx`, `client/src/lib/dataLabCommandCenter.ts`, `client/src/lib/playerResearch.ts`, `client/src/lib/teamResearch.ts`, `client/src/components/data-lab/DataLabCommandCenterView.tsx`, `client/src/components/data-lab/PlayerResearchWorkspaceView.tsx`, `client/src/components/data-lab/TeamResearchWorkspaceView.tsx`, related tests.
- **Validation:** Ran focused Jest suites for command center service/routes/views plus player/team workspace helper behavior. All targeted tests passed.
- **Notes:** Explicit `season` query params are still authoritative; no-query flows now default to latest available promoted export season (e.g., 2024 when that is the latest Signal-Validation export).

### 2026-03-24 — Codex: Command Center lane-level season honesty states
- **What changed:** Added lane-level promoted season-availability signaling across Data Lab Command Center + promoted status diagnostics so modules now distinguish `ready for selected season` vs `healthy but available in other season(s)` vs truly unavailable/missing. Updated command-center module strip and section empty messages to call out alternate available seasons (without rewriting selected query season), and added available-season metadata rendering in both Command Center module cards and the promoted status panel.
- **Files modified:** `server/modules/externalModels/dataLabCommandCenter/types.ts`, `server/modules/externalModels/dataLabCommandCenter/service.ts`, `server/modules/externalModels/promotedModelStatusService.ts`, `client/src/lib/dataLabCommandCenter.ts`, `client/src/lib/dataLabPromotedStatus.ts`, `client/src/components/data-lab/DataLabCommandCenterView.tsx`, `client/src/components/data-lab/PromotedModelStatusPanel.tsx`, related focused tests.
- **Validation:** Ran focused Jest suites for command-center service/routes/view and promoted-status service/routes, including new coverage for cross-lane season mismatch (`ready` lane + `other season` lane) and messaging distinction between healthy-different-season vs missing artifact/unavailable.
- **Notes:** Behavior keeps explicit `?season=` authoritative and avoids any synthetic cross-lane season merge or silent season rewriting.
### 2026-03-26 — Codex: Promoted rookie artifact wired to visible /rookies surface
- **What changed:** Replaced the in-repo DB-backed rookie endpoint with a promoted-artifact consumer path (`server/modules/externalModels/rookies/`) that reads a validated rookie JSON export, enforces core contract assumptions (season/meta/rows + name/position identity), deterministically maps fields for TIBER-Fantasy, and serves `/api/rookies/:season` through a dedicated router. Updated `/rookies` UI to render promoted model metadata, surface enriched summary/note fields when present, and show a clear unavailable state when artifact loading fails.
- **Files modified:** `server/modules/externalModels/rookies/*`, `server/routes/rookiesPromotedRoutes.ts`, `server/routes.ts`, `client/src/pages/RookieBoard.tsx`, `docs/runbooks/ROOKIE_PROMOTED_HANDOFF.md`, `README.md`, `replit.md`.
- **Validation:** Ran focused Jest suites for rookie adapter + rookie route, and ran `npm run build` successfully.
- **Notes:** Deployment path is artifact-only (no runtime dependency on TIBER-Rookies routes). Configure `ROOKIE_PROMOTED_ARTIFACT_PATH` for promoted handoff source in production.

### 2026-03-26 — Codex: Rookie promoted composite mapping fix for alpha/tier blanks
- **What changed:** Hardened the rookie artifact adapter to read composite promoted fields from nested/camelCase score contracts (`scores.rookieAlpha`, `scores.rookieTier`, `scores.rank`, nested component scores), plus additional row containers (`board.players`, `rookies`) so promoted alpha/tier fields no longer drop at the adapter boundary.
- **Files modified:** `server/modules/externalModels/rookies/rookieArtifactAdapter.ts`, `server/modules/externalModels/rookies/__tests__/rookieArtifactAdapter.test.ts`, `server/modules/externalModels/rookies/__tests__/rookieArtifactService.test.ts`.
- **Validation:** `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/rookies/__tests__/rookieArtifactAdapter.test.ts server/modules/externalModels/rookies/__tests__/rookieArtifactService.test.ts server/routes/__tests__/rookiesPromotedRoutes.test.ts`.
- **Notes:** Fix is centralized in adapter/service mapping so `/api/rookies/:season`, `/rookies`, and CSV export all consume the same corrected fields.

### 2026-03-31 — Codex: Product shell IA realignment phase-1 pass
- **What changed:** Added a formal architecture plan doc for shell realignment (`TIBER_PRODUCT_SHELL_REALIGNMENT_PLAN.md`) with current-state diagnosis, full mounted-route classification, vocabulary cleanup, and scoped implementation plan. Reworked sidebar IA in `TiberLayout.tsx` into clear product layers (Core Product, Research, Model Labs, Agent & Intelligence, System & Builder), demoted legacy/internal language, and renamed dashboard nav label to Home. Refactored `/` in `Dashboard.tsx` from dashboard-first to front-door-first with lane cards, promoted research entry, retained real data-backed snapshot table, and explicit demotion framing for legacy chat/admin surfaces. Added a short README positioning note reflecting shell/front-door alignment.
- **Files modified:** `docs/architecture/TIBER_PRODUCT_SHELL_REALIGNMENT_PLAN.md`, `client/src/components/TiberLayout.tsx`, `client/src/pages/Dashboard.tsx`, `README.md`.
- **Validation:** Ran `npm run build` (passes; existing pre-existing warning remains in `server/olc/adjusters.ts` duplicate class member).
- **Notes:** No backend football/model logic changes; no route removals; deep-link compatibility preserved by keeping all existing routes mounted.

### 2026-04-02 — Codex: Team State read-only artifact consumer route
- **What changed:** Added a thin external-model adapter stack for `tiber_team_state_v0_1` artifacts (`teamStateClient` + `teamStateService` + types/docs) and mounted a new read-only route `GET /api/data-lab/team-state` with required `season` plus optional `throughWeek`. The route returns a stable `ok` envelope and explicit stable error codes for missing/invalid/unavailable artifacts without any Team State recomputation in TIBER-Fantasy.
- **Files modified:** `server/modules/externalModels/teamState/*`, `server/routes/dataLabTeamStateRoutes.ts`, `server/routes/__tests__/dataLabTeamStateRoutes.test.ts`, `server/routes.ts`, `server/modules/externalModels/MODULE.md`
- **Validation:** Ran focused Jest route tests for success + missing artifact + invalid request; ran `npm run build` (passes with pre-existing duplicate class member warning in `server/olc/adjusters.ts`).
- **Notes:** Artifact resolution is configurable via `TEAM_STATE_EXPORTS_DIR` and supports season files plus optional through-week filename variants.

### 2026-04-02 — Codex: Team State artifact contract validation hardening (PR116 follow-up)
- **What changed:** Hardened `teamStateClient` so parseable JSON is no longer treated as success unless it matches the required `tiber_team_state_v0_1` artifact shape (top-level fields, source contract keys, teams array, and required nested sample/features/stability keys per team). Parseable-but-contract-invalid payloads now map to the existing `invalid_payload` path.
- **Files modified:** `server/modules/externalModels/teamState/teamStateClient.ts`, `server/modules/externalModels/teamState/__tests__/teamStateClient.test.ts`, `server/routes/__tests__/dataLabTeamStateRoutes.test.ts`
- **Validation:** Ran focused Jest suites for Team State client + route, and `npm run build` (passes with pre-existing duplicate class member warning in `server/olc/adjusters.ts`).
- **Notes:** Route shape and scope are unchanged; this patch is trust-hardening only.

### 2026-04-02 — Codex: Rankings v2 definition audit/spec
- **What changed:** Added a spec-first architecture doc defining what “Rankings” should mean in TIBER now, with a blunt current-state diagnosis, ranking surface inventory (canonical vs legacy vs experimental/internal), allowed input layers, explanation spine, phased rebuild path, and explicit deferrals.
- **Files modified:** `docs/architecture/TIBER_RANKINGS_V2_DEFINITION.md`
- **Validation:** Audited current frontend routes/pages and backend endpoints in repo via targeted `rg`/`sed` inspection; no runtime logic changes were made.
- **Notes:** This PR intentionally does not rebuild ranking logic/models/UI. It defines the contract and migration framing so follow-up implementation can be scoped honestly.

### 2026-04-02 — Codex: Rankings v2 canonical contract scaffold + surface status labeling
- **What changed:** Added a new canonical Rankings v2 contract scaffold module at `server/contracts/rankingsV2.ts` with explicit top-level response fields, item shape, explanation envelope, and trust envelope (including confidence/freshness/sample/stability notes). Added migration/status notes on current public rankings surfaces (`/tiers`, `/rankings` alias, `/api/forge/tiers`) and labeled key non-canonical lanes in `server/routes.ts` (`/api/rankings*`, `/api/power/*`, deprecated `/api/tiber`, admin ranking sandboxes). Fixed dead admin ranking links in ForgeHub from unmounted `/rankings/*` paths to canonical `/tiers`.
- **Files modified:** `server/contracts/rankingsV2.ts`, `server/modules/forge/routes.ts`, `server/routes.ts`, `client/src/App.tsx`, `client/src/pages/TiberTiers.tsx`, `client/src/pages/admin/ForgeHub.tsx`, `docs/architecture/TIBER_RANKINGS_V2_DEFINITION.md`.
- **Validation:** Ran `npm run build` successfully (existing known warning remains in `server/olc/adjusters.ts` duplicate class member).
- **Notes:** Intentionally did not change ranking math or rebuild the public rankings UI; next likely PR is wiring one visible Weekly canonical route payload to the new contract.

### 2026-04-12 — Codex: Live scoring-service integration (player + rankings)
- **What changed:** Added a dedicated Point-prediction scoring integration boundary under `server/modules/externalModels/scoring/` with typed request/response contracts, request mappers (`toScoringPlayerInput`, `toLeagueContextInput`), resilient POST client methods for weekly player card/rankings/ROS/compare, and safe `ScoringResult` wrappers. Wired `/api/player-identity/player/:id` opt-in scoring enrichments (`includeScoringWeekly`, `includeScoringRos`) and updated Rankings v2 weekly route to prefer scoring-service rankings with FORGE cache fallback when scoring is unavailable.
- **Files modified:** `server/modules/externalModels/scoring/*`, `server/routes/playerIdentityRoutes.ts`, `server/routes/rankingsV2Routes.ts`, `client/src/components/player/ScoringSnapshotCard.tsx`, `client/src/pages/PlayerPage.tsx`, `client/src/pages/TiberTiers.tsx`, `server/routes/__tests__/playerIdentityRoutes.test.ts`, `server/routes/__tests__/rankingsV2Routes.test.ts`, `client/src/__tests__/scoringSnapshotCard.test.ts`.
- **Validation:** `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/scoring/__tests__/scoringServiceClient.test.ts server/routes/__tests__/playerIdentityRoutes.test.ts server/routes/__tests__/rankingsV2Routes.test.ts client/src/__tests__/scoringSnapshotCard.test.ts`; `npm run build`.
- **Notes:** Rankings v2 now consumes scoring-service payload fields (`expected`, `VORP`, `floor`, `ceiling`, `confidence band`, `weekly outlook`) when available and logs a warning before falling back to existing FORGE cache behavior.

### 2026-04-12 — Codex: PR123 scoring wire-contract fix pass
- **What changed:** Aligned scoring client to the live scoring-service contract by sending upstream request bodies with `players` + `league_context` (`weekly`/`rankings`), `remaining_weeks` for ROS, and `player_a`/`player_b` for compare. Added service-envelope parsing (`ok` + `data`) and route-specific payload extraction (`data.card` / `data.view`).
- **Files modified:** `server/modules/externalModels/scoring/scoringServiceClient.ts`, `server/modules/externalModels/scoring/types.ts`, `server/modules/externalModels/scoring/scoringRequestMappers.ts`, `server/routes/playerIdentityRoutes.ts`, `server/routes/rankingsV2Routes.ts`, `server/modules/externalModels/scoring/__tests__/scoringServiceClient.test.ts`, `server/routes/__tests__/rankingsV2Routes.test.ts`.
- **Validation:** `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/scoring/__tests__/scoringServiceClient.test.ts server/routes/__tests__/playerIdentityRoutes.test.ts server/routes/__tests__/rankingsV2Routes.test.ts client/src/__tests__/scoringSnapshotCard.test.ts`; `npm run build`.
- **Notes:** Also fixed two reviewer-noted hardening issues: null numeric coercion no longer turns into zero, and non-numeric timeout config now safely falls back to default.

### 2026-04-12 — Codex: PR123 semantic scoring-input depth fix
- **What changed:** Reworked scoring-input mapping to send real opportunity/context fields (games sampled, routes/targets/carries per game, PPR points baseline, snap/target share where available, volatility proxy) sourced from TIBER `weekly_stats`/`player_usage` data rather than identity-only payloads. Rankings scoring preference now gates on meaningful mapped-input coverage and skips scoring preference when inputs are too thin.
- **Files modified:** `server/modules/externalModels/scoring/scoringRequestMappers.ts`, `server/modules/externalModels/scoring/types.ts`, `server/modules/externalModels/scoring/scoringServiceClient.ts`, `server/routes/playerIdentityRoutes.ts`, `server/routes/rankingsV2Routes.ts`, `server/routes/__tests__/playerIdentityRoutes.test.ts`, `server/routes/__tests__/rankingsV2Routes.test.ts`, `server/modules/externalModels/scoring/__tests__/scoringServiceClient.test.ts`.
- **Validation:** `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.cjs --runInBand --coverage=false server/modules/externalModels/scoring/__tests__/scoringServiceClient.test.ts server/routes/__tests__/playerIdentityRoutes.test.ts server/routes/__tests__/rankingsV2Routes.test.ts client/src/__tests__/scoringSnapshotCard.test.ts`; `npm run build`.
- **Notes:** Compare normalization now preserves structured compare view (`verdict`, `playerA`, `playerB`, nested deltas) instead of flattening into reduced scalar-only fields.

### 2026-05-10 — Codex: Stress Lab followup routing precision
- **What changed:** Split Stress Lab followup routing into focused transaction and Teamstate environment cue patterns so rookie/prospect notes with draft-capital language no longer inherit unrelated transaction or QB/environment followups.
- **Files modified:** `client/src/lib/stressLab.ts`, `client/src/__tests__/stressLab.test.ts`, `.claude/context-log.md`, `.claude/agents/codex.md`
- **Validation:** Ran focused Stress Lab Jest coverage successfully. Ran `npm run typecheck`, which still fails on pre-existing unrelated TypeScript errors across other modules.
- **Notes:** Patch remains deterministic, read-only, heuristic-based, and does not call backend/LLM services or mutate rankings/projections.

### 2026-05-10 — Codex: Stress Lab capability matrix docs
- **What changed:** Added a lightweight Stress Lab Capability Matrix covering supported signal categories, routing coverage, limitations, future artifact targets, known failure modes, repo/domain ownership boundaries, and design philosophy. Added a README feature link to the matrix.
- **Files modified:** `docs/stress-lab-capability-matrix.md`, `README.md`
- **Validation:** Documentation-only change; ran `git diff --check`.
- **Notes:** No backend calls, runtime logic, UI changes, ranking/projection mutation, or artifact ingestion were added.

### 2026-05-10 — Codex: TIBER Observatory UI reset
- **What changed:** Repositioned the default app experience around a smaller TIBER Observatory surface, using the existing Stress Lab note-inspection logic as the primary read-only operator workflow. Simplified primary navigation and added explicit online-system status and repo-boundary awareness panels without fake metrics or placeholder modules.
- **Files modified:** `client/src/App.tsx`, `client/src/components/TiberLayout.tsx`, `client/src/pages/StressLab.tsx`, `client/src/__tests__/stressLab.test.ts`
- **Validation:** `npm run test -- client/src/__tests__/stressLab.test.ts` passed; `npm run build` passed with existing duplicate `applyAdjusters` warning; `npm run typecheck` still fails on pre-existing unrelated repo-wide TypeScript errors; Vite route smoke checks returned 200 for `/`, `/observatory`, `/tiers`, `/rookies`, `/metrics-dictionary`, and `/architecture`.
- **Notes:** Compatibility routes remain registered; unfinished/experimental surfaces were removed from primary navigation rather than deleted.

### 2026-05-10 — Codex: Observatory on/off split heuristic extraction
- **What changed:** Added deterministic v0 awareness for player/team on-off EPA split notes, including conservative 49ers/Vikings and CMC/Christian McCaffrey/Justin Jefferson entity detection, on/off metric scaffolds, signal tags, followups, uncertainty language, and Observatory handoff labeling.
- **Files modified:** `client/src/lib/stressLab.ts`, `client/src/__tests__/stressLab.test.ts`
- **Validation:** `npm run test -- client/src/__tests__/stressLab.test.ts` passed; `npm run typecheck` still fails on pre-existing unrelated repository-wide TypeScript errors; `git diff --check` passed.
- **Notes:** Numeric values remain `null` in v0; counterintuitive negative deltas are preserved as context-required rather than player blame or ranking mutation.

### 2026-05-10 — Codex: Observatory RB role/market heuristic extraction
- **What changed:** Added deterministic v0 Observatory heuristics for RJ Harvey/Denver dynasty RB notes, including role/receiving/third-down/committee/market/FORGE/coaching-trust cues, RB-oriented artifact scaffolds, followups, and uncertainty guardrails without emitting unsupported coach entities.
- **Files modified:** `client/src/lib/stressLab.ts`, `client/src/__tests__/stressLab.test.ts`.
- **Validation:** `npm test -- --runTestsByPath client/src/__tests__/stressLab.test.ts` passed; `npm run typecheck` still fails on pre-existing unrelated repository TypeScript errors.
- **Notes:** ADP/market price remains hypothesis context only; role and coaching-trust claims require upstream TIBER-Data, Role & Opportunity, Teamstate, and FORGE verification before downstream use.

### 2026-05-24 — Codex: TIBER-Data player ownership consumer for Player Research
- **What changed:** Added a read-only `playerOwnership` external-model adapter stack for TIBER-Data `player_ownership_v0` latest artifacts plus optional `player_ownership_change_event_v0` JSONL events. Mounted `GET /api/data-lab/player-ownership`, wired ownership truth into Player Research responses and the workspace UI, and documented env/config paths.
- **Files modified:** `server/modules/externalModels/playerOwnership/*`, `server/routes/dataLabPlayerOwnershipRoutes.ts`, `server/routes.ts`, `server/modules/externalModels/playerResearch/*`, `client/src/lib/playerResearch.ts`, `client/src/components/data-lab/PlayerResearchWorkspaceView.tsx`, related tests/docs/env examples.
- **Validation:** Focused Jest suites passed for ownership service/route, Player Research service/route, and Player Research UI/summary block; live smoke against sibling `../TIBER-Data/exports/promoted/player_ownership/player_ownership_latest.json` matched Tee Higgins with one event. `npm run typecheck` remains blocked by pre-existing repo-wide errors outside these files; `npm run build` is blocked in this Windows workspace by esbuild entry-path/access resolution before application code is bundled.
- **Notes:** TIBER-Fantasy remains a consumer only. Missing, malformed, unknown, duplicate, and missing-event states return explicit unavailable/unknown/ambiguous warnings rather than fabricated roster truth.

### 2026-05-29 — Codex: Active docs AGI/lore language cleanup
- **What changed:** Reframed active operating documentation around grounded fantasy football decision support, human-in-the-loop ownership, read-only promoted artifacts, and explicit archived/non-operational treatment for prior philosophical framing.
- **Files modified:** `TIBER-ARCHITECTURE-PERMANENT.md`, `ARCHITECTURE.md`, `CURRENT_PHASE.md`, `README.md`, `.claude/AGENTS.md`, `TIBER_CONTEXT.md`, `CODEBASE_MAP.md`, `server/services/MODULE_RAG.md`, `docs/product/HUMAN_IN_THE_LOOP_DECISION_DOCTRINE.md`, `docs/letter-to-ai-agents.md`
- **Validation:** Ran targeted legacy-term searches before/after, verified remaining active-doc hits are quarantine/negative-instruction context, ran `git diff --check`, and confirmed only Markdown files changed.
- **Notes:** Docs-only; no runtime code, APIs, or schemas changed.

### 2026-05-30 — Codex: TIBER Management Dashboard shell
- **What changed:** Added the first Management Dashboard product shell with active Sleeper league sync/context entry, no-team empty states, roster snapshot placeholders, diagnosis placeholders, model signal readiness cards, action queue, and links into promoted research surfaces.
- **Files modified:** `client/src/pages/TiberManagementDashboard.tsx`, `client/src/App.tsx`, `client/src/components/TiberLayout.tsx`, `client/src/index.css`, `server/routes/__tests__/leagueSyncRoutes.test.ts`, `replit.md`.
- **Validation:** `npx vite build` passed; `npm run build` passed with existing duplicate class-member warning; targeted league route tests passed with `--coverage=false`; `npm run typecheck` still fails on pre-existing repo-wide TypeScript noise outside the touched files; dev screenshot was blocked because `DATABASE_URL` is not set.
- **Notes:** The dashboard consumes existing league sync/context/dashboard APIs only. Teamstate movement is displayed as read-only context and is intentionally not wired into scoring, rankings, projections, trade advice, or roster diagnosis.

### 2026-05-31 — Codex: Management Teamstate readiness truth patch
- **What changed:** Replaced the Management Dashboard's hardcoded Teamstate Movement readiness with a focused read-only query to `GET /api/data-lab/team-environment-movement`. The card now reports ready only for an available artifact with usable movement rows and otherwise surfaces unavailable, provenance, warning, or error details without feeding Teamstate into diagnosis or advice.
- **Files modified:** `client/src/pages/TiberManagementDashboard.tsx`, `client/src/lib/teamEnvironmentMovement.ts`, `client/src/__tests__/teamEnvironmentMovement.test.ts`, `client/src/index.css`, `.claude/context-log.md`, `.claude/agents/codex.md`, `replit.md`.
- **Validation:** `npx vite build` passed; `npm run build` passed with the existing duplicate class-member warning; focused Teamstate helper/API and league route Jest suites passed with `--coverage=false`; `git diff --check` passed; `npm run typecheck` still fails on pre-existing repo-wide TypeScript errors outside touched files and no touched-file errors were present.
- **Notes:** Teamstate movement remains a read-only visibility surface only. It is not wired into roster diagnosis, scoring, rankings, projections, trade logic, or player truth.

### 2026-06-02 — Codex: Management Rookie Alpha promoted-artifact fallback
- **What changed:** Reused the read-only TIBER-Rookies promoted adapter for Management roster fallback context when FORGE remains unavailable. Added Rookie Alpha evidence coverage to Team Direction without blending rookie values into FORGE strength, plus roster presentation for Rookie Alpha rank/score, position rank, talent score, and consensus delta when present.
- **Files modified:** `server/modules/externalModels/rookies/*`, `server/services/leagueDashboardService.ts`, `server/services/teamDirectionClassifier.ts`, `client/src/pages/TiberManagementDashboard.tsx`, `client/src/index.css`, docs/tests.
- **Validation:** Targeted Jest suites, build, typecheck review, and diff check recorded in PR notes.
- **Notes:** Producer repo is TIBER-Rookies; promoted lane is `exports/promoted/rookie-alpha/{season}_rookie_alpha_predraft_v0.json`. `ROOKIE_ALPHA_PROMOTED_DIR` configures the artifact directory. No runtime route dependency and no FORGE score/rank mutation were added.


### 2026-06-02 — Codex: Separate Management evidence coverage from Team Direction FORGE gate
- **What changed:** Tightened the Rookie Alpha Management fallback after review. Team Direction now exposes additive evidence and FORGE coverage summaries but requires sufficient FORGE scoring coverage before classifying strength. Generic missing roster rows render as `Unmatched` rather than incorrectly labeling veterans or unmapped players as rookie-pending.
- **Files modified:** `server/services/teamDirectionClassifier.ts`, `client/src/pages/TiberManagementDashboard.tsx`, focused tests, and Rookie Alpha handoff docs.
- **Validation:** Focused Management/Rookie Jest suite, builds, typecheck review, and diff check recorded in PR notes.
- **Notes:** Rookie Alpha improves Management visibility only. It cannot lift sparse FORGE scoring coverage over the Team Direction classification gate.

### 2026-06-03 — Codex: Management roster coverage diagnostics wording
- **What changed:** Replaced ambiguous Management roster “matched” language with explicit FORGE-scored, Rookie Alpha fallback, known/unscored, unresolved, and evidence-coverage counts. Added per-row visibility state/unavailable reason fields while preserving Rookie Alpha as visibility/evidence only and leaving FORGE scoring/direction semantics unchanged.
- **Files modified:** `server/services/leagueDashboardService.ts`, `server/services/teamDirectionClassifier.ts`, `client/src/pages/TiberManagementDashboard.tsx`, `client/src/index.css`, focused Management tests.
- **Validation:** Focused Jest suites passed with dummy `DATABASE_URL`, `--coverage=false`, and `--forceExit`; `npm run build` passed with the pre-existing duplicate `applyAdjusters` warning; `npm run typecheck` remains blocked by pre-existing repo-wide TypeScript errors outside the touched Management files.
- **Notes:** Management payload diagnostics now expose clear roster visibility counts. Rookie Alpha remains read-only fallback visibility and is not blended into FORGE alpha totals, scoring, rankings, or direction confidence.

### 2026-06-05 — Codex: League context raw-row normalization
- **What changed:** Fixed league context storage reads/writes to tolerate raw SQL snake_case rows for `league_id`, `active_league_id`, and `active_team_id` while preserving camelCase access for Drizzle-shaped rows.
- **Files modified:** `server/storage.ts`, `server/__tests__/storageLeagueContext.test.ts`, `.claude/context-log.md`, `.claude/agents/codex.md`.
- **Validation:** Focused storage Jest suite passed with `--coverage=false`; `npm run typecheck` remains blocked by pre-existing repo-wide TypeScript errors outside this change.
- **Notes:** No schema changes and no Sleeper sync behavior changes. The patch keeps the active-context unavailable/error behavior explicit and does not fabricate league/team data.

### 2026-06-05 — Codex: Management roster Sleeper identity hydration
- **What changed:** Added a Management dashboard identity-hydration pass for roster Sleeper IDs missing from `player_identity_map`, using Sleeper `/players/nfl` metadata to create explicit `sleeper:<id>` identity rows before classifying players as unresolved.
- **Files modified:** `server/integrations/sleeperClient.ts`, `server/services/leagueDashboardService.ts`, `server/services/__tests__/leagueDashboardService.test.ts`, `.claude/context-log.md`, `.claude/agents/codex.md`.
- **Validation:** Focused League Dashboard Jest suite passed with `--coverage=false --forceExit`; `git diff --check` passed; `npm run typecheck` still fails on pre-existing repo-wide TypeScript errors outside touched files and no touched-file errors were reported by a filtered typecheck check.
- **Notes:** This remains a downstream consumer fix: it does not fabricate FORGE scores or rookie evidence. If Sleeper metadata is unavailable or incomplete, players continue to surface as unresolved.

### 2026-06-05 — Codex: Management coverage diagnostics cleanup
- **What changed:** Split Management roster diagnostics into identity coverage, baseline visibility, player-specific FORGE evidence, Rookie Alpha fallback, and true evidence coverage. Added resolved-name fallbacks so baseline rows with blank identity `fullName` still show the best available player name.
- **Files modified:** `server/services/leagueDashboardService.ts`, `server/services/teamDirectionClassifier.ts`, `client/src/pages/TiberManagementDashboard.tsx`, `server/services/__tests__/leagueDashboardService.test.ts`, `server/routes/__tests__/managementRoutes.test.ts`
- **Validation:** Focused Management service and route Jest suites; `npm run build`; `git diff --check`; `npm run typecheck` still reports pre-existing repo-wide TypeScript errors, with no touched-file matches from a filtered run.
- **Notes:** Generated/default FORGE baselines remain visible but excluded from player-specific FORGE evidence and Team Direction scoring coverage.

### 2026-06-09 — Codex: Management identity seed export
- **What changed:** Added a copyable Management identity seed report for the active roster, including Sleeper provider IDs, current TIBER crosswalk mapping status, FORGE visibility status, and explicit recommended actions for TIBER-Data review.
- **Files modified:** `client/src/pages/TiberManagementDashboard.tsx`, `client/src/index.css`, `client/src/__tests__/managementModelSignals.test.ts`, `server/services/leagueDashboardService.ts`
- **Validation:** Ran targeted Management seed/report tests and Management route tests. Full typecheck was attempted but remains blocked by pre-existing repo-wide TypeScript errors unrelated to this change.
- **Notes:** Fantasy does not infer or mint TIBER IDs; `current_tiber_player_id` is populated only from existing `TIBER_IDENTITY_CROSSWALK_V1` resolution/provenance. Missing rows remain `crosswalk_status: "missing"` for TIBER-Data review.

### 2026-06-09 — Codex: Management identity diagnostics label correction
- **What changed:** Removed the risky `resolvedCanonicalCount` fallback from the “Sleeper roster identity resolved” diagnostics card so it only reports active-roster identity coverage. Added separate honest diagnostics for canonical IDs checked and resolved identity rows scanned. Updated the seed-report fixture to use Puka Nacua sleeper ID `9493` from the production smoke context.
- **Files modified:** `client/src/pages/TiberManagementDashboard.tsx`, `client/src/__tests__/managementModelSignals.test.ts`
- **Validation:** Re-ran targeted Management seed/report tests and Management route tests.
- **Notes:** Larger scanned/candidate counts are still visible, but no longer labeled as active-roster identity coverage.

### 2026-06-10 — Codex: Management strategy template eligibility diagnostics
- **What changed:** Added read-only DYNASTY_STRATEGY_ONTOLOGY_V1 template readiness diagnostics for Management Team Direction responses. Diagnostics enumerate sanitized template IDs/applies_to states, mark compatible templates blocked by disabled selection and missing future-contract inputs, keep selected_template_id null, and avoid rendering template text or changing classification.
- **Files modified:** server/modules/externalModels/strategyOntology/strategyTemplateDiagnostics.ts, server/services/leagueDashboardService.ts, server/routes/managementRoutes.ts, server/modules/externalModels/strategyOntology/__tests__/strategyTemplateDiagnostics.test.ts, server/routes/__tests__/managementRoutes.test.ts
- **Validation:** Targeted strategy ontology/Management Jest suites passed; git diff check passed; full typecheck still reports pre-existing repo-wide errors outside touched files, with no touched-file matches after filtering.
- **Notes:** Template selection remains disabled and future-contract inputs remain diagnostic-only until governed artifacts supply them.

### 2026-06-14 — Codex: Phase 3B Strategy Context Management diagnostics
- **What changed:** Added a read-only Strategy Context model-signal card to Management diagnostics, sourced from `management_strategy_context`, with fail-closed unavailable copy when context is absent.
- **Files modified:** `client/src/pages/TiberManagementDashboard.tsx`, `client/src/__tests__/managementModelSignals.test.ts`
- **Validation:** `npm run test -- client/src/__tests__/managementModelSignals.test.ts` passed; `git diff --check` passed; `npm run typecheck` still fails from pre-existing unrelated repo-wide TypeScript errors outside touched files.
- **Notes:** Phase 3B remains visibility-only: no strategy template selection, template rendering, slot interpolation, advice output, or Team Direction recalculation.

### 2026-08-02 — Codex: W6 FORGE G6 Team Direction freshness enforcement
- **What changed:** Added `team_direction_forge_player_static_freshness_v1`, evaluated from root `generated_at` on every Team Direction request with an inclusive 45 elapsed UTC-day limit. Rejected clocks fail classification closed with uncertain/low output and zero eligible FORGE coverage while a shared versioned receipt preserves raw evidence for diagnostics, Management UI, and agent export.
- **Files modified:** FORGE static adapter/types, Management freshness policy and activation diagnostics, Team Direction route/classifier, Management dashboard/export, focused tests, and operator docs.
- **Validation:** Focused adapter/policy/diagnostics/route/UI Jest suites; build; filtered typecheck review; diff check. Full results are recorded in the draft PR.
- **Notes:** Root `promoted_at` is diagnostic only. Artifact bytes, scoring and direction thresholds, G4/#277, FC1/#291, databases, auth, and deployment remain unchanged.

### 2026-08-03 — Codex: Management G6 mounted-receipt expiry review fix
- **What changed:** Made the Management client re-evaluate an accepted FORGE G6 receipt through its exact inclusive `acceptedThrough` boundary, fail closed at boundary + 1 ms, and issue one deduplicated Team Direction refetch on expiry or focus/visibility recovery. UI diagnostics, copy/download exports, and agent-readable snapshots immediately become uncertain/low with zero eligible FORGE coverage while preserving the immutable raw receipt.
- **Files modified:** `client/src/pages/TiberManagementDashboard.tsx`, `client/src/__tests__/managementForgeFreshnessExpiry.test.ts`, `client/src/__tests__/managementModelSignals.test.ts`, `.claude/context-log.md`, `.claude/agents/codex.md`.
- **Validation:** Six focused Management/FORGE Jest suites passed (133 tests); server and Vite production builds passed; `git diff --check` passed. Repository typecheck still reports 505 pre-existing errors, with zero matches in the touched page/tests.
- **Notes:** Cached Alpha reasons, blockers, scored-position diagnostics, and stale classification failures cannot leak into the locally rejected verdict/export. No backend policy, artifact bytes, scoring/direction thresholds, database, auth, or deployment behavior changed.

### 2026-08-05 — Codex: Data Lab SQL parameterization
- **What changed:** Replaced caller-derived raw SQL fragments in the shared xFPTS service and legacy Data Lab router with Drizzle-bound parameters. Added compiled-query coverage for the mounted anonymous `/usage-agg` path plus a raw-template regression guard.
- **Files modified:** `server/services/xFptsService.ts`, `server/routes/dataLabRoutes.ts`, `server/services/__tests__/xFptsSqlSafety.test.ts`
- **Validation:** Focused security suite passed (6 tests); production build passed with the existing OLC duplicate-member warning; repo test run executed 850 tests successfully with six unrelated baseline suite-load failures; repo typecheck retained 505 existing errors with zero changed-file matches; `git diff --check` passed.
- **Notes:** Production mounts `server/modules/datalab/snapshots/snapshotRoutes.ts`, whose local request filters were already parameterized; the live defect was its call into `getAggregatedExpectedFantasy()`. The unmounted legacy router was hardened to prevent remount regression. No API response, schema, or deployment change.

### 2026-08-09 — Codex: Observatory human-readable workflow redesign
- **What changed:** Reordered the Observatory around a two-step note-inspection workflow, replaced the light output-card stack with a consistent dark review surface, shortened primary copy, removed the preloaded example note, and grouped output around detection, follow-up, handoff, and uncertainty questions. Moved guardrails, exports, raw JSON, provenance, declared system roles, and repo boundaries into progressive disclosures. Removed unmeasured static status labels from declared systems.
- **Files modified:** `client/src/pages/StressLab.tsx`, `client/src/__tests__/stressLab.test.ts`.
- **Validation:** Focused Observatory Jest suite passed (22 tests); full production build passed with the existing OLC duplicate-member warning; `git diff --check` passed. Repo-wide typecheck still reports the established unrelated error backlog and reported no error in `StressLab.tsx`.
- **Notes:** The deterministic client-side heuristic, single read-only Teamstate Movement status request, unavailable-state handling, export formats, routes, and no-mutation boundary are unchanged.

### 2026-08-12 — Codex: Observatory current-main integration and accessibility hardening
- **What changed:** Integrated current `main` into the Observatory branch, preserved the empty-note disabled state while adopting the governed Ember button pairing, repaired dark-surface outline buttons and muted-text/field contrast, cleared stale review output whenever its source note changes, and added semantic headings plus live status announcements.
- **Files modified:** `client/src/pages/StressLab.tsx`, `client/src/__tests__/stressLab.test.ts`, and append-only agent logs.
- **Validation:** Observatory, contrast, and outline-button suites passed 85/85; `sh build.sh` passed with the existing OLC duplicate-member and bundle-size warnings; typecheck retained the exact 505-diagnostic repository baseline with no Stress Lab/Observatory diagnostic; staged/unstaged `git diff --check` passed.
- **Notes:** Effective product scope remains the same deterministic read-only Observatory workflow and one Teamstate status read. No model, ranking, projection, write path, readiness, or deployment behavior changed.
### 2026-08-09 — Codex: Rankings v2 canonical identity boundary corrections
- **What changed:** Made ranking identity resolution source-aware and duplicate/outage fail-closed, versioned the canonical-only nullable `playerId` contract, enforced coherent identity states on server and client, added an independent UI link guard and composite row key, and replaced the player-route stand-in with a mounted HTTP regression.
- **Files modified:** Rankings v2 contract/route/client mapper and page, `PlayerIdentityService`, the ranking identity resolver, identity policy/architecture docs, `replit.md`, and focused server/client tests.
- **Validation:** Eight focused Jest suites passed (152 tests, `--coverage=false`); production build passed with the existing OLC duplicate-member warning; typecheck retained 505 reviewed-head diagnostics with zero new touched-file diagnostics; `git diff --check` passed.
- **Notes:** No `DATABASE_URL` was available. Database-wide GSIS census, uniqueness migration, and production coverage activation remain explicit operator gates; unresolved/outage rows stay visible and non-linkable.

### 2026-08-12 — Codex: FORGE cache-audit governed Markdown verification
- **What changed:** Bound the report's §3 identity, §4.3 bounds/clamping, and §5.2 comparison claims to their manifest evidence through one bounded, fence-aware Markdown tokenizer. Exact section/table/schema/row rules now reject duplicate, hidden, malformed, decorated, container-nested, or qualitatively contradictory claims while preserving valid reordered tables and the report's bounded bold/code presentation.
- **Files modified:** `scripts/audit/forgeCacheAuditClaims.ts`, `scripts/audit/forgeCacheAudit.ts`, `scripts/audit/__tests__/forgeCacheAudit.test.ts`, and the explicit §3 table header in `docs/audits/2026-08-09-railway-forge-cache-audit.md`.
- **Validation:** Focused audit Jest suite passed 190/190; an independent finite replay rejected all 33 previously identified structural bypass probes while accepting seven inert-code controls; full branch run passed 119 suites/1,240 tests with the same seven baseline suite failures as the pre-change head (119 suites/1,165 tests); real `node --import tsx scripts/audit/forgeCacheAudit.ts --check` passed; build passed with the baseline OLC warning; typecheck stayed identical at 505 diagnostics with no changed-file matches; `git diff --check` passed; frozen cohort, manifest, and static artifact remained unchanged; cohort SHA-256 remained `118c5cc60bc59c6f3b9ca8d35ebcce4cf4e4442adacbb72fa77fd5109204f106`.
- **Notes:** The tokenizer deliberately fails closed on unsupported CommonMark/HTML constructs rather than claiming full Markdown parsing. No runtime, deployment, readiness, artifact-manifest, or frozen-cohort mutation was made.

### 2026-08-12 — Codex: FORGE cache-audit §5.2 narrative binding
- **What changed:** Bound the report's one exact-agreement narrative sentence to the manifest's `exactAgreement` and `joinedRows` fields and reject additional visible prose using the same narrow `artifacts agree exactly on` root. The bounded scan reuses the existing fence, indent, container, table, and inline-presentation rules and does not claim general Markdown or natural-language contradiction parsing.
- **Files modified:** `scripts/audit/forgeCacheAuditClaims.ts`, `scripts/audit/__tests__/forgeCacheAudit.test.ts`, `docs/audits/2026-08-09-railway-forge-cache-audit.md`, `.claude/context-log.md`, `.claude/agents/codex.md`.
- **Validation:** Focused audit Jest suite passed 196/196, including the exact `none` → `all` mutation with both §5.2 tables intact, manifest-count variation, same-root contradictions, bounded inline presentation, reference-link/strikethrough fail-closed cases, and fenced/indented inert controls. Real `node --import tsx scripts/audit/forgeCacheAudit.ts --check` and `git diff --check` passed. Frozen cohort, manifest, and static artifact remained byte-unchanged at SHA-256 `118c5cc60bc59c6f3b9ca8d35ebcce4cf4e4442adacbb72fa77fd5109204f106`, `8b317b1376ab2ae18f06137730730968efa36f053e43e294b57053f13a58df7a`, and `de0e2c19a7054653c460b9b8597b620d37084b5407d035afb97310c694cd1cf9` respectively.
- **Notes:** Audit/report/tests/logs only. No runtime, deployment, artifact, manifest, frozen-cohort, PR metadata, review-thread, or Git history mutation was made.

### 2026-08-12 — Codex: FORGE cache-audit rendered narrative boundaries
- **What changed:** Replaced the narrow §5.2 narrative block scanner with pinned Marked GFM lexing so paragraph/heading/list/blockquote/Setext/thematic-break/fence boundaries follow rendered Markdown rather than a second custom block parser. Visible inline text is collected with context-correct HTML5 entity decoding, including whole-attribute image-alt semantics; tables and code remain inert, while image alt text and strikethrough cannot satisfy the sole governed sentence.
- **Files modified:** `package.json`, `package-lock.json`, `scripts/audit/forgeCacheAuditClaims.ts`, `scripts/audit/__tests__/forgeCacheAudit.test.ts`, `.claude/context-log.md`, `.claude/agents/codex.md`.
- **Validation:** Focused audit Jest suite passed 246/246; real `node --import tsx scripts/audit/forgeCacheAudit.ts --check`, production build, and `git diff --check` passed; typecheck retained the 505-diagnostic repository baseline with no audit-file matches. Two independent read-only audits replayed the accumulated Markdown adversarial corpus; the final audit also matched 768 ordinary-inline and 832 image-alt combinations against actual Marked/DOM-visible root detection one-for-one. Frozen cohort, manifest, and static artifact stayed byte-unchanged at SHA-256 `118c5cc60bc59c6f3b9ca8d35ebcce4cf4e4442adacbb72fa77fd5109204f106`, `8b317b1376ab2ae18f06137730730968efa36f053e43e294b57053f13a58df7a`, and `de0e2c19a7054653c460b9b8597b620d37084b5407d035afb97310c694cd1cf9`.
- **Notes:** `marked` is pinned to `15.0.12` and `entities` to `4.5.0` as development-only audit dependencies; lockfile churn is limited to the root declarations and the new Marked package entry. No report, runtime, deployment, readiness, or governed-artifact mutation.

### 2026-08-12 — Codex: FORGE static comparison evidence admission
- **What changed:** Bound the static side of the cache-audit comparison to strict, finite rows whose raw `provenance.score_source` is `player_specific`. Baseline, fallback, unknown, missing-provenance, and malformed-alpha rows can no longer create an identifier intersection or enter §5.2 numeric comparisons. Duplicate artifact IDs fail the comparison closed before evidence selection, matching the promoted adapter.
- **Files modified:** `scripts/audit/forgeCacheAuditClaims.ts`, `scripts/audit/forgeCacheAudit.ts`, `scripts/audit/__tests__/forgeCacheAudit.test.ts`, `.claude/context-log.md`, `.claude/agents/codex.md`.
- **Validation:** Focused audit suite passed 262/262; full branch run passed 119 suites/1,313 tests with the same seven baseline suite failures; real `node --import tsx scripts/audit/forgeCacheAudit.ts --check`, build, and `git diff --check` passed; typecheck remained at the 505-diagnostic baseline with no audit-file matches. An independent read-only audit found no remaining blocker.
- **Notes:** All-static namespace/name/baseline diagnostics remain visible but separate from evidence admission. The committed cohort, manifest, report, and static artifact stayed byte-unchanged; their SHA-256 values remain `118c5cc60bc59c6f3b9ca8d35ebcce4cf4e4442adacbb72fa77fd5109204f106`, `8b317b1376ab2ae18f06137730730968efa36f053e43e294b57053f13a58df7a`, `df51e8471de44eadf8a8e32a37b2f1f8bc9c66842ae091cba29aa57d50ed176c`, and `de0e2c19a7054653c460b9b8597b620d37084b5407d035afb97310c694cd1cf9`. No runtime, deployment, readiness, or governed-artifact mutation.

### 2026-08-12 — Codex: FORGE static comparison canonical-ID spelling
- **What changed:** Matched cache-audit duplicate detection to the promoted adapter's trimmed identity key, so raw IDs that differ only by surrounding whitespace cannot evade `duplicate_ids`. The audit still refuses to normalize upstream evidence silently: every whitespace-bearing ID is independently blocking and excluded from the comparison.
- **Files modified:** `scripts/audit/forgeCacheAuditClaims.ts`, `scripts/audit/__tests__/forgeCacheAudit.test.ts`, `.claude/context-log.md`, `.claude/agents/codex.md`.
- **Validation:** Focused audit suite passed 266/266; full branch run passed 119 suites/1,321 tests with the same seven baseline suite failures; real `node --import tsx scripts/audit/forgeCacheAudit.ts --check`, build, and `git diff --check` passed; typecheck remained at the 505-diagnostic baseline with no audit-file matches.
- **Notes:** Regressions cover canonical-plus-whitespace baseline and invalid-alpha twins, a lone whitespace-bearing evidence ID, and a whitespace-only ID. Cohort, manifest, report, and static artifact remained byte-unchanged at their pinned SHA-256 values.

### 2026-08-12 — Codex: FORGE static comparison adapter-ID aliases
- **What changed:** Extended artifact-wide comparison validity to the promoted adapter's exact player-ID key precedence (`player_id`, `playerId`, canonical aliases, then TIBER aliases). Every row now contributes its first adapter-resolvable trimmed ID to duplicate diagnostics, while missing IDs block explicitly; evidence admission remains deliberately stricter and still requires canonical raw `player_id`.
- **Files modified:** `scripts/audit/forgeCacheAuditClaims.ts`, `scripts/audit/forgeCacheAudit.ts`, `scripts/audit/__tests__/forgeCacheAudit.test.ts`, `.claude/context-log.md`, `.claude/agents/codex.md`.
- **Validation:** Focused audit suite passed 294/294 and promoted-adapter suite 11/11; full branch run passed 119 suites/1,349 tests with the same seven baseline suite failures; real `--check`, build, and diff check passed; typecheck remained at 505 baseline diagnostics with no audit-file matches.
- **Notes:** Alias-only rows participate in artifact collision/validity checks but cannot enter the strict raw comparison. Regressions cover all aliases, precedence, empty/non-string skipping, malformed/missing rows, eligible/non-evidence collisions, Unicode trim parity, and ignored lower-precedence aliases. Governed artifact bytes and hashes remain unchanged.

### 2026-08-12 — Codex: FORGE static comparison row-container parity
- **What changed:** Moved promoted-artifact row-container selection into the pure comparison plan using the runtime adapter's exact first-array precedence: `rows`, then `players`, then `data`. Empty selected arrays and missing/invalid containers now block explicitly; `auditComparability()` consumes the plan's exact selected rows for every static diagnostic and the strict evidence comparison.
- **Files modified:** `scripts/audit/forgeCacheAuditClaims.ts`, `scripts/audit/forgeCacheAudit.ts`, `scripts/audit/__tests__/forgeCacheAudit.test.ts`, `.claude/context-log.md`, `.claude/agents/codex.md`.
- **Validation:** Focused audit suite passed 311/311 and promoted-adapter suite 11/11; full branch run passed 119 suites/1,366 tests with the same seven baseline suite failures; real `--check`, build, and diff check passed; typecheck remained at 505 baseline diagnostics with no audit-file matches.
- **Notes:** Tests pin all three containers, precedence, non-array fallthrough, terminal empty arrays, invalid roots, malformed selected rows, ignored lower-container diagnostics, and alias collision/strict evidence behavior in `players` and `data`. This is row-container parity only; stricter raw evidence admission remains deliberate. Governed artifacts remain byte-identical.

### 2026-08-12 — Codex: FORGE static comparison runtime-admission parity
- **What changed:** Extracted the promoted FORGE static artifact's digest and declared ID/version admission rules into one pure contract shared by the runtime client, runtime adapter, and offline audit. The comparison plan now preserves runtime order: a present `content_digest` must bind a canonical root `rows` array, then the existing declared ID/version gate must pass, then row-container selection may run. Any failed gate blocks all rows without throwing or falling through to `players`/`data`; digest-free legacy container behavior is unchanged.
- **Files modified:** `server/modules/externalModels/forge/forgePlayerStaticArtifactContract.ts`, `server/modules/externalModels/forge/forgePlayerStaticClient.ts`, `server/modules/externalModels/forge/forgePlayerStaticAdapter.ts`, their focused tests, `scripts/audit/forgeCacheAuditClaims.ts`, `scripts/audit/__tests__/forgeCacheAudit.test.ts`, and agent logs.
- **Validation:** Focused audit suite passed 334/334; promoted adapter plus digest-client suites passed 26/26; full branch run passed 119 suites/1,398 tests with the same seven baseline suite failures; real committed-artifact `--check`, production build, and `git diff --check` passed (build retains the baseline duplicate-member warning); typecheck retained the exact 505-diagnostic baseline with zero touched-file matches. An independent read-only differential audit found zero admission mismatches across 25,000 JSON-round-tripped adversarial artifacts.
- **Notes:** Regressions pin valid/malformed/missing/mismatched digests, lowercase digest syntax, canonicalization failure, lower-container non-rescue, digest-free fallback, non-object warning behavior, ID/version broad legacy acceptance, alias precedence, nullish metadata chains, and manifest-over-meta-over-root merging. Cohort, manifest, report, and bundled static artifact remain byte-identical at SHA-256 `118c5cc60bc59c6f3b9ca8d35ebcce4cf4e4442adacbb72fa77fd5109204f106`, `8b317b1376ab2ae18f06137730730968efa36f053e43e294b57053f13a58df7a`, `df51e8471de44eadf8a8e32a37b2f1f8bc9c66842ae091cba29aa57d50ed176c`, and `de0e2c19a7054653c460b9b8597b620d37084b5407d035afb97310c694cd1cf9`.
### 2026-08-12 — Codex: Rankings v2 Rev16 season/cache honesty corrections
- **What changed:** Made every resolved phase/default week an exact cache question, preserved truthful phase-default versus explicit origins, rejected substituted or mismatched cache rows, nulled stale/no-target live metadata, enforced a complete `no_rankable_source` envelope, and rendered a safe cache-rejection explanation instead of “not computed” copy.
- **Files modified:** Rankings v2 route/contract/FORGE cache, Tiber Tiers mapper/page, and focused server/client regressions.
- **Validation:** Five focused suites passed (225/225); full branch run passed 125 suites/1288 tests with the same seven baseline suite failures as base (125 suites/1245 tests); build passed with the baseline OLC duplicate-member warning; typecheck remained identical at 505 diagnostics; `git diff --check` passed.
- **Notes:** No contract-version change, merge, deployment, or readiness mutation. Truly weekless historical requests retain newest-cache semantics; stale configured archives remain explicit and truthful.

### 2026-08-12 — Codex: Rankings v2 Rev17 governed ingestion and unavailable-evidence UI corrections
- **What changed:** Added one calendar/phase-aware atomic evidence-ingestion target and moved active cron, Core/Nightly, Bronze, Buys/Sells, nflfastR, adapter, admin, and UPH defaults plus their health/status receipts onto it. No-argument evidence jobs now fail closed during preseason, stale-calendar, or configured-season mismatch states; January rollover keeps football season 2026 paired with Week 17. UPH carries the tuple through Bronze, Silver, Gold, and quality scoring with no 2025 fallback, while forward schedule sync uses a separately named schedule-season resolver. Nightly summary generation now receives the atomic target instead of reversible numeric arguments. Sleeper ownership events use a distinct phase-aware source-observed target so real preseason roster changes retain honest 2026 Week 1 attribution, and SeasonService's last wall-year fallback was replaced without changing its primary API/database observations. Dashboard fallback narrative now obeys snapshot availability, and Tiers research links use validated response evidence/decision season or omit the parameter.
- **Files modified:** Season configuration/week observability, active ingestion crons/adapters/ETLs/routes/UPH services, season-fact quality logic, Data Lab/Tiers UI, source tripwires, and focused server/client regressions.
- **Validation:** Final focused replay passed 17 suites/333 tests plus API smoke 7/7; full branch run passed 134 suites/1,365 tests versus 125 suites/1,288 at the exact pre-change head, with the identical seven baseline suite failures; build passed with the existing OLC duplicate-member warning; typecheck remained exactly 505 diagnostics on both heads; `git diff --check` passed.
- **Notes:** Fully explicit archive pairs remain supported; half-explicit pairs cannot borrow the live half. Legacy numeric week/season fields keep their rolling-compatible shape, while additive evidence/resolved-presentation fields fail closed. No merge, deployment, readiness change, database write, or Forecast work occurred.

### 2026-08-12 — Codex: NFLfastR completed-archive weekly sync compatibility
- **What changed:** Restored season-only `POST /api/weekly/sync` support for the completed 2024 NFLfastR archive through an immutable producer-local Week 18 bound. The mounted handler and direct service now share that resolver; configured live seasons still use elapsed calendar evidence, unsupported seasons fail closed, and no-argument preseason/stale behavior remains governed and unavailable rather than inventing Week 1.
- **Files modified:** `server/ingest/nflfastr.ts`, `server/ingest/nflfastrSeasonBounds.ts`, `server/routes.ts`, `server/routes/weeklySyncRoute.ts`, and focused service/HTTP regressions.
- **Validation:** Five focused Jest suites passed (71/71); a local curl against the mounted handler returned the expected 2024 season-only success; server build passed with the existing OLC duplicate-member warning; typecheck retained the exact 505-diagnostic baseline with zero touched-file matches; `git diff --check` passed.
- **Notes:** The global presentation calendar remains limited to configured live seasons. Only the explicitly supported, completed 2024 NFLfastR archive receives the fixed Week 18 terminal bound; explicit live 2026 preseason resolves to zero elapsed weeks, and future/unknown season-only requests return 400.

### 2026-08-12 — Codex: Bronze-to-Silver season-wide default restoration
- **What changed:** Restored the mounted `/api/etl/bronze-to-silver` omission contract: when no week is supplied, it resolves the governed/default season but leaves the Bronze query week undefined so the operation remains season-wide. Explicit seasons—including archives—remain season-wide, explicit weeks remain exact, and omitted preseason/stale defaults still fail closed before service access.
- **Files modified:** `server/routes/etlRoutes.ts`, the mounted ingestion-route regressions, and a direct Bronze query-builder regression.
- **Validation:** Five focused ingestion/config/service suites passed (69/69); server build passed with the existing OLC duplicate-member warning; typecheck retained the exact 505-diagnostic baseline, including the same four pre-existing `etlRoutes.ts` missing-module diagnostics and no new test-file diagnostics; `git diff --check` passed.
- **Notes:** `processAll` now removes only the limit while preserving the season-wide scope. Nearby Core, Nightly, Buys/Sells, Bronze-ingest, and full-pipeline paths remain weekly by design; Bronze status already queries its governed season without a week filter.

### 2026-08-12 — Codex: Automated derived-writer target isolation
- **What changed:** Stopped Intelligent Scheduler and admin brand writers from treating `SeasonService.current()` database observations as operator-explicit evidence targets. Weekly, incremental, brand-recompute, and all-implicit admin streaming actions now resolve one governed season/week tuple and reuse it for writes, exact result queries, and receipts. Admin replay resolves its requested pair before any force delete, so matching live season-only requests use the governed week, explicit archive pairs remain exact, and mismatched half-pairs fail with 400. The active RB context cron and write-capable brand rollover path also resolve governed evidence targets directly. Freshness/status readers retain source-observed SeasonService behavior.
- **Files modified:** Intelligent Scheduler, AdminService and mounted admin-brand handlers, BrandSignalsIntegration, RB context cron, admin schema copy, governed-import/SeasonService regressions, and new scheduler/admin/brand-rollover/RB-cron boundary suites.
- **Validation:** Seven focused suites passed (86/86); the full branch run passed 141 suites/1,416 tests with the same seven baseline suite failures; server build passed with the existing OLC duplicate-member warning; typecheck retained the 505-diagnostic baseline with no new touched-file diagnostics (the same eight pre-existing `server/routes.ts` diagnostics shifted only by handler extraction); `git diff --check` passed.
- **Notes:** January 5, 2027 automated writers resolve football season 2026 Week 17 even when the newest stored observation is 2025 Week 18. August 2026 preseason and post-calendar clocks fail before evidence mutation. Fully explicit replay archives remain usable even beyond the configured calendar. `BrandSignalsIntegration.checkWeekRollover()` is write-capable through `DATASET.ROLL_WEEK`, although no production bootstrap caller was found in the current static call graph; its fallback path is governed to prevent a future activation from restoring stale attribution.

### 2026-08-12 — Codex: FORGE cache-audit Rankings v2 week-metadata alignment
- **What changed:** Updated the live-response guard to consume one anchored, closed current Rankings v2 FORGE source-note grammar and require both `decisionTargetWeek` and `cacheDeclaredAsOfWeek` to match the audit's requested Week 18 before admitting any rows. The exact two-entry cache/confidence source stack, closed fallback-reason vocabulary, canonical observation time, nonempty same-position item set, and structured decision/evidence season metadata are governed too. The superseded bare `asOfWeek` spelling now fails closed rather than standing in for source-declared cache scope.
- **Files modified:** `scripts/audit/forgeCacheResponseGuard.ts`, `scripts/audit/__tests__/forgeCacheAudit.test.ts`, `server/routes/__tests__/rankingsV2Routes.test.ts`, `.claude/context-log.md`, `.claude/agents/codex.md`.
- **Validation:** Focused audit and real Rankings route suites passed 387/387 (audit 380, route 7); real committed-artifact `node --import tsx scripts/audit/forgeCacheAudit.ts --check` passed; server build passed with the existing OLC duplicate-member warning; `git diff --check` passed.
- **Notes:** Regressions independently reject mismatched scope fields, prefixed/duplicated keys, suffix junk, extra tokens, missing/unknown fallbacks, wrong/additional producer layers, contradictory/missing structured metadata, missing/empty/mixed-position items, invalid timestamps, and the old bare-week fixture. The frozen cohort, manifest, report, and bundled static artifact remain byte-identical at their pinned SHA-256 values.

### 2026-08-12 — Codex: FORGE cache-audit source-clock evidence gate
- **What changed:** Made the fresh-observation guard reject nonempty Rankings v2 cache responses whose admitted cache `computedAt` is unavailable. The primary FORGE source, confidence companion, top-level response, `seasonMeta.generatedAt`, and `trust.asOf` must now carry the same canonical cache-evidence timestamp; their freshness copy must also identify `computedAt`, so a synthesized response clock cannot be recorded as cache evidence time.
- **Files modified:** `scripts/audit/forgeCacheResponseGuard.ts`, `scripts/audit/__tests__/forgeCacheAudit.test.ts`, `server/routes/__tests__/rankingsV2Routes.test.ts`, `.claude/context-log.md`, `.claude/agents/codex.md`.
- **Validation:** Focused audit plus real Rankings route suites passed 415/415. The real route regression proves a valid nonempty response with `computedAt: null` retains nullable source clocks and fallback copy for UI compatibility but is refused by the audit guard. Real `--check`, build, diff, and frozen hashes were re-verified.
- **Notes:** Regressions cover missing/null/invalid/noncanonical and mismatched primary, companion, response, season-metadata, and trust clocks, plus fallback freshness copy. Runtime response behavior is unchanged; this is a stricter observation-admission boundary only.

### 2026-08-12 — Codex: FORGE cache-audit per-item source-clock binding
- **What changed:** Extended the fresh-observation guard from the response envelope to every admitted Rankings v2 item. Each row must carry an object-valued `trust`, a canonical `trust.asOf`, and exact equality with the primary FORGE cache source clock; one divergent row rejects the entire position capture with an indexed error.
- **Files modified:** `scripts/audit/forgeCacheResponseGuard.ts`, `scripts/audit/__tests__/forgeCacheAudit.test.ts`, `server/routes/__tests__/rankingsV2Routes.test.ts`, `.claude/context-log.md`, `.claude/agents/codex.md`.
- **Validation:** Focused audit and real Rankings route suites passed 425/425. The admitted real-route branch proves every item repeats the source clock; the `computedAt: null` route proves synthetic item/response agreement cannot rescue a missing envelope source clock. Real `--check`, build, diff, and frozen hashes were re-verified.
- **Notes:** Regressions cover missing/null/non-object trust envelopes, missing/null/invalid/noncanonical item clocks, a single divergence, and a mixed list whose second row diverges. Public Rankings v2 schema compatibility is unchanged; this is deliberately stricter fresh-observation admission.

### 2026-08-26 — Codex: Public redraft Draft Review pilot
- **What changed:** Added a state-isolated `/draft-review` doorway and `/api/draft-review` context compiler for exact public Sleeper roster URLs. The pilot exposes observed roster/draft state, deterministic construction, an agent context export, and explicit unavailable Forecast state without FFC ADP or advice.
- **Files modified:** `client/src/pages/TiberDraftReview.*`, `client/src/App.tsx`, `client/src/components/TiberLayout.tsx`, `server/modules/draftReview/`, `server/routes/draftReviewRoutes.ts`, `server/integrations/sleeperClient.ts`, `server/index.ts`, `README.md`, `replit.md`.
- **Validation:** Focused Draft Review Jest tests passed 2/2; an external live Sleeper roster resolved as a 10-team full-PPR redraft with 15 current players and 15 draft picks; deployment-equivalent build passed with the existing OLC duplicate-member warning; diff check passed. Repo-wide typecheck retained existing `server/routes.ts` diagnostics and reported no new Draft Review/client file diagnostics.
- **Notes:** Forecast remains deliberately unavailable until a governed redraft projection artifact is connected. No database, auth, shared user context, FFC refresh, ranking, or transaction behavior was added.

### 2026-08-26 — Codex: Draft Review public-boundary repair
- **What changed:** Repaired all five exact-head P2 findings on PR #343: bounded every Sleeper request with a timeout, deduplicated concurrent cold player-directory reads, made QB/TE geometry flex-aware, carried the queried draft-picks endpoint in provenance, and rendered explicit unavailable draft evidence. Tightened the public pilot with strict HTTPS Sleeper roster-link parsing, no-store and sanitized error responses, removal of unnecessary owner IDs, a route-specific rate limit, and an agent-packet instruction that treats public display strings as untrusted data.
- **Files modified:** `server/integrations/sleeperClient.ts`, `server/middleware/rateLimit.ts`, `server/modules/draftReview/`, `server/routes/draftReviewRoutes.ts`, `server/routes/__tests__/draftReviewRoutes.test.ts`, `client/src/pages/TiberDraftReview.*`, and agent logs.
- **Validation:** Focused Draft Review/service and HTTP route tests passed 6/6; the external live roster still resolved 15 current players, 15 original picks, redraft mode, full provenance, one flex-aware QB surplus flag, and explicit unavailable Forecast. `sh build.sh`, `npm run build`, and `git diff --check` passed. Typecheck retained repository baseline diagnostics with no touched-file matches. Full Jest ran 162 suites: 156 passed, six unrelated existing transform/runtime suites failed, while all 2,002 collected tests passed.
- **Notes:** `npm audit --audit-level=high` reports the repository's existing dependency backlog (44 advisories: 3 low, 15 moderate, 23 high, 3 critical); no dependency changed in this PR and no broad automatic upgrade was attempted. No database, shared Management/default-user state, FFC, Forecast activation, player evaluation, or transaction behavior was added.

### 2026-08-27 — Codex: Draft Review v0.1 public operator entry
- **What changed:** Expanded the blank `/draft-review` doorway to accept a numeric Sleeper league ID or exact public league, draft, or roster URL, with a minimal public roster selector for inputs that do not identify one roster. Versioned the compiled packet to `tiber_draft_review_v0_1`; added normalized scoring, reserve capacity/rules, exact unfilled-starter and bench-capacity flags, bounded complete-board evidence, draft timer/native slot/turn distance, and explicit unavailable current-eligibility, bye-week, and Forecast states. Added request-race protection and mobile selector polish. Tightened the public boundary with typed error classification, route security headers, control/bidi stripping, identifier/collection/serialized-payload caps, no owner IDs, a 24-hour deduplicated player cache disclosure, and an unref'd legacy cleanup timer so focused tests exit naturally.
- **Files modified:** `client/src/pages/TiberDraftReview.*`, `server/integrations/sleeperClient.ts`, `server/middleware/security.ts`, `server/modules/draftReview/`, `server/routes/draftReviewRoutes.ts`, `server/routes/__tests__/draftReviewRoutes.test.ts`, `README.md`, `replit.md`, and agent logs.
- **Validation:** Focused Draft Review compiler/route suites passed 11/11 and exited normally; deployment-equivalent `sh build.sh` passed with the existing OLC duplicate-member warning; `git diff --check` passed; repo-wide typecheck retained existing unrelated diagnostics with no touched-file matches. Full Jest ran 162 suites: 156 passed, the same six unrelated baseline suites failed to load, and all 2,007 collected tests passed.
- **Notes:** Live pre-final smoke checks resolved an operator-owned 12-team draft input to 12 public roster choices and an external pilot roster to its 10-team redraft context without Management/default-user state. Actual bye weeks, current per-player reserve eligibility, FFC ADP, and redraft Forecast outputs remain explicitly unavailable rather than inferred.

### 2026-08-27 — Codex: Draft Review fixture privacy hygiene
- **What changed:** Replaced a live external roster URL used by the Draft Review parser test with a synthetic identifier and generalized tracked validation notes so they do not retain live external display names, league IDs, or league names.
- **Files modified:** `server/modules/draftReview/__tests__/draftReviewService.test.ts`, `server/modules/draftReview/MODULE.md`, `.claude/context-log.md`, `.claude/agents/codex.md`.
- **Validation:** Focused Draft Review service suite passed 8/8; repository search found no remaining tracked references to the removed live identifiers; `git diff --check` passed.
- **Notes:** Runtime behavior and public packet contents are unchanged. Draft Review fixtures and validation notes now explicitly require synthetic or generic roster identifiers.
### 2026-08-28 — Codex: Public Draft Review containment profile

- **What changed:** Added a fail-closed `public-draft-review` runtime profile. It mounts only health, runtime-profile, Draft Review, and the Draft Review-only SPA shell; the full route graph, migrations, sync, schedulers, integrations, and cron are not loaded. All other API methods/paths receive the same generic 404 before lookup or mutation, and response bodies are not logged in this profile.
- **Files modified:** `server/runtimeProfile.ts`, `server/index.ts`, `server/__tests__/publicDraftReviewProfile.test.ts`, `client/src/App.tsx`, `client/src/components/TiberLayout.tsx`, `.env.example`, and `docs/SECURITY_RUNBOOK.md`.
- **Validation:** Focused runtime/Draft Review/production-routing suites passed 11/11; deployment-equivalent `sh build.sh` passed; repository typecheck retained its existing unrelated diagnostics with no touched-file matches; `git diff --check` passed.
- **Notes:** This is source containment only. No environment was changed and nothing was deployed. Enabling the profile and smoking an exact release SHA remain separately authorized operator actions.
- **Review repairs:** Exact-head review found that the existing service worker could replay cached API responses across a runtime-profile change. All same-origin API GETs—including mixed-case paths that Express treats as API routes—are now network-only with `cache: no-store`; activation removes the legacy dynamic API cache, while only versioned static/document caches remain. The client still fails closed to the public shell if the capability request cannot reach the server. The public-only desktop shell also clears the absent sidebar's content offset.
