# CCF Market Intelligence v0

**Status:** Foundation only; not recommendation-authoritative.

## Purpose

Create a CCF-owned, vendor-neutral market-evidence layer that can ingest sportsbook prices across sports without allowing betting markets to become hidden recommendation authority.

The cross-sport objective is to learn market behavior — bookmaker reliability, price discovery, movement persistence, disagreement, maturity and information response — while keeping football-specific translation inside CCF.

## Authority boundary

Sportsbook evidence is external evidence. It may become a calibrated CCF feature only after chronological out-of-sample testing demonstrates incremental value.

Market data must never:

- replace the CCF player outcome model;
- be treated as independent simply because multiple books publish the same number;
- use raw implied probability without vig handling where a complete mutually exclusive market is available;
- receive a fixed "sharp book" weight without empirical evidence;
- use a quote that was not known by the decision `as_of`;
- infer neutral or healthy conditions from unavailable market evidence;
- leak closing prices or later line movement into historical decisions.

## v0 implemented boundary

`server/modules/ccf/market/marketEvidence.ts` provides:

- `ccf-market-evidence-v1` vendor-neutral evidence contract;
- sport, league, event, bookmaker, market and selection identity;
- captured/retrieved/known timestamps;
- `knownAt <= asOf` eligibility enforcement;
- raw trace requirements;
- explicit available/unavailable semantics;
- American and decimal odds normalization;
- raw implied probability conversion;
- proportional vig removal for complete mutually exclusive snapshots;
- single-book/single-market snapshot normalization;
- deterministic price/line movement calculation;
- no fantasy-impact, sharpness, steam or bookmaker-quality claims.

## Cross-sport architecture

```text
raw sportsbook observations
  -> CCF market evidence contract
  -> point-in-time archive
  -> price / vig normalization
  -> market identity + echo/dependence controls
  -> bookmaker / sport / league / market-type reliability learning
  -> movement, disagreement, maturity and information-shock features
  -> NFL-specific translation
  -> CCF scenario / outcome model
  -> frozen recommendation
```

Cross-sport priors may inform bookmaker/market reliability, but NFL-specific evidence must update or override those priors when enough NFL observations exist.

## Required future data

Historical and live feeds should preserve, when permitted by source/license:

- bookmaker;
- sport and league;
- event identity and scheduled start;
- market type and market identity;
- player/team/selection identity;
- line/threshold;
- price;
- quote status;
- provider capture time;
- CCF retrieval time;
- CCF known time;
- source/raw trace reference;
- opening/current/closing snapshots derived from the time series rather than overwritten fields.

NFL priority markets:

1. game moneyline/spread/total;
2. team totals;
3. passing yards/TDs/attempts/completions/interceptions;
4. rushing attempts/yards;
5. receptions/receiving yards;
6. anytime and multi-touchdown markets;
7. alternate lines where coverage and liquidity are sufficient.

## Bookmaker dependence / echo control

Multiple books quoting the same price are not multiple independent votes.

Before cross-book consensus can affect CCF, the system must estimate dependence using observable behavior such as:

- lead/lag relationships;
- move origination frequency;
- convergence timing;
- shared price jumps;
- market-specific tracking behavior;
- historical closeness to later consensus/close;
- source/feed relationships where known.

The first implementation should prefer effective-sample-size or cluster weighting over naive book counts.

## Candidate learned features

These remain blocked until sufficient historical data exists:

- bookmaker reliability prior;
- sport-specific bookmaker reliability;
- league-specific reliability;
- market-type reliability;
- lead/originator score;
- consensus dispersion;
- market maturity;
- movement persistence;
- steam breadth;
- information-shock magnitude;
- cross-market consistency;
- NFL fantasy translation features.

None should be hand-weighted into recommendation authority.

## Promotion experiment

Use frozen chronological decisions and compare:

- **A:** CCF without market features;
- **B:** CCF with NFL-only market features;
- **C:** CCF with NFL features plus cross-sport learned market priors.

Evaluate at minimum:

- fantasy projection MAE/RMSE;
- quantile coverage and calibration;
- start/sit decision utility;
- Brier/log loss for modeled binary events where applicable;
- subgroup stability by position and market type;
- performance after removing closing/future information;
- incremental value beyond existing football, injury, weather and expert evidence.

Cross-sport learning is promoted only if C materially and stably improves on B out of sample. Market features are promoted only if B or C materially improves on A without unacceptable calibration or subgroup regressions.

## Maintenance cadence

Once real data is connected:

- continuously archive eligible market snapshots during active collection windows;
- weekly in NFL season: refresh NFL market diagnostics and drift checks;
- monthly: recompute broader bookmaker/market fingerprints;
- quarterly: rerun deeper cross-sport validation/challenger comparisons;
- offseason/preseason: full-season recalibration and structural review;
- event-driven: trigger review when calibration, book-to-close behavior, coverage or source structure materially drifts.

Calendar refreshes update evidence and learned parameters; they do not automatically authorize architectural changes.

## v0 completion definition

The foundation is complete when:

- contract validation passes;
- odds conversion and vig-removal tests pass;
- future-known evidence is rejected;
- unavailable evidence remains explicit;
- market movement is computed without assigning unsupported labels such as `sharp` or `steam`;
- the CCF independence gate runs the market evidence tests.

## Explicitly not complete

This v0 does **not** claim:

- a live or historical sportsbook provider integration;
- comprehensive cross-sport coverage;
- bookmaker reliability weights;
- sharp/public classification;
- steam detection;
- closing-line value prediction;
- cross-market consistency inference;
- NFL fantasy-impact weights;
- Beat Vegas recommendation authority;
- production certification.
