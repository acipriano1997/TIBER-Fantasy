# CCF Universal Release Checklist

Status: **BLOCKED / NOT CCF_PRIMARY**

This checklist is the human-readable companion to `server/modules/ccf/independence/releaseChecklist.ts`.
The executable registry is authoritative. A capability is not complete merely because code exists.

## Promotion rule

The executable checklist requires all of these prerequisites before reporting promotable:

1. the complete required weekly census is present, with unique keys, and every critical dependency is `eligible_native` **and** belongs to a permitted CCF-native producer family;
2. the complete canonical required capability registry is present, with unique IDs and all required entries still required and `native_certified`;
3. exactly one eligible declared authority graph covers each of the eight decision surfaces;
4. every critical node matches exactly one active, temporally eligible operator-owned trusted binding; and
5. every critical model matches a previously recorded certified native release in the canonical backtest ledger, including model/calibration and scoring/population identity.

The additive v1 checklist fields `authority`, `summary.authoritySurfaceBlockers`, `summary.trustedBindingSurfaceBlockers`, and `summary.uncertifiedModelSurfaces` expose these graph/binding/model prerequisites. Without supplied production graphs and operator-owned bindings, all eight surfaces are explicitly blocked. Relabeling external dependencies, changing producer/provenance text, dropping required rows, or clearing required flags cannot satisfy the checklist.

The trusted-binding contract authenticates exact equality only against the operator registry supplied by trusted code. The canonical registry is intentionally empty until genuine source/runtime attestations exist. These checks do not validate the contents of referenced source or certification artifacts or activate recommendation routes. Graph/binding regression fixtures are not predictive evidence. Production attestations and the full historical certification protocol remain required.

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
