# CCF Predictive Validation & Error Intelligence v0

**Status:** IMPLEMENTED FOUNDATION / PERFORMANCE NOT YET CERTIFIED  
**Scope:** Fantasy Football Command Center only  
**Authority:** CCF-first; TIBER/expert/market evidence remains challenger or contextual evidence unless separately promoted under CCF-native authority  
**As of:** 2026-09-15

## Purpose

FFCC should not optimize for a model that merely looks sophisticated or posts one attractive retrospective score. It should optimize for a CCF-native decision system that repeatedly demonstrates, under frozen point-in-time conditions, that it predicts useful fantasy outcomes better than simpler alternatives, knows when it is uncertain, and converts predictive edge into lower decision regret.

The governing question is therefore not only **"How accurate is CCF?"** It is:

> Under information that was genuinely knowable at decision time, does the frozen CCF candidate add stable, calibrated, decision-relevant value over strong simple baselines, and can we explain where that value comes from without leakage, survivor bias, threshold shopping, or challenger contamination?

This document turns that question into a reusable validation doctrine.

---

## 1. What counts as predictive performance

No single metric is sufficient. CCF must be evaluated across five distinct layers.

### 1.1 Point prediction

How close is the center of the forecast to realized fantasy production?

Core diagnostics:
- MAE
- RMSE
- signed mean error / bias
- position- and role-conditioned error

### 1.2 Ranking quality

Fantasy decisions often depend more on ordering than on exact point values.

Core diagnostics:
- Spearman rank correlation
- Kendall rank correlation
- top-K capture only when K is preregistered and tied to a real decision surface
- pairwise outscore accuracy where the decision is explicitly pairwise

### 1.3 Distribution quality

A 14-point median with a narrow distribution is not equivalent to a 14-point median with massive tail risk.

Core diagnostics:
- interval coverage
- interval sharpness/width
- Brier score for named binary targets
- log loss
- expected calibration error
- maximum calibration gap
- pinball/quantile loss where quantiles are available
- tail calibration for boom/bust probabilities

### 1.4 Decision quality

A model can improve MAE while making worse lineup choices. Decision surfaces must therefore be scored directly.

Core diagnostics:
- feasible-alternative lineup regret
- decision win rate
- zero-regret rate
- p90 / maximum regret
- catastrophic-regret rate
- waiver/trade utility only after those surfaces have frozen native objectives

### 1.5 Selective prediction

CCF is allowed to abstain. A trustworthy model should become better as it restricts itself to higher-confidence decisions.

Core diagnostics:
- abstention rate
- error vs coverage curve
- regret vs coverage curve
- calibration by uncertainty band
- performance on accepted vs abstained cases once a comparable counterfactual is available

**Promotion requires a coherent story across these layers, not one cherry-picked headline metric.**

---

## 2. Predict mechanisms, not only fantasy points

Fantasy points are a noisy terminal outcome. CCF should learn the causal/predictive chain in separable stages whenever historical evidence supports it.

### 2.1 Availability / participation

Candidate targets:
- probability of playing
- active/inactive state when knowable
- participation uncertainty

### 2.2 Opportunity / role

Candidate targets:
- snap share
- route participation
- target share
- carry share
- expected touches
- high-value / goal-line opportunities
- two-minute / third-down participation where source definitions are stable

Opportunity generally deserves faster updating than one-game scoring efficiency because role evidence is often more persistent and less noisy.

### 2.3 Efficiency

Candidate targets:
- points per opportunity or scoring-component efficiency
- receiving/rushing efficiency conditional on role
- touchdown conversion only with heavy shrinkage because of variance

### 2.4 Outcome distribution

Candidate targets:
- fantasy-point median / quantiles
- boom probability
- bust / near-zero probability
- ceiling/floor bands

### 2.5 Decision layer

Candidate targets:
- pairwise probability that A outscores B
- expected lineup utility
- expected regret under feasible alternatives

