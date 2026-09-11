# Fantasy Football Command Center — Canonical Ranked Carry-Forward Queue

**Status:** ACTIVE / PERSISTENT  
**As of:** 2026-09-11

This is the durable ranked carry-forward queue for **Fantasy Football Command Center only**. It supersedes fragmented/scattered FFCC work lists while preserving completed evidence. **Do not mix with Football Unwritten.**

## Execution rule

Work the highest-priority unblocked item first. Deferred/frozen work remains **OPEN** until explicitly DONE, REJECTED, or superseded with a pointer. Closing an implementation PR must not silently erase an unfinished underlying obligation.

## Non-negotiable governance

- **CCF-FIRST:** CCF owns primary fantasy decision modeling, feature construction, calibration, uncertainty, recommendation logic, and recommendation authority.
- TIBER may remain only as secondary evidence, benchmark, prior, or challenger; it must never be a critical dependency or silently determine recommendations.
- Preserve point-in-time/as-of provenance, anti-leakage, explicit unavailable states, graceful degradation, immutable decision/evidence ledgers, challenger comparisons, and abstention when evidence is insufficient.
- Local-first development remains authoritative: local filesystem/Git → focused tests → broad tests → local preflight → clean local commit → deliberate GitHub sync/backup.

---

# Ranked workstreams

## 1. CCF independence from TIBER — **P0 / ACTIVE**

Finish native CCF independence and recommendation authority without relying on TIBER, external consensus, or legacy heuristics. Preserve the TIBER capability-migration registry, TIBER-off certification, native source spine, explicit provenance, and fail-closed behavior.

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

### Promotion condition

Do **not** call CCF predictive performance certified, fully backtested, or `CCF_PRIMARY` until a production-native candidate completes the frozen historical OOS protocol and satisfies the predeclared calibration, stability, baseline-beating, leakage, and TIBER-off gates.

## 3. Information Bank gap audit — **P1 / OPEN**

Continue coverage audit, provenance hardening, empirical-gap closure, and source-quality/freshness tracking without widening simulation/model authority prematurely.

## 4. Expert Signal Engine — **P1 / OPEN**

Ingest permitted/licensed expert evidence with strict as-of provenance; learn reliability by season/position/signal type; deduplicate echoed signals; preserve rationale mechanisms; score frozen expert calls afterward. Expert evidence remains challenger/secondary only.

## 5. Weather Intelligence System — **P1 / OPEN**

Advance from native weather evidence contract to live ingestion, immutable historical archive, source/provider evaluation, empirically learned fantasy-impact mechanisms, and point-in-time certification. No hand-set fantasy weighting promoted without evidence.

## 6. Injury & Readiness Intelligence — **P1 / OPEN**

Combine medical/injury evidence and relevant news to estimate readiness/absence timelines probabilistically while clearly separating observed facts, official narrative, and CCF inference. No unsupported diagnosis masquerading as fact.

## 7. Recommendation Authority Gate — **P1 / OPEN**

Bind real weekly recommendation surfaces to certified CCF-native evidence only; preserve abstention, unavailable states, challenger visibility, and immutable as-of decision ledgers.

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

## Backtesting history rule

The CCF backtest progression ledger is append-only. Infrastructure-only milestones and `not_run` candidates may not carry numeric performance metrics. A model improvement claim requires a legitimately completed comparable frozen run.

## Separation rule

This document is **Fantasy Football Command Center only**. Football Unwritten tasks, repos, doctrines, certification gates, and work queues must remain separate unless explicitly transferred by the user.
