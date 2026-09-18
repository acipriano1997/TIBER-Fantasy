# CCF / TIBER Independence Workplan

## Program objective

Move TIBER from recommendation-critical infrastructure to optional challenger evidence while making CCF the primary authority for weekly fantasy decisions.

## Priority order

### P0 — Dependency census

Deliverables:

- inventory every producer used by weekly rankings and start/sit;
- tag each critical input as `ccf_native_fact`, `ccf_native_derived`, `ccf_native_model`, `tiber_model`, `external_consensus`, `external_projection`, or `challenger_only`;
- identify hidden fallbacks;
- emit a machine-readable critical-feature provenance graph;
- block CCF-primary promotion while any TIBER model/grade/projection/value remains recommendation-critical.

Exit condition: a frozen weekly decision can identify the producer family of every critical input.

### P1 — Native outcome contract

Deliverables:

- versioned QB/RB/WR/TE player outcome contract;
- p10/p25/p50/p75/p90 plus mean/median where supported;
- boom/bust, volatility, confidence, coverage, abstention;
- mechanism contributions and critical provenance;
- scoring adapter for PPR and half-PPR;
- deterministic serialization and range invariants.

Exit condition: fixtures validate without any TIBER output fields.

### P2 — Native feature spine

Deliverables:

- role/opportunity features;
- efficiency features with regression and sample-size uncertainty;
- team/game environment;
- opponent and scheme-interaction features;
- betting-market context;
- injury/readiness evidence;
- weather/venue evidence;
- temporal/source eligibility on every feature.

Exit condition: native features can be regenerated from source-backed evidence as of a frozen decision time.

### P3 — Native weekly distribution v0

Deliverables:

- deterministic seeded scenario mixture;
- bounded football correlations;
- native outcome distribution;
- immutable pre-challenger result;
- explainable mechanism contributions.

Exit condition: CCF can generate valid distributions for QB/RB/WR/TE with TIBER disabled.

### P4 — CCF-INDEP-001 certification runner

Deliverables:

- `CCF_NATIVE` mode;
- `TIBER_CHALLENGER` mode;
- `EXTERNAL_BASELINE` mode;
- `FULL_EVIDENCE` mode;
- hidden-dependency assertions;
- fixture matrix covering injury, weather, role changes, scoring formats, replacement players, volatility, sparse evidence, and disagreement;
- machine-readable ablation report.

Exit condition: functional/provenance independence passes for weekly player outcomes.

### P5 — Evaluation

Deliverables:

- frozen out-of-sample historical evaluation;
- central-error metrics;
- quantile loss and empirical coverage;
- boom/bust probability calibration;
- downstream ranking/start-sit decision accuracy;
- slice analysis by position, injury state, volatility, favorite/underdog, weather, season segment, and scoring format;
- comparison against simple baseline and incumbent TIBER path.

Exit condition: no material calibration regression versus a simple baseline; CCF is competitive with or better than the incumbent path overall, and weaker slices are explicitly known.

### P6 — Downstream promotion

Certify in order:

1. weekly player outcome;
2. weekly ranking;
3. lineup/start-sit;
4. replacement/value utility;
5. ROS;
6. waiver;
7. trade;
8. draft;
9. dynasty/rookie/devy.

Do not promote a downstream surface whose recommendation-critical upstream surface remains uncertified.

## TIBER retention policy

Keep TIBER where it adds value, but only as:

- challenger model evidence;
- historical research;
- explicit priors when separately authorized;
- source-backed facts with intact provenance;
- benchmark/backtest comparison.

Do not spend time recreating legacy TIBER components whose mechanism is superseded by a stronger CCF design.

## Current smallest next build

The next implementation slice is deliberately narrow:

1. dependency census for weekly ranking/start-sit;
2. native `CCFPlayerOutcome` contract;
3. deterministic fixture-only native distribution path;
4. TIBER-off assertion test.

Do not add advanced ML until this slice can prove provenance-complete independence end to end.