This decomposition lets backtesting answer *why* a forecast failed. CCF can be right about role and wrong about efficiency, or wrong about playing time while the conditional efficiency model was reasonable. Those are different engineering problems.

---

## 3. Historical truth must be point-in-time truth

The limiting factor for trustworthy backtesting is historical evidence quality, not model complexity.

Each historical prediction row should ultimately be reconstructable from an immutable decision-time evidence package containing, where available and permitted:

- exact `as_of` decision timestamp and timezone
- source retrieval time and `known_at`
- source/product identity and parser version
- immutable raw trace / archive reference
- scoring profile fingerprint
- roster and lineup constraints
- player/team canonical identity
- availability/injury/practice evidence
- observed role and usage history
- opponent and scheme context
- schedule context
- venue/roof/weather evidence
- betting/market evidence that existed by the cutoff
- expert/challenger evidence stored separately from native CCF inputs
- materially missing evidence and explicit unavailable states

### 3.1 Availability time beats event time

A fact having happened before kickoff is not enough. It is eligible only if FFCC could have known it before the declared decision cutoff.

Examples:
- a stat correction posted Monday cannot alter a Sunday-morning feature
- a depth-chart update published after lineup lock cannot backfill the pre-lock packet
- a closing line cannot be used for a prediction frozen hours earlier
- a provider's `date_modified` is not automatically proof of public availability

### 3.2 Multiple decision horizons

Historical evaluation should eventually support distinct fantasy-relevant checkpoints rather than pretending one weekly timestamp represents every decision:

- early-week / waiver horizon
- post-practice horizon
- Sunday morning / pre-inactives horizon
- post-inactives / pre-lock horizon where league rules permit

A model may be excellent at T-15 minutes and mediocre at T-24 hours. Those are different products and must not be mixed into one score.

### 3.3 Missingness is data

Missing evidence must never silently become a favorable value or a negative label. Historical coverage reports should measure:
- source availability
- field availability
- missingness by season, position, team, and source
- revision/correction frequency
- population exclusions and their reasons

---

## 4. Population integrity and survivor-bias controls

The backtest population must be defined before evaluation.

Include or explicitly account for:
- active starters
- backups receiving sudden opportunity
- injured players
- players who fail to return
- diminished returns
- recurring setbacks
- traded players
- rookies and low-history players
- players who disappear from relevance
- negative and failed feature hypotheses

Do not build a dataset only from players who later became fantasy-relevant. Famous breakout/comeback cases are tails, not baseline setters.

Outcome missingness must remain `missing`, not be relabeled as zero or failure unless the target definition explicitly says so.

---

## 5. Chronological model-development discipline

### 5.1 Rolling origin

Train only on the past, validate on the next unseen period, and test on a later unseen period. Roll forward and repeat.

### 5.2 Final one-touch holdout

A final certification window must remain untouched during feature design, threshold setting, calibration choice, and hyperparameter selection. It is accessed once after the candidate and promotion gates are frozen.

### 5.3 Nested selection when needed

If model families/hyperparameters are compared, selection happens inside training/validation data. Final test performance cannot be used to choose among candidates and then be reported as unbiased performance.

### 5.4 Deterministic identity

Every run must bind at least:
- protocol fingerprint
- model/version
- dataset fingerprint
- source-plan fingerprint
- scoring-profile fingerprint
- feature-set fingerprint
- decision-policy fingerprint
- train/validation/test windows
- code revision / reproducible implementation identity

Old runs are append-only. A new dataset or scoring profile creates a new comparison identity rather than rewriting history.

---

## 6. Strong baselines and challengers

CCF should earn complexity.

### 6.1 Required CCF-owned simple baselines

At minimum:
- historical mean
- recent mean
- usage-rate baseline

Additional native baselines should be added as their inputs become point-in-time trustworthy:
- position-conditioned mean
- role-conditioned baseline
- simple regularized linear/logistic model
- simple recency-weighted model

