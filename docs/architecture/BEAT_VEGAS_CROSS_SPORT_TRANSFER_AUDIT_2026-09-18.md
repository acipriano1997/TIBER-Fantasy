# Beat Vegas Cross-Sport Transfer Audit — 2026-09-18

**Status:** research / held documentation only  
**Runtime activation:** none  
**Recommendation authority:** unchanged  
**Production source activation:** none

## Purpose

Identify statistical and market-analysis ideas from other sports that can improve the FFCC / TIBER "Beat Vegas" research lane without copying sport-specific noise, adding paid data dependencies, or assuming that a disagreement with the market is an edge.

The central lesson is:

> Transfer the statistical *structure* across sports, not the raw stat.

The best cross-sport ideas fall into two groups:

1. **process-vs-outcome modeling** — estimate the quality of the underlying opportunity before the noisy result; and
2. **market microstructure** — model how prices/consensus absorb information over time, rather than comparing one projection with one static market number.

## Current TIBER-Forecast market baseline

The existing TIBER-Forecast market layer already has useful foundations:

- deterministic projection-vs-consensus comparison;
- raw point/rank disagreement;
- trust-adjusted edge scoring;
- penalties for wide prediction intervals, fragility, event uncertainty, calibration weakness, and weak subgroup support;
- explanations that distinguish raw disagreement from supported disagreement.

Its own current documentation also identifies an important limitation: the market input is snapshot-to-snapshot, optional timestamp only, with no live market-state, injury-feed polling, or line-freshness model.

That makes market-state modeling the highest-value cross-sport transfer.

## Priority transfer map

| Cross-sport concept | Origin/example | FFCC / Beat Vegas translation | Priority |
| --- | --- | --- | --- |
| **Price path / line evolution** | Betting-market research across NFL, college basketball, soccer | Store opener, intermediate snapshots, current consensus and close; derive movement velocity, acceleration, reversals, time-to-kick and model-vs-market convergence | **P1** |
| **Market consensus + dispersion** | Multi-book soccer forecast research | Treat the market as a distribution: median/trimmed mean, dispersion, range, source count and stale-source flags rather than one consensus number | **P1** |
| **De-vigged probabilities / calibration** | Cross-sport odds forecasting | Normalize implied probabilities before model comparison; evaluate market and model with Brier/log loss/calibration instead of raw odds alone | **P1** |
| **Market-only baseline + residual model** | Forecasting/econometrics | Ask whether football features add repeatable value *after* a strong market-only baseline, not whether they correlate with outcomes | **P1** |
| **Process vs outcome expected metrics** | MLB xwOBA/xERA; soccer xG | Expand NFL expected-opportunity/outcome decomposition: expected TD, expected YAC, expected rush result, expected fantasy points vs actual conversion | **P1** |
| **Lineup/on-off interactions** | NBA lineup/on-off analysis | Empirical teammate redistribution: routes/targets/carries/high-value touches with/without players, shrinkage by sample and role | **P1** |
| **Component strength decomposition** | Tennis serve-vs-return models | Separate offense/defense components: receiver route skill vs coverage, QB clean-pocket vs pressure response, RB runner contribution vs blocking/front | P1/P2 |
| **Regime-dependent market trust** | Early-season NBA price-learning research | Change market/model blend and uncertainty by season phase, new coach/QB/system, injury regime and role reset | P2 |
| **Informed-vs-noise movement proxy** | College basketball line-movement research | Do not treat every move equally; test whether movement usefulness differs by market maturity, publicity, time-to-game, source depth and news state | P2 |
| **Stabilization / reliability curves** | Baseball and other high-event sports | Learn how many routes/carries/dropbacks/games each feature needs before it deserves normal weight; shrink unstable samples toward priors | **P1** |
| **Replacement-state modeling** | NBA/NHL lineup/goalie substitution thinking | Quantify the delta between starter state and replacement state rather than generic injury penalties | P2 |
| **Opponent-adjusted latent ratings** | Elo/Glicko family; tennis matchup models | Dynamic player/team strength with uncertainty and opponent quality; use as priors/context, not an independent bonus score | P2 |
| **Closing-market diagnostic** | Betting-market efficiency literature | Track whether FFCC disagreement at decision time predicts eventual market movement *and* outcomes; CLV-like diagnostics are validation evidence, not the objective itself | **P1** |
| **Publicity/sentiment residuals** | Betting-market efficiency research | Research whether highly public teams/games create systematically different residuals after controlling for market and football state; require strong holdout proof | P3 |

## 1. Market-state feature family

The current comparison should eventually be able to consume a point-in-time market-state object rather than one consensus value.

Candidate fields:

- market / prop identifier;
- outcome definition and exact scoring/stat basis;
- source count;
- opened_at;
- decision_cutoff;
- snapshot_at;
- time_to_event;
- opener;
- current consensus median;
- current consensus trimmed mean;
- minimum / maximum;
- inter-source dispersion;
- no-vig implied probability where the market supports probabilities;
- movement since open;
- movement over trailing 5m / 30m / 2h / 24h when observations exist;
- movement acceleration;
- reversal count;
- source disagreement trend;
- stale-source count / fraction;
- last material move time;
- model-minus-market residual at each snapshot;
- market close, stored **only after the fact** for validation.

Historical replays must expose only snapshots known by the decision cutoff. Closing values are labels/diagnostics and may never leak into historical recommendation features.

## 2. Market residual rather than "Vegas bonus"

Beat Vegas should not become:

model_projection + hand-coded_market_adjustment.

The safer architecture is:

