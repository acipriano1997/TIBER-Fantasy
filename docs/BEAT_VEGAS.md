# Beat Vegas — CCF-First Market Validation Lab

## Current state

**RESEARCH ONLY / NON-CERTIFIED.**

Beat Vegas is the market-validation laboratory for the Fantasy Football Command Center. It is not a standalone picks engine, and this foundation does not claim a validated live odds feed, historical market replay, closing-line capture, calibrated betting edge, DFS ownership feed, or certified contest simulation.

The correct failure mode is an explicit research/shadow/unavailable state. Never invent a quote, substitute stale evidence, infer a fair probability from an incomplete market, or let an external consensus silently become recommendation authority.

## Authority doctrine

- CCF owns the canonical football forecast, uncertainty, and recommendation logic.
- Sportsbook prices are external challenger/validation evidence.
- DFS ownership and contest fields are external field-belief evidence.
- Expert/ECR signals remain separately provenance-tracked challenger evidence.
- Market or DFS signals may become CCF-native derived features only after frozen point-in-time out-of-sample evidence demonstrates incremental value.

## Canonical price chain

For an eligible market selection whose complete mutually exclusive outcome set is known, the inspectable chain is:

`CCF probability -> CCF fair odds -> market de-vigged probability -> offered odds -> probability edge -> expected ROI -> bet-to price`

The pricing layer returns math, not a BET/PASS verdict.

## Implemented foundation

### Canonical market evidence — inherited from CCF Market Intelligence v0

`server/modules/ccf/market/marketEvidence.ts` provides:

- sport/league/event/book/market/selection identity;
- captured/retrieved/known timestamps;
- temporal-order validation plus `knownAt <= asOf` anti-leakage enforcement;
- explicit unavailable semantics and raw-trace requirements;
- American/decimal odds normalization;
- raw implied probability;
- explicit expected selection cardinality for each bookmaker market snapshot;
- proportional vig removal only when the complete mutually exclusive selection set is present;
- normalized one-book market snapshots;
- deterministic line/price movement.

This matters for cross-sport use: a two-outcome NFL prop and a three-outcome soccer moneyline must not be normalized as though they have the same outcome structure. If market completeness is unknown, the raw quote may be retained as evidence but fair-probability normalization is blocked.

### Fair price / EV / price sensitivity

`marketPricing.ts` adds:

- model probability -> fair decimal/American odds;
- expected ROI and expected value at a stake;
- exact minimum acceptable decimal price for a required ROI;
- exact American `bet-to` price.

A bet-to price is a mathematical price threshold, not a recommendation.

### Cross-book Market Tape

`marketTape.ts` consumes the canonical evidence contract and exposes:

- each bookmaker's open and current eligible observation;
- observation count and movement by book;
- current best **usable** price;
- current de-vigged probability range/dispersion;
- current line range;
- stale-book and invalid-snapshot counts;
- explicit `usable | partial | unavailable` state.

A de-vigged snapshot is ineligible if any participating side was not known by the frozen `asOf`. Stale quotes never win best-price selection.

### Frozen audit scoring

`marketAudit.ts` freezes market provenance with the CCF decision and later scores:

- Brier score;
- log loss;
- market probability as a benchmark;
- CCF Brier improvement versus decision-time market;
- outcome-implied return at the recorded quote (explicitly not proof a wager occurred);
- closing probability movement;
- CCF probability residual versus close;
- offered price versus closing price when comparable closing odds exist.

Positive short-run ROI alone is never sufficient for certification.

## Promotion ladder

`beatVegasCertification.ts` defines three explicit states:

### RESEARCH

At least one prerequisite for trustworthy live shadow evaluation is missing. Contracts, deterministic math, tests, and clearly labeled research views are allowed. Recommendations are not.

### SHADOW

Validated live evidence may run in parallel, be frozen, and be scored. Recommendation authority remains locked while replay/calibration/model gates are incomplete.

### CERTIFIED

All surface-specific requirements pass. Only this state may set `recommendationAllowed=true`.

### Core gates

All promoted surfaces require certified CCF forecasts/distributions, point-in-time provenance, an immutable audit ledger, fail-closed consumers, and truthful UI labeling.

### Value Props / Game Markets

Shadow requires source-readiness gates plus a validated live market feed. Certification additionally requires historical market replay, verified closing-line capture, market calibration, and price-integrity validation.

### Correlated Markets

All market gates plus a certified joint football outcome model. Independent multiplication of marginal probabilities is prohibited as a promotion shortcut.

### DFS Lab

Shadow requires validated ownership sources/feeds and contest rules. Certification additionally requires a certified joint outcome model, opponent-field simulation, payout simulation, duplication modeling, and portfolio-risk validation.

## Product surfaces

1. **Market Tape** — book-level price history, best price, movement, dispersion, freshness, and later market-quality metadata.
2. **Value Props** — CCF distribution versus de-vigged market probability with fair price, EV, uncertainty, and bet-to price.
3. **Game Markets** — totals/team totals/spreads/moneylines evaluated by the same CCF-first framework.
4. **Correlated Markets** — locked until joint outcome simulation is certified.
5. **DFS Lab** — contest-specific field/payout/duplication/portfolio simulation, not projection-plus-ownership heuristics.
6. **Tracker / Audit** — calibration, Brier/log loss, CLV/close movement, edge decay, model-version and subgroup performance.

## Competitive design influences

Use mature services as workflow references, not as recommendation authorities or sources of copied proprietary models:

- Unabated: market tape, line shopping, price/market-quality workflow.
- OddsJam: no-vig/EV clarity, price sensitivity, CLV framing.
- Run The Sims: distribution-first prop/DFS reasoning.
- SaberSim: correlated game-state simulation, opponent-field and portfolio thinking.
- FantasyLabs: user-auditable historical trend/backtest exploration.
- Establish The Run: contest selection as part of DFS edge.
- Action Network: concise multi-signal UX with explicit provenance.

Avoid opaque "sharp money," public-bet percentages, black-box consensus scores, or expert agreement as recommendation authority.

## Remaining dependency-bound work

The next honest stage requires real evidence rather than more speculative scaffolding:

- approved/licensed market provider adapter(s) and immutable raw quote capture;
- normalized identity mapping and complete-market cardinality mapping across books/providers/sports;
- historical point-in-time market replay and closing-line reconstruction;
- frozen calibration/edge-decay/CLV studies;
- shared CCF joint game-state/outcome simulation;
- DFS ownership and contest ingestion;
- opponent-field, payout, duplication, late-swap, and portfolio simulations;
- surface-by-surface promotion evidence.

Until those gates pass, the `/command-center/beat-vegas` UI remains explicitly **RESEARCH ONLY**.