### 6.2 External challengers

Potential challengers:
- market / betting information
- ECR / expert consensus
- prior CCF release
- TIBER outputs

These remain challengers. The native CCF result is frozen first so external consensus cannot silently pull it toward the crowd.

### 6.3 Diagnostic oracles

Post-outcome or otherwise unavailable information may be used only as clearly labeled *diagnostic upper bounds*, never as promotable predictors.

Examples:
- actual snap share as an opportunity oracle
- actual game activation as an availability oracle

Oracle comparisons can answer useful decomposition questions such as: "If opportunity had been known perfectly, how much error would remain in efficiency?" They cannot authorize production features.

---

## 7. Paired evaluation and uncertainty

Player rows within one NFL week are correlated. Treating every player-week as an independent observation produces false precision.

CCF v1 therefore uses paired block uncertainty for promotion comparisons.

Default block candidate:
- season-week

Within each bootstrap draw, whole time blocks are resampled so shared game/week shocks remain grouped.

Report:
- paired sample size
- independent block count
- candidate and comparator mean loss
- mean paired improvement
- confidence interval
- bootstrap probability candidate is better

Subgroup claims need their own independent support. Thousands of player rows spread across only a few weeks are not thousands of independent experiments.

Multiple metrics and many subgroups create multiple-comparison risk. Promotion criteria should designate a small primary family; exploratory slices remain diagnostic unless separately preregistered.

---

## 8. Calibration and sharpness

Calibration and sharpness must be reported together.

A uselessly wide interval can achieve high coverage. Therefore interval reporting should include:
- observed coverage
- coverage error from the nominal target
- mean interval width
- median bias / MAE

Probability reporting should include:
- Brier score
- log loss
- base rate
- mean forecast
- reliability bins
- expected calibration error
- maximum calibration gap
- support per bin

Probabilities should be calibrated only from training/out-of-fold or validation predictions. Final holdout outcomes cannot be used to fit calibration.

---

## 9. Feature-family ablation and incremental value

A feature remains recommendation-critical only because it demonstrates incremental value, not because its mechanism sounds plausible.

For each governed feature family, run:

### 9.1 Leave-one-family-out

`full model` vs `full model - family`

This estimates whether the family adds value in the presence of all other information.

### 9.2 Single-family-only

`family only` variants estimate how much independent signal the family contains before interactions.

Candidate families may include:
- prior / historical performance
- role / usage
- team environment
- opponent / matchup
- injury/readiness
- weather
- market
- scheme
- news-derived evidence

### 9.3 Interaction testing

Important football mechanisms often live in interactions:
- wind × passing depth
- OL availability × pressure environment × QB mobility
- goal-line role × team implied points
- route participation × vacated targets × competition

Do **not** generate an uncontrolled combinatorial interaction search. Promote interaction families only after a preregistered hypothesis and nested validation.

### 9.4 Redundancy and mediation

If removing a feature family causes no deterioration, determine whether:
- it contains no useful signal, or
- its information is already captured by another family.

This distinction matters for source cost and system simplification.

---

## 10. Negative controls and leakage canaries

A serious backtest should try to prove itself wrong.

Required v1 controls:
- post-cutoff evidence rejection
- future corrections rejection
- current-depth-chart backfill rejection
- closing-market leakage rejection
- outcome-field mutation invariance
- identity-join leakage rejection
- missing outcomes not coerced to negatives
- label permutation
- future-feature canary

Useful additional controls:
- random-noise feature
- deliberately stale source snapshot
- shuffled player identity within safe synthetic fixtures
- source outage / unavailable-state replay

A model that appears to gain material performance from a random or impossible future canary fails the backtest, regardless of headline accuracy.

---

## 11. Decision regret is a first-class metric

For lineup decisions:

`regret = best feasible realized lineup utility - chosen realized lineup utility`

