# Breakout v1 Accuracy Checklist

Use this checklist before any breakout tag/probability activation.

## Data

- [ ] Canonical player identity is stable across seasons.
- [ ] Feature rows are frozen as of a documented preseason cutoff.
- [ ] Historical redraft ADP snapshots are governed and comparable across seasons.
- [ ] Route/snap inputs are either historically complete enough to replay or excluded.
- [ ] Missingness and coverage exclusions are explicit.
- [ ] No current-only depth chart/news information appears in historical features.

## Evaluation

- [ ] Chronological out-of-sample folds only.
- [ ] Final certification holdout is untouched during feature/hyperparameter selection.
- [ ] >= 30 held-out positive events.
- [ ] Precision >= 15%.
- [ ] Precision lift > 1.5x held-out base rate.
- [ ] 95% lower confidence bound for precision lift > 1.0.
- [ ] PR-AUC beats the base-rate reference.
- [ ] Brier score beats constant-base-rate predictor.
- [ ] Log loss beats constant-base-rate predictor.
- [ ] Calibration slope/intercept and reliability bins are acceptable and reported.
- [ ] Performance is not carried by a single fold.
- [ ] v1 beats a simple independent challenger.

## Consumer activation

- [ ] Producer status = promoted.
- [ ] backtest_passed = true.
- [ ] prescriptive_validation_passed = true.
- [ ] target season matches league season.
- [ ] calibrated primary probability in [0,1].
- [ ] explicit probability target.
- [ ] manifest declares all required artifacts.
- [ ] no score-to-percent conversion.
- [ ] identity match is canonical or unique name+team fallback.
- [ ] decision ledger records displayed evidence once ledger infrastructure exists.

Any unchecked item keeps the signal research-only and invisible in draft surfaces.
