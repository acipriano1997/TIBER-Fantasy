# Fantasy Football Command Center — Canonical Ranked Carry-Forward Queue

**Status:** ACTIVE / PERSISTENT  
**As of:** 2026-09-15

This is the durable ranked carry-forward queue for **Fantasy Football Command Center only**. It supersedes fragmented/scattered FFCC work lists while preserving completed evidence. **Do not mix with Football Unwritten.**

## Execution rule

Work the highest-priority unblocked item first. Deferred/frozen work remains **OPEN** until explicitly DONE, REJECTED, or superseded with a pointer. Closing an implementation PR must not silently erase an unfinished underlying obligation.

## Non-negotiable governance

- **CCF-FIRST:** CCF owns primary fantasy decision modeling, feature construction, calibration, uncertainty, recommendation logic, and recommendation authority.
- TIBER may remain only as secondary evidence, benchmark, prior, or challenger; it must never be a critical dependency or silently determine recommendations.
- Preserve point-in-time/as-of provenance, anti-leakage, explicit unavailable states, graceful degradation, immutable decision/evidence ledgers, challenger comparisons, and abstention when evidence is insufficient.
- Local-first development remains authoritative: local filesystem/Git → focused tests → broad tests → local preflight → clean local commit → deliberate GitHub sync/backup.
- **Authority graph:** every recommendation-critical value must be traceable through the Universal Recommendation Authority Graph. A surface cannot claim `CCF_PRIMARY` while any critical path contains TIBER model output, external consensus/projection, market/expert challenger evidence, a legacy heuristic, unknown lineage, or ineligible/stale evidence.
- **Learning discipline:** post-outcome misses must distinguish model error, evidence error, calibration error, decision-policy error, regime change, and irreducible variance. Do not train on regret or treat every loss as model failure.
- **Source-permission discipline:** a terms/license URL is not production permission. A source must explicitly pass intended-use permission and reliability review before it can become recommendation-critical evidence.

---

# Ranked workstreams

## 1. CCF independence from TIBER — **P0 / ACTIVE**

Finish native CCF independence and recommendation authority without relying on TIBER, external consensus, or legacy heuristics. Preserve the TIBER capability-migration registry, TIBER-off certification, native source spine, explicit provenance, fail-closed behavior, and the Universal Recommendation Authority Graph.

### Pressure-test additions now required