Important details:
- "feasible" must respect the exact roster/slot/lock constraints that existed at decision time
- the chosen option must be part of the feasible set
- regret should be evaluated only when outcomes for the relevant alternatives are actually available
- abstentions are tracked separately

Report at minimum:
- mean regret
- median regret
- p90 regret
- max regret
- zero-regret rate
- catastrophic-regret rate at a preregistered threshold

This prevents a one-point start/sit miss from being treated as equivalent to a 25-point lineup error.

---

## 12. Error Intelligence: diagnose misses without teaching on every loss

Every meaningful miss should be reconciled against one primary cause:

1. `model_error`
2. `evidence_error`
3. `calibration_error`
4. `decision_policy_error`
5. `regime_change`
6. `irreducible_variance`

Contributing tags can identify mechanisms such as:
- missing source evidence
- late-breaking evidence
- source revision
- parser/ingestion defect
- identity-resolution defect
- feature-construction defect
- missed role transition
- missed interaction
- distribution-tail miss
- overconfidence / underconfidence
- abstention failure
- objective mismatch
- suspected regime shift
- variance without actionable pregame signal

### 12.1 Important governance rule

**A post-outcome attribution never authorizes a model update by itself.**

Attribution is diagnostic. A proposed correction becomes a new hypothesis that must return through training/validation and the frozen promotion protocol.

Otherwise CCF would learn directly from regret and overfit every surprising Sunday.

### 12.2 Error severity

Track frequency and decision impact separately. A rare error family causing massive regret may deserve more attention than a frequent two-tenths-of-a-point miss.

Aggregate:
- count/share by cause
- mean and total regret by cause
- major-miss count
- season/position/role clustering

---

## 13. Regime, drift, and out-of-distribution behavior

Football is not stationary.

Potential regime context:
- league pass/rush environment
- shotgun/motion prevalence
- defensive shell tendencies
- RB committee prevalence
- fourth-down aggressiveness
- scoring environment
- rule/officiating changes
- coaching/system changes

Do not assume era adjustments help. Test them.

Future robustness layer should measure:
- feature-distribution drift
- prediction-error drift
- calibration drift
- source-coverage drift
- subgroup drift

When a case lies materially outside historical support, CCF should prefer wider uncertainty or abstention over false precision.

---

## 14. Hierarchical learning and small samples

Players with little history should borrow strength rather than inherit brittle fixed tables.

A future native hierarchy can be tested along the path:

`league prior -> position prior -> archetype prior -> player prior -> team/system -> current role -> matchup`

Potential benefits:
- rookies
- backups elevated suddenly
- players changing teams
- post-injury returns
- rare usage profiles

Shrinkage strength must be learned and evaluated chronologically. Hand-set priors do not become CCF authority merely because they are reasonable.

---

## 15. Separate role updating from noisy scoring updating

The Week-1 prior-protection doctrine generalizes:

Update faster from:
- snaps
- routes
- target/touch share
- goal-line role
- personnel grouping
- QB/team role changes

Shrink more heavily:
- touchdowns
- long plays
- one-game yards/target
- one-game yards/carry
- box-score fantasy points without supporting role change

The exact update rates remain empirical hypotheses until walk-forward validation supports them.

---

## 16. Counterfactual and decomposition diagnostics

Backtests should support questions beyond "was the forecast wrong?"

Examples:
- If actual opportunity were supplied as a diagnostic oracle, how much forecast error remains?
- If injury evidence is removed, does performance worsen only for return-from-injury players or globally?
- If market evidence is removed, does CCF become worse only in high-uncertainty games?
- Does expert evidence add anything after native usage/matchup evidence is known?
- Are weather effects concentrated in specific passing-depth/venue combinations?

These diagnostics help identify the next useful modeling hypothesis without granting post-outcome information production authority.

---

## 17. Robustness and failure injection

