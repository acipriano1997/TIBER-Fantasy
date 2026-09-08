# Breakout v1 Data Requirements

This file defines the data readiness contract for an accuracy-focused breakout v1. It is intentionally conservative: a feature family is admissible only when its historical values can be replayed truthfully as of each feature cutoff.

## Required minimum data

### Identity

- stable canonical NFL player ID
- season/year alignment
- position
- team of record
- rookie year / true career year

Identity conflicts are exclusions, never name-based guesses.

### Production and opportunity

- games played
- PPR fantasy points / PPG
- targets
- receptions
- receiving yards / TDs
- team pass attempts or equivalent team target denominator
- target share
- air-yards share
- WOPR or ingredients needed to derive it from same-cutoff data

### Market

Historical comparable redraft ADP is strongly preferred because the intended draft decision is about identifying players the market is undervaluing. Each snapshot must carry:

- source
- format/scoring context
- observation date
- target season
- player identity
- rank/ADP
- source population semantics

Absence from a snapshot is not equivalent to being undrafted unless source coverage proves that interpretation.

## Optional high-value data

These may be admitted only after historical replay coverage is audited:

- routes run
- route participation
- snap share
- vacated targets
- projected depth-chart position from a frozen source
- injury-contingency opportunity
- draft capital
- age

## Coverage admission rule

For every candidate feature:

1. report non-null coverage by feature season;
2. report event/non-event missingness separately;
3. reject features whose availability is strongly outcome-dependent unless the missingness mechanism is modeled and justified;
4. never backfill historical values from a current source;
5. pin source version/content digest used for every fold.

## Data-readiness terminal states

- `ready_for_v1a`: minimum identity + production/opportunity + sufficient historical outcomes are replayable; market may be optional for a football-only challenger.
- `ready_for_market_v1`: governed comparable historical ADP is also replayable.
- `partial`: enough for exploratory research but not promotion.
- `blocked`: insufficient history, identity, or outcome seam for honest evaluation.

TIBER-Fantasy must not infer a more favorable state than the producer/data owners declare.