1. Structural authority graph checks are implemented for Draft, Lineup/Start-Sit, Waivers, Trades, Keeper, Dynasty, Devy, and Beat Vegas (2026-09-14, PR #25). The generic exact-match trusted-binding gate is implemented locally on 2026-09-15. Genuine operator attestations, per-surface graph extraction, and production enforcement remain **OPEN**; the canonical binding registry stays empty until that evidence exists.
2. Freeze the legacy Start/Sit path as compatibility/challenger-only until native CCF outcome distributions and decision policy replace it.
3. Reclassify TIBER-Forecast IRRIS injury/readiness inference as challenger/reference implementation for FFCC; rebuild/refit recommendation-critical injury/readiness inference inside CCF before native promotion.
4. Audit all open legacy/transition PRs for stale authority semantics so Forecast/FORGE/TIBER-produced inference cannot later be mistaken for CCF-native evidence.
5. Preserve TIBER-Data/source contracts only as evidence/provenance transport where appropriate; keep recommendation-critical derived features and inference under CCF ownership.
6. Require frozen native result-before-challenger comparison so external consensus cannot silently pull CCF toward the crowd.

## 2. Full CCF backtesting & certification — **P0 / FUTURE-GATED, OPEN**

Current state: evaluation infrastructure and leakage-safe native backtest scaffolding exist, but there is not yet a completed frozen production-CCF historical OOS run. Do not invent or backfill performance numbers.

### Required future items

1. Build/freeze the first production-candidate historical dataset with immutable point-in-time source snapshots, parser/version fingerprints, retrieval/known times, and exact scoring-profile identity.
2. Define and freeze **CCF Baseline 1.0** before final evaluation, including supported player population and test windows.
3. Run chronological / rolling-origin out-of-sample evaluation with no future leakage.
4. Compare every candidate against CCF-owned simple baselines (historical mean, recent mean, usage-rate baseline) and retain TIBER only as challenger evidence.
5. Persist versioned comparable results in the append-only backtest progression ledger; never overwrite old runs.
6. Require apples-to-apples identity before claiming improvement: same protocol version, scoring-profile hash, supported population, test window, and dataset fingerprint.
7. Track at minimum: MAE, RMSE, Spearman/Kendall ranking quality, interval/quantile coverage, Brier/log-loss where applicable, lineup regret, and abstention/selectivity.
8. Produce calibration/reliability reports for median, intervals, boom/bust probabilities, and subgroup coverage.
9. Run subgroup stability by position, season/week band, scoring format, role tier, and injury/readiness context where sample size permits.
10. Run simple-baseline and candidate-vs-baseline paired comparisons with uncertainty/confidence intervals where practical.
11. Run feature-family ablations so improvements can be attributed rather than assumed.
12. Run adversarial anti-leakage tests for late injuries, depth-chart changes, corrected stats, closing lines, season-end aggregates, and revised source files.
13. Run full **TIBER-OFF** replay: CCF must operate natively or explicitly abstain; no silent fallback.
14. Preserve failed candidates and negative results in history rather than retaining only winners.
15. Predeclare model-promotion thresholds before looking at final holdout results to avoid threshold fishing.
16. Add decision-level outcome evaluation, including feasible-alternative lineup regret, not just player prediction error.
17. Once enough frozen runs exist, maintain a longitudinal CCF progression report showing which model/version changes helped, hurt, or did nothing under comparable conditions.
18. Persist the reconciliation classification for meaningful misses (`model_error`, `evidence_error`, `calibration_error`, `decision_policy_error`, `regime_change`, `irreducible_variance`) and use it for diagnosis rather than automatically updating the model after every bad outcome.

### Promotion condition

Do **not** call CCF predictive performance certified, fully backtested, or `CCF_PRIMARY` until a production-native candidate completes the frozen historical OOS protocol and satisfies the predeclared calibration, stability, baseline-beating, leakage, and TIBER-off gates.

## 3. Information Bank gap audit — **P1 / OPEN**

Continue coverage audit, provenance hardening, empirical-gap closure, and source-quality/freshness tracking without widening simulation/model authority prematurely.

## 4. Expert Signal Engine — **P1 / OPEN**

Ingest permitted/licensed expert evidence with strict as-of provenance; learn reliability by season/position/signal type; deduplicate echoed signals; preserve rationale mechanisms; score frozen expert calls afterward. Expert evidence remains challenger/secondary only. Freeze the native CCF result before expert comparison; expert agreement must not automatically increase native confidence.

## 5. Weather Intelligence System — **P1 / OPEN**

Advance from native weather evidence contract to live ingestion, immutable historical archive, source/provider evaluation, empirically learned fantasy-impact mechanisms, and point-in-time certification. No hand-set fantasy weighting promoted without evidence. Keep source/venue/roof facts separable from CCF-owned provider reconciliation, player sensitivity, uncertainty, and recommendation effects.

## 6. Injury & Recovery Intelligence — **P1 / ACTIVE FOUNDATION, OPEN**

The CCF-native evidence, source-binding, raw-archive, candidate-audit, and historical-validation foundations are implemented on stacked branch `ccf/injury-recovery-intelligence-v0`. They keep Football Unwritten separate and do not activate recommendation authority.

### Implemented foundation

1. `ccf-injury-recovery-evidence-v1` separates structural recovery, participation, workload, performance, conditioning/ramp, and setback context.
2. Evidence preserves `asOf`/`knownAt`, raw trace, source class, CONFIRMED/REPORTED/OBSERVED/SPECULATIVE-equivalent status, explicit model treatment, unavailable state, and recheck metadata.
3. Return stages distinguish participation, football, expected workload, and previous performance; active status alone cannot establish prior-performance restoration.
4. Recovery assessment authority is CCF-native only; external/TIBER/IRRIS/expert inference remains challenger evidence.
5. Source credibility is represented as an ordinal audit hierarchy without unvalidated numeric weights.
6. Observed workload changes can be compared deterministically without claiming medical causality or assigning reinjury probability.
7. Legacy Start/Sit `injuryTag` logic and legacy consensus fixed injury profiles are explicitly non-authoritative for CCF.
8. `ccf-recovery-source-binding-v1` now requires provider/product identity, license/terms reference, explicit intended-use permission status, parser identity, archived point-in-time support, archive strategy, raw traceability, reliability-review reference plus explicit reliability pass status, and source authority before production eligibility.
9. Permission states now distinguish `unreviewed`, `evaluation_only`, `conflicted`, `permitted_for_intended_use`, and `prohibited`; a terms URL cannot satisfy the permission gate by itself.
10. Reliability states distinguish `unreviewed`, `incomplete`, `passed`, and `failed`; a review note cannot satisfy the reliability gate by itself.
11. Minimum source coverage fails closed unless production-eligible official injury designation, official practice participation, official game activation, and observed workload evidence are all present.
12. Recovery source-binding plans receive deterministic fingerprints so historical/model runs can prove the exact source contract used.
13. `ccf-recovery-validation-protocol-v1` freezes dataset/source/scoring identity, chronological train/validation/test windows, research questions, comparison arms, primary/secondary metrics, subgroup policy, sample policy, and promotion criteria before evaluation.
14. Recovery validation requires native-no-recovery, eligible-raw-evidence, and learned-recovery-feature arms; legacy/external signals remain optional challengers.
15. Promotion protocols require a held-out test window, predeclared improvement thresholds, TIBER-off replay, and retention of failed candidates/negative results.
16. `ccf-source-snapshot-v1` prevents backdating ordinary captures and allows historical known-at only with exact immutable provider-archive availability proof.
17. Generic raw-source archiving now preserves exact bytes + manifest identity, idempotent exact captures, distinct retrieval observations, and tamper detection.
18. nflverse injury/practice is explicitly historical-only through 2024 and the adapter fails closed for 2025+.
19. Current leading live source candidates are Sportradar Weekly Injuries (designation/practice), Sportradar Game Roster (activation), and SportsDataIO PlayerGame snap counts (workload).
20. nflverse/PFR snap counts are retained as permission-conflicted research/reference infrastructure rather than a production model input; NFL.com automated inactive-page ingestion remains rejected under current terms.
21. Source-binding and historical-validation architecture is documented in `docs/architecture/CCF_INJURY_RECOVERY_SOURCE_BINDING_AND_VALIDATION.md`; the concrete source audit is in `docs/architecture/CCF_INJURY_RECOVERY_SOURCE_CANDIDATE_INVENTORY.md`.

### Persistent future obligations

1. **Maintain, do not rebuild, the concrete source inventory.** The current 4/4 discovery spine is identified; update classifications when terms, access, source availability, or empirical reliability evidence changes.
2. Obtain/verify exact intended-use permission for the selected Sportradar and SportsDataIO feeds. Do not treat trial/evaluation access as production/model authorization.
3. Capture real authorized Sportradar Weekly Injuries, Sportradar Game Roster, and SportsDataIO PlayerGame payloads at fantasy-relevant checkpoints; immediately archive exact bytes/retrieval times through the generic raw-source archive.
4. Build/version fail-closed parsers only from real authorized payloads; reject schema drift, incomplete identity, malformed required fields, and ambiguous status semantics.
5. Complete source reliability reviews for field semantics, correction behavior, latency, coverage, missingness, identity joins, update cadence, and provider limitations; promote only after explicit `passed` status.
6. Preserve nflverse injury/practice only as historical research through 2024; do not use it as a live 2026 source.
7. Preserve nflverse/PFR snap counts as permission-conflicted non-authoritative reference/provenance infrastructure unless intended-use rights are affirmatively cleared.
8. Keep NFL.com public-page automation rejected unless express permission or a separately licensed feed is obtained.
9. Bind promoted point-in-time official injury designations, practice participation, game activation, and observed workload, then pass the minimum-source-coverage gate.
10. Bind procedure/treatment confirmation evidence only when reliably known and permitted, preserving exact provenance and uncertainty.
11. Bind richer observed routes/targets/touches/designed/high-leverage/goal-line usage, pass protection and special-teams exposure only where definitions/source quality and intended-use permission support them.
12. Bind credible position-relevant performance proxies only where source quality/licensing support them; do not pretend CCF has private medical testing.
13. Define evidence-type stale/recheck policy and integrate Season Intelligence Events / News Intelligence without duplicate truth.
14. Extend the frozen Canonical Decision Packet to carry materially relevant recovery evidence and the same frozen snapshot to all challenger models.
15. Persist recovery evidence/assessments in immutable decision/evidence ledgers.
16. Construct the first player × game × decision-as-of historical recovery dataset using immutable pre-decision freezes and separate outcome storage; fingerprint dataset and scoring profile.
17. If exact historical source versions cannot prove prior intermediate states, begin leak-proof certification prospectively from CCF-captured snapshots rather than reconstructing historical checkpoints from final responses.
18. Measure historical/prospective coverage before choosing minimum overall/subgroup sample thresholds; then freeze those thresholds before the final holdout is inspected.
19. Freeze the first production recovery validation manifest with chronological train/validation/test windows, primary metrics, comparison arms and explicit promotion thresholds before final test access.
20. Run the baseline comparison: native CCF without recovery features vs eligible raw recovery evidence; determine whether recovery information itself adds stable value before fitting more elaborate mechanisms.
21. Fit post-return iterative/Bayesian updating only on training data; update usage/role evidence faster than noisy one-game box scores only if validation supports it.
22. Separate P(play), expected snap/route/touch opportunity, expected efficiency, ceiling, bust/near-zero risk, and setback uncertainty in native lineup decisions.
23. Build injury-class priors only as distributions/ranges with minimum-sample and weak-evidence safeguards; no fixed `injury = N weeks` tables.
24. Evaluate position-specific effects (WR speed/cutting, RB acceleration/contact, QB platform/scramble, TE receiving+blocking) only through empirical promotion gates.
25. Evaluate treatment/procedure distinctions, age interaction, recurrence history, compensatory/opposite-limb context, and workload ramp only where observed evidence supports incremental value.
26. Add era conditioning only if historical-depth tests show material value.
27. Explicitly include failed/diminished/recurring/non-return outcomes and negative evidence to reduce survivorship bias; famous comeback outliers remain tails.
28. Test indirect OL/defensive injury effects on opposing/offensive fantasy environment where material.
29. Extend recovery-aware evidence into waivers, trades, dynasty and—only if already authorized—DFS/Beat Vegas as contextual evidence, never hidden recommendation authority.
30. Run point-in-time chronological OOS tests for active-vs-workload separation, practice-to-snap progression, time-to-normalization, position differences, role indicators vs time-since-injury, uncertainty calibration, abstention, and outlier sensitivity.
31. Compare CCF without recovery features vs eligible raw evidence vs learned recovery features; require calibration, subgroup stability, minimum sample support, and incremental decision value before promotion.
32. Preserve failed recovery-feature candidates and negative results in the append-only backtest history.
33. Maintain the safety boundary: fantasy decision support only; no diagnosis, undisclosed-medical-fact inference, treatment advice, or fabricated individualized medical probabilities.

Detailed architecture and audit:
- `docs/architecture/CCF_INJURY_RECOVERY_INTELLIGENCE_V0.md`
- `docs/architecture/CCF_INJURY_RECOVERY_SOURCE_BINDING_AND_VALIDATION.md`
- `docs/architecture/CCF_INJURY_RECOVERY_SOURCE_CANDIDATE_INVENTORY.md`

## 7. Recommendation Authority Gate — **P1 / OPEN**

Bind real weekly recommendation surfaces to certified CCF-native evidence only; preserve abstention, unavailable states, challenger visibility, immutable as-of decision ledgers, and Universal Recommendation Authority Graph enforcement.

## 8. Sleeper integration / live portfolio truth — **P1 / OPEN**

Preserve per-league scoring, roster/ownership truth, permitted API scope, provenance, and live-league discovery evidence before recommendation authority is unlocked.

## 9. ESPN integration — **P1 / OPEN**

Finish reliable authenticated league/draft/roster data integration and exact league truth. Keep manual/local fallback until live integration is certified.

## 10. Repository / install / release readiness — **P1 / OPEN**

Maintain repository hygiene, local-first installability, focused+broad test discipline, preflight, exact revision reporting, and deliberate GitHub sync.

## 11. Historical Depth & Regime Intelligence expansion — **P2 / OPEN**

Continue HRI only after higher-priority CCF independence/model/data gates permit it.

## 12. Model hardening / verification — **P2 / OPEN**

Challenger models, frozen-as-of reruns, determinism, failure injection, abstention quality, resilience, performance/reliability, and regression prevention.

## 13. News Intelligence expansion — **P2 / OPEN**

Curated source registry, timestamps, freshness, reliability, corroboration, and fact/reporting/observation/speculation separation.

## 14. Waiver optimizer hardening — **P2 / OPEN**

Sequential FAAB, zero-dollar waiver semantics, roster-state transitions, contingency planning, and calibrated outcome/value impact.

## 15. Trade Analyzer — **P2 / OPEN**

Native CCF valuation, context-aware roster effects, contender/rebuilder horizon, risk, replacement value, and explainable trade impact.

## 16. League power rankings / playoff simulation — **P2 / OPEN**

Calibrated team-strength and schedule-aware simulation after core weekly outcome authority is certified.

## 17. Risk / fragility / schedule strength — **P2 / OPEN**

Native uncertainty, tail-risk, role fragility, dependency structure, opponent/context evidence, and schedule modeling.

## 18. Portfolio exposure analytics — **P2 / OPEN**

Cross-league/player exposure, correlated risk, concentration, and scenario sensitivity.

## 19. WAR-like player value modeling — **P2 / OPEN**

Replacement-aware, scoring/roster-specific marginal value only after native outcome distributions are trustworthy.

## 20. Devy — **P2 / OPEN**

Full college-player ownership/free-agent tracking, weekly and season ledgers, ROS/long-term ranks, class/position context, and NFL-transition modeling. External systems remain secondary evidence.

## 21. Transaction / draft history & season recap — **P3 / OPEN**

Durable historical records, attribution, decision review, season narrative, and retrospective model analysis.

## 22. Mobile / expanded ESPN-Sleeper surfaces — **P3 / OPEN**

Broader product/UI expansion after core data/model/recommendation authority is reliable.

---

## Deferred research hypotheses — preserve, do not presume value

- **Cross-sport market scanning:** test only after an NFL-native market baseline exists. Predeclare comparison `CCF baseline` vs `+ NFL market evidence` vs `+ cross-sport-derived market-behavior features`. Promote only if frozen chronological OOS evidence shows incremental NFL decision value; otherwise retire.
- **Additional AI agents:** add only when they create genuinely independent challenge, verification, source-specialist, or failure-mode coverage. Do not add agents merely to create majority voting or consensus theater.
- **Expert rationale mining:** potentially useful for discovering missing mechanisms; any promoted native feature must be independently reproduced and validated by CCF rather than inherited from expert conviction.
- **IRRIS mechanism mining:** preserve useful injury-family, recovery, workload, recurrence, functional-limitation, and scenario-mixture concepts as hypotheses/reference; do not copy fitted priors/weights into CCF authority without independent validation.

## Backtesting history rule

The CCF backtest progression ledger is append-only. Infrastructure-only milestones and `not_run` candidates may not carry numeric performance metrics. A model improvement claim requires a legitimately completed comparable frozen run.

## Separation rule

This document is **Fantasy Football Command Center only**. Football Unwritten tasks, repos, doctrines, certification gates, and work queues must remain separate unless explicitly transferred by the user.

## 2026-09-15 scoped progress — recovery source hardening

PR #25 remains the CCF-first authority foundation. The stacked injury/recovery v0 branch now adds governed recovery evidence, permission-aware source binding, explicit reliability qualification, immutable raw capture, PIT semantics, candidate promotion diagnostics, historical validation protocol, and the concrete source audit.

Current leading source candidates are Sportradar Weekly Injuries for designation/practice, Sportradar Game Roster for activation, and SportsDataIO PlayerGame snap counts for workload. All remain non-production: no exact FFCC production permissions, real-payload parser bindings, completed reliability reviews, or full four-role PIT source plan are claimed.

nflverse injury/practice is historical-only through 2024. nflverse/PFR snap counts are permission-conflicted and retained only as non-authoritative reference/provenance infrastructure pending explicit rights clearance. NFL.com automated public-page ingestion remains rejected under current terms.

## 2026-09-15 scoped progress — trusted runtime/source binding prerequisite

The PR #25 continuation adds a separate fingerprinted trusted-binding audit for
every recommendation-critical node. Exact graph/surface/node, producer,
producer-family, evidence-kind, provenance, attestation time, support window,
revocation, and binding-evidence identity must match operator-controlled state.
The universal release checklist now blocks independently on unbound surfaces.
The canonical registry remains empty, so this mechanism cannot manufacture
production readiness. Real source/runtime attestations, trusted per-surface
extraction, frozen historical certification, and route enforcement remain open.

P0 independence and historical backtesting remain **OPEN**. Next legitimate recovery work requires authorized provider access/permission, real payload capture, parser binding, reliability evidence, and prospective PIT accumulation. Universal CCF work still requires genuine runtime attestations, trusted per-surface extraction, a frozen production-native candidate and point-in-time dataset, and the predeclared chronological OOS protocol. No learned recovery model, recommendation activation, historical performance score, or certification record was invented. ESPN live-session verification still requires the user's local Chrome/ESPN session.