Before promotion, evaluate graceful degradation under:
- missing source family
- stale source family
- provider outage
- contradictory evidence
- unresolved player identity
- last-minute status change
- missing market/weather data
- malformed optional feature

The correct result can be wider uncertainty or abstention. Silent fallback to legacy/TIBER/external projections is forbidden for a `CCF_PRIMARY` claim.

---

## 18. Prospective shadow validation

Historical replay is necessary but not sufficient.

Once a candidate passes historical gates, run it prospectively in shadow mode:
- freeze weekly predictions before the decision cutoff
- store immutable receipts
- do not tune from the same week's outcome before the next governed update cycle
- score after official outcomes/corrections settle
- compare with the frozen production release and challengers

Prospective evidence is especially valuable for source behaviors that cannot be truthfully reconstructed historically.

---

## 19. Complexity budget

Every added subsystem or feature family incurs:
- source/licensing cost
- historical coverage burden
- parser/version burden
- calibration burden
- interaction risk
- debugging surface
- opportunity for leakage

Therefore complexity must show incremental frozen OOS value. If a simple model is statistically indistinguishable from a complex candidate, prefer the simpler model until stronger evidence exists.

---

## 20. Implemented now

The stacked predictive-validation branch adds the following CCF-native infrastructure without claiming any performance gain:

1. `ccf-predictive-validation-protocol-v1`
   - binds model/data/source/scoring/feature/decision-policy identity
   - requires chronological train/validation/test windows
   - requires simple baselines
   - preregisters targets, metrics, subgroups, feature families, anti-leakage controls, negative controls, sample policy, uncertainty policy, and promotion thresholds
   - requires one-touch final holdout, native-before-challenger freeze, TIBER-off replay, failed-candidate retention, append-only history, and immutable frozen external-evidence boundary

2. Paired block bootstrap
   - deterministic seeded replay
   - whole time-block resampling
   - paired mean-loss improvement
   - confidence interval
   - probability candidate is better
   - refuses to manufacture interval certainty with insufficient independent blocks

3. Decision-regret evaluator
   - exact feasible-outcome regret contract
   - abstention rate
   - mean/median/p90/max regret
   - zero-regret and catastrophic-regret rates

4. Miss-attribution contract
   - canonical six-cause taxonomy
   - contributing-cause tags
   - severity and regret/error magnitude
   - outcome-known timing validation
   - explicit `modelUpdateAuthorized: false`
   - causal-class summary by frequency and regret

5. Feature-ablation plan
   - deterministic full-model control
   - leave-one-family-out variants
   - single-family-only variants
   - plan fingerprint

6. Calibration hardening
   - central-80 coverage error
   - mean interval width
   - Brier score
   - log loss
   - base rate and mean forecast
   - expected calibration error
   - maximum calibration gap

7. Append-only backtest history entry recording this milestone as `not_run` with no numeric predictive claims.

---

## 21. Highest-priority future execution queue

### P0-A — Build the first production-candidate historical dataset

Required before any real score:
- player × game × decision-as-of rows
- immutable point-in-time evidence references
- exact eligibility/availability semantics
- parser/source fingerprints
- outcome storage separated from features
- scoring-profile fingerprint
- population/censoring report
- source coverage/missingness report

### P0-B — Freeze CCF Baseline 1.0

Before final evaluation, freeze:
- exact supported population
- forecast targets
- feature families
- simple baseline definitions
- decision objective
- calibration method candidates
- train/validation/final-test windows
- minimum sample support
- primary promotion metrics
- promotion thresholds

### P0-C — Build the executable backtest runner and immutable result artifact

Runner must:
- ingest a frozen dataset only
- execute rolling-origin folds
- forbid final-test access during fitting/selection
- evaluate required simple baselines
- run paired block uncertainty
- run TIBER-off
- emit deterministic result receipts
- append rather than overwrite progression history

### P0-D — Add anti-leakage negative-control execution

