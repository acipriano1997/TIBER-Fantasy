# Breakout v1 Producer Handoff

## Purpose

Implementation-ready handoff for `Prometheus-Frameworks/Signal-Validation-Model`. This file is not producer truth and does not authorize TIBER-Fantasy to calculate breakout scores itself.

## Required model shape

Build `breakout_v1` as a probabilistic classification model for a frozen, explicitly named fantasy-value event rather than a binary archetype screen.

Preferred primary target for preseason/draft use:

`ros_tier_jump`

The exact tier boundary must be frozen in the producer spec before training. Suggested implementation should model the probability directly rather than applying a threshold to a handcrafted score.

### Core modeling recommendation

Use a deliberately simple champion candidate first:

- regularized logistic regression or gradient-boosted trees with strict monotonic/complexity controls
- continuous features
- missingness indicators where justified
- chronological nested cross-validation
- out-of-fold probability calibration
- class weighting or loss handling chosen only inside training folds

Do not start with a large ensemble. Promotion requires beating a simpler independent challenger.

## Feature set v1a

Only admit a feature when historical frozen-as-of coverage and provenance are truthful.

Minimum v1a feature families:

- career year
- prior-season PPR PPG
- two-year weighted PPR PPG where history exists
- target share
- change in target share
- air-yards share
- WOPR
- games played / availability proxy from historical observed facts
- team pass-attempt / target denominator
- draft capital / draft-capital bucket if source-backed
- governed redraft ADP and ADP-vs-production divergence when historical snapshots are available

Optional v1b after coverage review:

- route participation
- routes run
- snap share
- vacated targets / competition-path variables
- depth-chart evidence
- injury-contingency opportunity

A missing optional source must not block v1a; it must remain absent rather than being synthesized from current information.

## Labels

Primary label should represent a real draft decision outcome. Freeze one of these before model fitting:

1. `ros_tier_jump`: player finishes at least one predefined fantasy tier above preseason market-implied tier.
2. `adp_outperformance_12_slots`: player beats preseason positional ADP by >= 12 positional slots with minimum games requirement.
3. `top24_finish`: player finishes top 24 at position with minimum games requirement.

If multiple labels are explored, designate one primary and treat the others as secondary analyses. Do not select the primary after seeing results.

## Chronological evaluation

For each supported feature season `Y`, predict outcome season `Y+1` using only data available by the preseason freeze for `Y+1`.

Recommended nested procedure:

1. outer fold holds out one latest season pair
2. inner chronological folds tune model and calibration method
3. model refits on all pre-holdout data
4. holdout is scored once
5. repeat as walk-forward folds permit
6. preserve final latest-season pair as untouched certification holdout if sample size allows

Every prediction row must include `feature_cutoff_at`, `train_seasons`, `validation_seasons`, `test_season`, and provenance IDs.

## Baselines

Produce predictions from:

- constant event base rate
- redraft ADP-only logistic baseline
- prior PPG + target-share logistic baseline
- v0 rule indicator
- v1 candidate

Report deltas, not just standalone scores.

## Required metrics

For each fold and pooled out-of-fold ledger:

- TP / FP / FN / TN at a preregistered action threshold
- precision
- recall
- F1
- average precision / PR-AUC
- ROC-AUC
- Brier score
- log loss
- calibration slope
- calibration intercept
- ECE / reliability-bin error
- event base rate
- precision lift = precision / base rate
- bootstrap or Wilson interval for precision and lift

Do not use raw accuracy as a promotion gate.

## Promotion rule

`promoted` only if all are true:

- no leakage/provenance failures
- >= 30 held-out positive events across evaluable folds
- held-out precision >= 15%
- held-out precision lift point estimate > 1.5x base rate
- 95% lower bound for precision lift > 1.0
- v1 Brier score and log loss beat the constant-base-rate predictor
- v1 beats the simple challenger on the primary metric without relying on a single fold
- calibration is usable enough that displayed percentages are empirically supported
- no required feature family is populated from current-only or post-cutoff evidence

Otherwise emit `requires_followup` or `blocked`.

## Export contract for TIBER-Fantasy

Per-player exported rows should include:

- canonical player ID
- player name/team/position
- target season
- model version
- generated timestamp
- primary probability value
- primary probability target
- optional secondary probabilities
- calibration method/version
- model feature cutoff
- fold/certification metadata
- provenance receipt ID

The producer manifest must carry:

- `promotion.status`
- `promotion.backtest_passed`
- `promotion.prescriptive_validation_passed`
- `feature_season`
- `outcome_season`
- declared artifacts

TIBER-Fantasy will remain fail-closed if any of these fields are missing or inconsistent.