1. produce the native football distribution;
2. construct a point-in-time market baseline/distribution;
3. measure the residual between the two;
4. estimate whether residuals of this type have historically contained incremental information;
5. abstain when the disagreement is poorly supported;
6. validate both against outcomes and later market movement.

This preserves CCF authority and lets the market act as a very strong challenger / information aggregator.

## 3. Cross-sport expected-value decomposition

### Baseball transfer

MLB Statcast separates quality of contact from realized results through expected statistics such as xwOBA and xERA.

NFL translation:

- expected receiving value from target geometry / route / coverage / throw quality;
- expected YAC vs actual YAC;
- expected rushing result given box/front/run concept/blocking;
- expected TD conversion given opportunity type;
- expected fantasy points from opportunity vs realized fantasy points.

The goal is to prevent recent conversion luck from masquerading as repeatable skill or role.

### Soccer transfer

Expected goals evaluates chance quality before finishing outcome.

NFL translation:

- classify each opportunity by underlying scoring/value probability;
- aggregate player opportunity quality separately from finishing/conversion;
- regress unstable finishing/TD conversion appropriately toward role/archetype priors.

### NBA transfer

NBA lineup data evaluates combinations rather than players entirely in isolation.

NFL translation:

- teammate on/off opportunity redistribution;
- QB/receiver and OL/RB interaction;
- personnel-package-specific opportunity;
- injury replacement state;
- combination effects with shrinkage for small samples.

### Tennis transfer

Serve/return models explicitly decompose two competing mechanisms.

NFL translation:

- offense ability and opponent resistance should often be modeled separately before interaction;
- examples: route-family ability × coverage responsibility; pressure generation × pass protection; receiver win skill × defender responsibility; runner creation × blocking/front environment.

## 4. Beat-Vegas validation doctrine

Every proposed market feature must beat these controls:

### A. Market-only baseline

A candidate football feature must improve a strong point-in-time market-only model on frozen unseen data.

### B. Native-model baseline

It must also improve native CCF/Forecast performance, or improve decision calibration, rather than merely reconstructing what the football model already knows.

### C. Time-order control

No close, later line, later injury state or later lineup information can appear before its true known-at timestamp.

### D. Line-movement diagnostic

For a model/market disagreement at time T, record whether the market later moved toward the model, away from it, or remained stable.

This is useful evidence, but **movement toward the model is not automatically proof the model was correct**.

### E. Outcome diagnostic

Evaluate:
- log loss / Brier score where probabilities exist;
- calibration;
- MAE / pinball loss for continuous distributions;
- subgroup stability;
- economic threshold simulations only after statistical evidence exists.

### F. Negative controls

Examples:
- shuffled market snapshots;
- post-event/late information blocked;
- random-book/source labels;
- irrelevant public-team/popularity features;
- close injected into training as a deliberate leakage sentinel that must be caught.

## 5. Important external lessons

### Strong markets are hard baselines

A 2026 soccer study tested recent player information against recalibrated closing bookmaker probabilities on a held-out season and found no reliable improvement from the tested player features. That is a useful warning for Beat Vegas: candidate analytics must beat the market baseline out of sample, not merely sound football-smart.

### Consensus can be more informative than one source

Research using many soccer bookmakers found that individual books did not fully incorporate information contained in competitors' odds. Multi-source consensus and disagreement therefore deserve first-class representation.

### Later prices often contain more information

NFL and college-basketball market studies found later/closing lines generally contained more information than earlier prices, consistent with information entering the market over time. FFCC should model the *path* of price formation, while keeping later prices unavailable to earlier historical decisions.

### Price moves are not uniformly informative

College-basketball research found the information content of movement differed with the likely mix of informed vs noise traders. FFCC should test context-dependent movement quality rather than assume "line move = sharp truth."

## 6. Open/public-source policy

Production FFCC remains paywall-free and source-governed.

Acceptable directions include:

- open/public odds snapshots with stable terms and provenance;
- official/public league data;
- nflverse/open datasets;
- internally derived features from admitted public evidence;
- public academic methods reimplemented against TIBER-owned/open inputs.

Commercial/paywalled products, proprietary charting, or restricted feeds may be used to understand what classes of analysis exist, but never as hidden production dependencies.

## 7. Recommended implementation order

### Beat Vegas BV-1 — Market State Contract

Held-prework contract only:
- point-in-time market snapshot;
- source count/dispersion;
- normalized probability fields;
- opener/current/close lifecycle semantics;
- stale/unavailable states;
- strict known-at cutoff.

### BV-2 — Historical Market Tape

Only after an admissible open source exists:
- append-only snapshots;
- immutable source receipts;
- point-in-time replay;
- closing snapshot stored as post-decision validation label.

### BV-3 — Market Residual Evaluation

Preregister:
- market-only baseline;
- native-model baseline;
- residual model;
- Brier/log loss/calibration or distribution metrics;
- frozen chronological holdout;
- subgroup and regime tests.

### BV-4 — Cross-Sport Structural Challengers

Evaluate one family at a time:
1. empirical on/off redistribution;
2. process-vs-outcome expected metrics;
3. component offense/defense decomposition;
4. stabilization/reliability curves;
5. regime-dependent market trust.

No family earns production influence without repeatable incremental evidence.

## Bottom line

The most promising cross-sport upgrade for Beat Vegas is **not another collection of prediction stats**.

It is a market-aware causal/forecasting architecture that combines:

- better process metrics;
- player-combination state;
- explicit uncertainty;
- point-in-time market consensus and dispersion;
- the full path from opener to close;
- strict market-only ablation;
- and honest abstention when the market already contains the information.

That turns "Beat Vegas" from a projection-disagreement score into a rigorous test of whether FFCC knows something incremental that the market had not yet fully priced.