Convert the protocol declarations into executable attacks for:
- future feature canary
- label permutation
- post-cutoff source injection
- closing-line substitution
- future depth-chart substitution
- outcome mutation
- corrected-stat substitution

### P0-E — Decision-level lineup replay

Reconstruct exact feasible historical lineups and calculate lineup regret under league scoring/slot/lock constraints. Do not approximate feasible alternatives from final rosters if players were unavailable or locked at the decision timestamp.

### P1-A — Opportunity/role submodels

Chronologically validate native models for:
- P(play)
- snap share
- route participation
- target/touch opportunity
- high-value/goal-line usage where historical definitions are supportable

Only then test whether combining those outputs improves fantasy-point distributions.

### P1-B — Distribution and tail modeling

Add native quantiles / boom / bust targets, proper scoring rules, calibration fitting on OOF/validation predictions, and selective-prediction curves.

### P1-C — Diagnostic oracle decomposition

Add non-promotable actual-opportunity and actual-activation oracle arms to quantify whether remaining error comes from role prediction or conditional efficiency.

### P1-D — Stronger CCF-owned challengers

Add simple regularized position-specific models and recency-weighted baselines. Complexity must beat these, not only raw historical means.

### P1-E — Disagreement analysis

Measure whether CCF-vs-baseline/market/expert disagreement contains predictive information. External disagreement may become a diagnostic feature only if independently reproduced and promoted as CCF-native evidence; never create majority-vote recommendation authority.

### P1-F — Hierarchical/shrinkage models

Evaluate league -> position -> archetype -> player -> team -> role -> matchup partial pooling for sparse-history players.

### P1-G — Drift/OOD layer

Measure feature/calibration/error drift and define when uncertainty should widen or CCF should abstain.

### P1-H — Prospective shadow ledger

After historical promotion gates pass, freeze live weekly shadow predictions and score them later as an additional evidence lane.

### P2-A — Regime intelligence integration

Test era and structural-league features only after core native model/data gates are stable.

### P2-B — Interaction-family experiments

Preregister a small set of mechanism-driven interactions and evaluate incremental OOS value. Avoid combinatorial search.

### P2-C — Cross-surface value

Extend proven native outcome distributions into waivers, trades, keeper/dynasty, playoff simulation, and other surfaces only after each surface defines its own utility/regret objective.

---

## 22. Promotion gate

A production CCF candidate may be called predictively certified only when all of the following are true:

1. historical dataset identity is frozen and auditable
2. source eligibility and point-in-time semantics are proven
3. protocol and promotion thresholds were frozen before final-test access
4. chronological OOS evaluation completed
5. required simple baselines were evaluated on identical paired rows
6. primary-metric improvement passes the preregistered threshold
7. required uncertainty/confidence condition passes
8. calibration is acceptable and not achieved through uselessly wide intervals
9. subgroup stability meets the frozen sample/stability policy
10. anti-leakage and negative controls pass
11. feature-family ablations do not reveal that claimed value comes from an unintended/leaky dependency
12. TIBER-off replay succeeds or CCF explicitly abstains
13. recommendation authority graph contains only eligible CCF-native critical paths
14. failed candidates/negative findings are retained
15. final result is appended to immutable history rather than replacing earlier evidence

Until then, the correct status remains **not run / research / candidate**, regardless of how promising the architecture looks.

---

## 23. Non-goals

This work does **not**:
- claim current predictive superiority
- invent historical data
- retune a model after viewing the final holdout
- promote TIBER, experts, or market consensus to CCF authority
- make medical diagnoses or infer undisclosed medical facts
- equate engineering test coverage with football predictive skill
- treat every bad outcome as a model failure
- allow one great season or one subgroup to carry the entire promotion result

The goal is narrower and more demanding: **build a system in which genuine predictive edge can be demonstrated, localized, reproduced, and safely promoted—or rejected—without fooling ourselves.**
