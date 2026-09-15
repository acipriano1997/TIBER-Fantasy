# CCF Market Perception Intelligence v0

## Status

**FOUNDATION ONLY / DIAGNOSTIC MARKET INTELLIGENCE / NO RECOMMENDATION AUTHORITY.**

This document integrates the useful public design lessons from DD Fantasy Football's Artificial Dynasty Value (ADV) into a CCF-owned architecture without reproducing a proprietary formula, depending on ADV, scraping protected content, or allowing market buzz to overwrite football truth.

The implementation owner is **CCF Market Perception Intelligence (MPI)**.

Core principle:

> **Football value and market price are different truths. CCF owns football evaluation. MPI observes market perception. Disagreement between them is information, not an instruction.**

## Public research anchors studied 2026-09-15

- DD Fantasy Football public site: https://www.ddfantasyfootball.com/
- DD Fantasy Football Radio, *The Dynasty Fantasy Football SECRET WEAPON You Should Be Using*, published 2026-08-29: https://podscan.fm/podcasts/dd-fantasy-football-radio/episodes/the-dynasty-fantasy-football-secret-weapon-you-should-be-using

The public ADV explanation emphasizes live market perception rather than only static rank: direction, frequency, rate of change, independent-source corroboration, trading activity, current market position, and the player's nearby market neighborhood. It also explicitly treats disagreement between an evaluator and the market as potentially actionable rather than assuming the market is football truth.

These are mechanism observations only. CCF does not claim knowledge of or equivalence to DD's proprietary implementation.

## 1. Separation of truths

Preserve four layers.

### Layer A — native football truth
CCF-native role, opportunity, health/readiness, matchup, scheme, weather, scoring and predictive systems estimate football outcomes and player utility.

Market evidence cannot silently mutate these native features or their frozen decision packet.

### Layer B — market-perception truth
MPI describes what the dynasty/fantasy market appears to believe at a specific point in time:
- current market standing when a comparable level is available;
- recent positive/negative directional pressure;
- change in that pressure across time windows;
- breadth of independent corroboration;
- source concentration / echo risk;
- nearby players in the same market neighborhood.

This layer can be useful even when the market is wrong about football.

### Layer C — disagreement diagnostics
A later validated CCF consumer may compare native CCF evaluation with MPI market standing on a common, frozen comparison basis.

The disagreement itself is not a buy/sell signal. It is a hypothesis such as `market premium`, `market discount`, `market converging`, or `market diverging` that must be tested against decision utility.

### Layer D — decision policy
Trade, roster and dynasty decisions remain CCF-owned. Market evidence may influence a decision policy only after an explicit frozen chronological OOS validation proves incremental utility for that decision surface. Weekly projection authority remains separate.

## 2. Implemented v0 contract

`server/modules/ccf/market/marketPerception.ts` adds source-agnostic deterministic contracts.

### `ccf-market-signal-evidence-v1`
Every signal carries:
- stable signal/player/format/source identity;
- source family and signal kind;
- `observedAt`, `knownAt`, `sourceRef`;
- normalized direction and magnitude;
- optional source-normalized market-level percentile.

Temporal rule:

`observedAt <= knownAt <= decision asOf`

Future evidence fails closed. Missing market evidence is never converted into neutral sentiment.

### Independent source identity
`sourceId` means the originating independent source, not the adapter, scraper, repost, aggregator page or downstream account that repeated it.

A repeated item from one origin must not become five independent votes merely because it appears on five surfaces.

V0 therefore collapses repeated observations within one source before applying source-family weight.

### `ccf-market-perception-policy-v1`
The policy freezes:
- fast and medium windows;
- minimum independent-source coverage;
- explicit source-family weights;
- source-collapse semantics.

There is deliberately **no hidden production default policy** in v0. Any weights/windows intended for real decisions must be versioned, frozen and validated rather than hand-tuned after outcomes are known.

### `ccf-market-perception-snapshot-v1`
Outputs:
- fast-window directional pressure;
- medium-window directional pressure;
- `momentumDelta = fastPressure - mediumPressure`;
- source-normalized market-level percentile where available;
- raw signal count;
- independent-source count;
- independence ratio;
- source-weight concentration;
- participating source families and source refs.

Every snapshot is explicitly:
- `diagnosticOnly: true`
- `recommendationAuthority: "none"`

### `ccf-market-neighborhood-v1`
Builds an auditable nearby-player ladder from eligible snapshots sharing the exact same `formatId` and `asOf`.

This captures the useful ADV concept that a number is less informative than the players immediately above and below it. It emits no trade recommendation.

## 3. Why FFCC does not clone a single ADV-like score

A composite score is convenient for display but creates three risks:
1. hidden weighting can mix fundamentally different evidence types;
2. a visually precise number can imply more certainty than the market evidence supports;
3. backtesting a monolith makes it harder to learn which component actually provides decision value.

MPI keeps market level, direction, momentum, breadth, independence and concentration separately observable. A future display score is allowed only if it is a transparent read model over frozen components and does not become a new authority owner.

## 4. Echo / correlation guardrail

The same underlying report can propagate through news, X, YouTube, podcasts and rank updates. Counting each appearance as independent evidence would manufacture confidence.

V0 protects against the simplest form by collapsing one `sourceId` before weighting. Production work must go further with provenance-linked echo detection so derivative reports can reference a common root event/source.

The system should prefer:

`five genuinely independent signals`

over
`one report repeated five times`.

## 5. Relationship to existing CCF predictive validation

PR #33 already defines:
- `market_challenger` as a report-only validation arm;
- `market_disagreement` as a subgroup dimension;
- `closing_market_leakage_rejected` as a required anti-leakage control;
- CCF-owned comparators only for promotion;
- frozen native-before-challenger evaluation;
- external evidence barred from mutating the frozen packet.

