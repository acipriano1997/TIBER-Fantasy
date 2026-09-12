# CCF Player Outcome Engine v0

**Purpose:** Native weekly player outcome distributions for CCF-primary decisions.

This engine is the first implementation priority required by CCF-INDEP-001. It replaces dependence on upstream projection/grade outputs for weekly decision authority.

## Output contract

For each player / league scoring / game / as-of combination, the engine should return:

- `median_fpts`
- `mean_fpts`
- `p10_fpts`
- `p25_fpts`
- `p75_fpts`
- `p90_fpts`
- `floor_fpts` (policy-defined, not mislabeled as a literal minimum)
- `ceiling_fpts` (policy-defined, not mislabeled as a literal maximum)
- `zero_or_near_zero_probability`
- `boom_probability`
- `bust_probability`
- `volatility`
- `confidence`
- `coverage`
- `abstain`
- `abstain_reasons[]`
- `mechanism_contributions[]`
- `critical_feature_provenance[]`
- `model_version`
- `as_of`

Exact probability thresholds must be scoring- and position-aware and versioned. Do not hardcode user-facing labels without a documented threshold policy.

## Modeling decomposition

The v0 distribution should be built through explicit components rather than a single opaque rating:

```text
availability/readiness
  x role probability
  x opportunity distribution
  x efficiency distribution
  x scoring conversion
  + game environment
  + opponent/matchup
  + scheme interaction
  + weather/venue
  + market context
  -> correlated scenario simulation / distribution
```

### 1. Availability/readiness

Inputs may include:

- official game/injury status;
- practice participation trajectory;
- time since injury and injury family;
- return-to-play uncertainty;
- snap limitation evidence;
- credible news evidence;
- CCF readiness estimate.

This component estimates participation and workload constraints; it must not claim a medical diagnosis as fact when evidence only supports an inference.

### 2. Role probability

Estimate the probability of plausible roles, for example:

- feature / lead back;
- committee back;
- passing-down specialist;
- WR1 / WR2 / slot-heavy / rotational receiver;
- inline / route-heavy / blocking-heavy TE;
- full-game QB / partial-game risk.

Role transitions should be modeled as scenarios, not collapsed into one deterministic assumption when evidence is mixed.

### 3. Opportunity distribution

Position-native opportunity variables should drive the engine.

QB examples:
- dropbacks, attempts, designed rushes, scramble opportunities, red-zone involvement.

RB examples:
- carries, targets, route participation, short-yardage/goal-line opportunities, two-minute participation.

WR/TE examples:
- routes, targets per route, air yards, red-zone targets, end-zone targets, alignment/role interaction.

### 4. Efficiency distribution

Efficiency must be regressed and uncertainty-aware. Use player history, stable skill indicators, team context, opponent context, and sample size. Avoid treating short-run conversion spikes as stable talent.

### 5. Environment and matchup

Additive/modulating context may include:

- team pace and play volume;
- pass/rush tendency;
- offensive line and protection context;
- opponent pressure/coverage/run-defense mechanisms;
- game total, spread, implied team total and movement;
- stadium/roof/field context;
- wind, precipitation, temperature and relevant interactions;
- scheme interaction and counterfactual mechanism layer.

No context feature should be used merely because it correlates historically. It must have a plausible mechanism, leakage review, and out-of-sample validation.

## Scenario engine

v0 should support a bounded scenario mixture rather than only a point estimate.

Example scenario families:

- normal role / normal game script;
- positive game environment;
- negative game environment;
- workload limitation;
- role expansion;
- early exit / re-aggravation risk where evidence supports it;
- weather degradation;
- teammate absence redistribution.

Scenario probabilities must sum to 1 and be inspectable.

## Correlation requirements

Do not simulate opportunity, efficiency, touchdowns, and team scoring as independent draws when football mechanisms couple them.

At minimum v0 should account for:

- team play volume correlation;
- player opportunity share constraints;
- scoring opportunity / touchdown correlation with team offense;
- pass-catcher target-share competition;
- QB/pass-catcher positive correlation;
- competing RB workload negative correlation;
- game-script interaction with pass/rush volume.

## Calibration

Calibration is part of the model, not a post-hoc cosmetic layer.

Evaluate by:

- position;
- projection range;
- injury/readiness state;
- volatility band;
- favorite/underdog state;
- weather severity;
- early/late season where sample characteristics differ;
- scoring format where relevant.

Track both point error and distribution quality. Candidate metrics include MAE/RMSE for central estimates, pinball loss for quantiles, Brier/log loss for event probabilities, and empirical coverage for intervals.

## Explainability contract

`mechanism_contributions` should explain the difference between a neutral baseline and the final distribution in football terms. Contributions may be nonlinear and therefore need not sum perfectly unless the implementation explicitly uses an additive attribution method.

Each contribution should carry:

- mechanism family;
- direction;
- estimated magnitude or qualitative band;
- evidence references;
- confidence;
- whether it is observed, derived, inferred, or external challenger evidence.

## External signals

TIBER-Forecast, FORGE, ECR, expert rankings, sportsbook/player-prop markets, and other projection sources are not native features by default.

They may enter a separate challenger/evidence layer for:

- disagreement detection;
- calibration comparison;
- residual research;
- bounded priors only when explicitly authorized and traceable.

The engine must preserve a native result before optional challenger evidence is attached.

## v0 implementation slice

Start narrow:

1. QB/RB/WR/TE only.
2. Weekly PPR and half-PPR first; scoring adapter remains generic.
3. Native central estimate plus p25/p50/p75 and p10/p90.
4. Native role/opportunity inputs with explicit coverage.
5. Game environment and basic market context.
6. Injury/readiness and weather adjustments only where evidence contracts are eligible.
7. No TIBER model outputs in the native path.
8. Deterministic seeded simulation for reproducible certification fixtures.
9. Store the pre-challenger native result immutably for TIBER-off comparison.

## v0 exit criteria

The engine is ready to feed the first CCF-primary lineup experiments when:

- CCF-INDEP-001 functional/provenance checks pass for the engine;
- all four offensive positions have bounded fixture coverage;
- quantile ordering and range sanity invariants pass;
- scoring-format transformations are verified;
- missing evidence widens distributions or abstains rather than inserting neutral-looking defaults;
- frozen historical evaluation reports calibration/error against at least a simple baseline and the incumbent TIBER path;
- no TIBER projection/grade/value appears in the native critical-feature provenance graph.
