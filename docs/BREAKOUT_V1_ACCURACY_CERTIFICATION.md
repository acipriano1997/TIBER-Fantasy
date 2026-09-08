# Breakout v1 Accuracy Certification

## Status

`research_contract_not_activated`

This document defines the minimum evidence required before any 2026 breakout badge or probability may be activated in TIBER-Fantasy. It preserves `late_veteran_wr_breakout_v0` as a rejected research result and forbids same-sample threshold retuning from being relabeled as a better model.

## Why v0 is rejected

The frozen v0 backtest is mathematically reproducible but not decision-useful:

- evaluable player-season pairs: 124
- actual archetype hits: 9
- predicted positives: 52
- true positives: 2
- false positives: 50
- false negatives: 7
- true negatives: 65
- precision: 3.85%
- recall: 22.22%
- evaluable-universe base rate: 7.26%
- best diagnostic same-sample sensitivity precision: 5.08%

The positive screen therefore failed to beat the underlying event base rate. Raw accuracy is not a promotion metric because the event is rare and an always-negative classifier can appear accurate while being useless for finding breakouts.

## Non-negotiable v1 rules

1. **New version, new hypothesis.** v1 must be separately versioned and preregistered before held-out outcomes are evaluated.
2. **Frozen-as-of features only.** Feature construction may use only information that existed at the declared feature cutoff. Outcome-season statistics, post-freeze news, future depth charts, or retrospective labels may not affect eligibility or feature values.
3. **Out-of-sample evaluation.** Use walk-forward or leave-season-out folds. No pooled same-sample result may authorize promotion.
4. **No threshold shopping.** Hyperparameters and cutoffs are selected inside training folds only. The final test fold is touched once for certification.
5. **Class-imbalance-aware metrics.** Raw accuracy is diagnostic only. Promotion is based on precision lift, PR behavior, calibration, and decision value.
6. **Explicit event support.** Total sample size is insufficient by itself. Certification requires at least 30 held-out positive events across evaluation and adequate support in individual folds; otherwise v1 remains research-only.
7. **Independent challenger.** A simpler model must remain alongside v1 and must be beaten robustly before promotion.
8. **Probability means probability.** No signal score may be displayed as a percent. Displayed percentages must come from out-of-sample calibrated probabilities for an explicitly named target.
9. **Fail closed on missing governed inputs.** Missing market, route, snap, identity, or roster evidence is unavailable, never silently imputed into a favorable state.
10. **Producer owns model truth.** TIBER-Fantasy remains a read-only consumer. It does not recreate producer scores or calibration locally.

## Primary target

For preseason and draft surfaces, the preferred primary target is:

`P(ROS_tier_jump)`

A concrete tier definition must be frozen before model fitting. Optional secondary targets may include:

- `P(top_24_next_4w)`
- `P(role_expansion)`
- `P(ADP_outperformance_12_slots)`

Secondary probabilities are only allowed when their horizon, label construction, and historical coverage are independently supportable.

## Candidate feature families

Prefer continuous, source-backed evidence instead of brittle cohort screens:

- age and career-year development curve
- prior-season and multi-season PPR production
- target share and target-earning trend
- air-yards share and WOPR trend
- team pass-attempt / target denominators
- vacated-opportunity and competition-path measures
- draft-capital divergence from current market price
- redraft ADP / market discount from governed historical snapshots
- route participation and snap share only when historical coverage is truthful
- position-specific development pathways
- prior role volatility / opportunity gap
- incumbent availability encoded only from frozen-as-of evidence

Features with poor historical coverage must remain excluded until coverage is good enough to support replay.

## Required baselines and challengers

Every held-out fold must compare v1 against:

1. event base rate
2. ADP-only baseline when governed ADP exists
3. recent PPG / usage-only baseline
4. simple regularized logistic model
5. rejected v0 cohort rule

A more complex v1 is not promotable merely because it sounds richer. It must demonstrate stable incremental value over simpler alternatives.

## Evaluation protocol

### Fold design

Use chronological folds so training always precedes testing. Preferred pattern:

- train on earliest supported seasons
- validate on the next season
- test on the following unseen season
- roll forward and repeat

When the historical window is too short for a full train/validate/test split, use nested leave-season-out evaluation and keep the final available season as a one-touch certification holdout.

### Promotion metrics

Primary:

- held-out precision
- precision lift versus held-out base rate
- lower confidence bound for precision lift
- PR-AUC / average precision versus base-rate reference
- Brier score
- log loss
- calibration slope and intercept

Secondary:

- recall
- F1
- ROC-AUC
- top-K capture only when K is preregistered and tied to a real decision surface

### Initial quantitative gates

These are certification floors, not optimization targets:

- held-out precision must be materially above both v0 and held-out base rate
- initial target floor: at least 15% held-out precision
- precision-lift point estimate > 1.5x base rate
- 95% lower confidence bound for lift should exceed 1.0; if event support is insufficient, remain research-only rather than weakening the confidence rule
- calibrated probabilities must outperform the constant-base-rate predictor on Brier score and log loss
- no severe calibration inversion; calibration slope/intercept and reliability bins must be reported
- no single fold may carry the entire result without an explicit instability warning

## Calibration protocol

Calibration is fit only on out-of-fold predictions or a dedicated validation fold. Acceptable methods include isotonic regression, Platt/logistic calibration, or another preregistered monotonic method chosen inside training data.

Required report fields:

- raw model score
- calibrated probability
- probability target name
- fold and feature cutoff
- Brier score
- log loss
- calibration slope/intercept
- ECE or reliability-bin error
- support count and event count per probability bin
- confidence interval for observed event rate per bin

No UI percentage may be emitted from a bin with inadequate support unless it is explicitly shrunk toward the global prior and the shrinkage method is documented.

## Leakage tests

Certification must include automated tests proving:

- mutating outcome-season fields cannot change feature values or eligibility
- post-cutoff news cannot enter a frozen feature row
- current depth charts cannot backfill a historical season
- future ADP snapshots cannot alter an earlier market feature
- duplicate names cannot override canonical identity joins
- missing outcomes remain coverage exclusions rather than negatives
- hyperparameter selection cannot inspect the final certification holdout

## Required artifacts

A producer v1 run must emit:

- frozen definition/spec
- exact season/fold assignments
- row-level prediction ledger
- baseline/challenger comparison
- calibration report
- uncertainty report
- feature missingness and exclusion ledger
- input source lineage and content digests
- deterministic provenance receipt
- terminal decision: `promoted`, `requires_followup`, or `blocked`

## TIBER-Fantasy activation contract

Existing draft-tag infrastructure remains dormant unless the producer export truthfully declares all of the following:

- target season matches the league season
- promotion status is `promoted`
- backtest passed
- prescriptive validation passed
- calibrated primary probability exists in [0, 1]
- primary probability target is explicit
- producer artifact is declared in the manifest

If any condition fails, TIBER-Fantasy renders no breakout tag and no percentage.
