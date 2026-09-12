# CCF Universal Release Checklist

Status: **BLOCKED / NOT CCF_PRIMARY**

This checklist is the human-readable companion to `server/modules/ccf/independence/releaseChecklist.ts`.
The executable registry is authoritative. A capability is not complete merely because code exists.

## Promotion rule

CCF may claim universal/native primary authority only when both conditions are true:

1. every recommendation-critical weekly dependency is explicitly `eligible_native`; and
2. every capability marked `requiredForUniversalCCF` in the TIBER capability-migration registry is `native_certified`.

External consensus, TIBER model outputs, Rookie Alpha, and FORGE final grades/ranks remain challenger evidence and cannot satisfy a native gate.

## Maturity meanings

- **Blocked** — native mechanism or required evidence is missing.
- **Partial** — a native implementation/scaffold exists, but required historical, calibration, ablation, subgroup, or TIBER-off evidence is incomplete.
- **Certified** — the independent CCF implementation and all required promotion evidence are complete.
- **Non-authoritative** — intentionally retained only as challenger/context evidence or intentionally retired.

## Newly implemented native scaffolds

### Chronological certification harness

- `server/modules/ccf/certification/chronologicalSplit.ts`
- forbids overlapping train/validation/test windows;
- exposes an explicit future-leakage assertion;
- preserves unassigned observations rather than silently leaking them into a split.

Still required: frozen point-in-time historical inputs, rolling OOS execution, and a TIBER-off replay.

### Simple benchmark models

- `server/modules/ccf/certification/simpleBenchmarks.ts`
- historical-mean baseline;
- recent-form mean baseline;
- pooled fantasy-points-per-opportunity baseline;
- MAE/RMSE evaluator.

Still required: chronological benchmark runs and proof that the production model beats these deliberately simple alternatives.

### League-aware replacement value

- `server/modules/ccf/value/replacementValue.ts`
- derives core positional starter demand from league size and lineup requirements;
- allocates FLEX demand to the best remaining eligible players;
- derives a replacement player/point baseline by position;
- computes VORP from that league-derived baseline.

Still required: binding to real league/scoring inputs, historical decision-value evaluation, ablation, and TIBER-off replay.

## Highest-priority blocked capability families

1. Direct point-in-time data/identity spine and immutable historical observations.
2. CCF-native role/opportunity and expected-points feature construction.
3. Production weekly player outcome distribution.
4. Residual uncertainty, quantile/probability calibration, and subgroup reliability.
5. Rolling chronological backtest execution against simple benchmarks.
6. Scenario updating/fusion for injuries, role changes, weather, markets, and transactions.
7. ROS/seasonal outcome model.
8. Rookie/devy translation and historical-outcome calibration.
9. Final TIBER-off certification and downstream route cutover.

## Non-negotiable evidence rule

Do not copy TIBER fitted weights, final scores, grades, ranks, probabilities, or heuristic constants into CCF native authority. TIBER mechanisms may seed hypotheses. CCF must independently source the inputs, fit/derive any parameters, evaluate them chronologically, measure calibration and subgroup behavior where applicable, and demonstrate incremental value before promotion.