MPI composes with those rules rather than bypassing them.

A later historical evaluation should include at minimum:
- MPI-off native replay;
- MPI challenger diagnostics;
- frozen CCF-vs-market disagreement buckets;
- decision-specific utility testing for trade/dynasty surfaces;
- no market evidence after the historical decision cutoff;
- no closing/settled market state used to predict an earlier market state.

## 6. Intended consumers

### Trade Analyzer
Highest-value future consumer. Show:
- market neighborhood;
- direction/momentum;
- evidence breadth/echo risk;
- CCF-vs-market disagreement after a common comparison contract exists;
- whether a proposed trade exchanges into or out of rapidly changing market perception.

The final recommendation remains CCF-owned and league-specific.

### Player Lens / Dynasty board
Show market movement next to, not inside, football evaluation. Example conceptual separation:
- `CCF football outlook`
- `market standing`
- `market momentum`
- `agreement / disagreement`

### Portfolio / roster exposure
Later use market movement to identify where roster value is concentrated in rapidly appreciating/depreciating assets without treating that as projected fantasy scoring change.

### Waivers / redraft
Use cautiously. Dynasty-market evidence may be irrelevant or misleading for redraft decisions. Consumer policies must be format-specific.

## 7. Source admission boundary

V0 intentionally includes **no live provider adapter**.

Before any source becomes production-eligible, CCF must establish:
- intended-use permission / terms compatibility;
- stable identity and format semantics;
- exact capture time and point-in-time archive strategy;
- correction/update behavior;
- player identity joins;
- missingness and coverage;
- raw traceability;
- rate limits / operational reliability;
- whether the signal is original evidence or derivative/echoed evidence.

Potential research categories include public/licensed crowd market values, startup ADP, actual trade activity, expert rankings, news, social, video/audio and league-local transaction evidence. A category name is not source approval.

ADV itself may be used later only as an external challenger if access and intended-use permission make that legitimate. CCF must remain fully operable without it.

## 8. Historical dataset and backtesting requirements

A trustworthy market-intelligence model requires a player × format × timestamp ledger, not today's final values reconstructed backward.

Required historical row identity should bind:
- player and format;
- exact `asOf`;
- signal/source identities;
- original `knownAt`;
- policy version;
- market snapshot fingerprint/version;
- CCF model/decision packet identity where disagreement is evaluated.

Primary questions should be preregistered separately:
1. Does market momentum predict **future market movement** after the cutoff?
2. Does CCF-vs-market disagreement predict **decision utility** for dynasty trades?
3. Which source families add unique signal after correlated/echoed evidence is controlled?
4. Does market information improve decisions without degrading native football calibration?
5. When should the system abstain because source coverage is thin or concentrated?

Do not judge MPI only by future fantasy points. It is primarily a market-perception system; market prediction and football prediction are distinct targets.

## 9. Production queue

### P0 — source and point-in-time spine
- audit candidate sources and intended-use permissions;
- choose the minimum viable production source set;
- capture immutable point-in-time raw snapshots;
- build fail-closed versioned adapters into `ccf-market-signal-evidence-v1`;
- establish canonical player/format identity;
- record source corrections and outages without rewriting historical `knownAt`.

### P0 — provenance / echo graph
- distinguish originating source from repost/aggregator/derivative discussion;
- attach root evidence refs where discoverable;
- measure source-family and root-event concentration;
- prevent syndicated/repeated news from inflating corroboration.

### P0 — historical validation
- freeze first historical market dataset;
- freeze first MPI policy before holdout access;
- add rolling-origin market replay;
- test source-family ablations;
- test fast/medium window alternatives prospectively or on validation only;
- evaluate market-movement calibration and rank quality;
- record failed candidates append-only.

### P1 — CCF / market disagreement
- define a common comparison-pool contract instead of subtracting incomparable raw scores;
- compute rank/percentile disagreement by format and player pool;
- evaluate whether disagreement adds trade-decision utility;
- separate `market wrong`, `CCF wrong`, `timing difference` and `irreducible negotiation variance` in post-outcome review.

### P1 — consumer surfaces
- Player Lens market strip;
- Trade Analyzer market context;
- dynasty board movers and neighborhoods;
- portfolio exposure to market momentum;
- explicit unavailable/low-independence states.

### P2 — league-local market intelligence
- learn whether an individual league's actual trades, manager tendencies and roster scarcity differ materially from public market consensus;
- never expose private manager inference as certainty;
- local market may override generic acquisition feasibility only through validated league-specific decision policy, not native player projection.

## 10. Anti-goals

Do not:
- reproduce or reverse-engineer a proprietary ADV formula;
- scrape protected/paywalled ADV data;
- require ADV/DD for FFCC operation;
- let market sentiment become native player talent/role truth;
- let buzz directly change weekly fantasy-point projections;
- count reposts as independent corroboration;
- fill missing signals with zero/neutral values;
- use current/closing market data in earlier historical decisions;
- use one global dynasty market across incompatible scoring/roster formats;
- emit `BUY`, `SELL` or `HOLD` merely from positive/negative momentum;
- treat market consensus as proof that CCF is wrong;
- silently tune weights/windows after inspecting the final holdout.

## 11. Promotion rule

V0 can be merged as a **diagnostic contract foundation** once focused tests and CCF Independence are green.

No live market source, CCF-vs-market recommendation feature, trade-policy influence or user-facing buy/sell call is promoted by this foundation.

The first recommendation-affecting market feature must prove incremental, chronological OOS decision utility under the existing CCF predictive-validation contract while preserving CCF-native football authority and a full MPI-off replay.
