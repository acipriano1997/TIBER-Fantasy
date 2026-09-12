# CCF TIBER Capability Migration Audit

**Status:** active promotion blocker for CCF-first independence

## Executive verdict

No. CCF has not yet independently rebuilt and validated every high-value mechanism present across the current TIBER ecosystem.

The previous independence work correctly prevents TIBER/FORGE outputs from being silently treated as CCF-native, but dependency removal is not the same thing as capability migration. A system could technically run with TIBER disabled while still losing useful modeling machinery.

This audit therefore adds a second requirement:

1. **dependency independence** — no recommendation-critical TIBER model output is required; and
2. **capability migration** — high-value mechanisms discovered in TIBER have either been rebuilt and independently validated in CCF, kept explicitly challenger-only, or intentionally retired with evidence.

`CCF_PRIMARY` must satisfy both.

The machine-readable authority is:

`server/modules/ccf/independence/tiberCapabilityMigration.ts`

## Audit method

The audit mines mechanisms rather than copying outputs. Current trees and contracts were reviewed across:

- **TIBER-Forecast** — features, xFPG, diagnostics, uncertainty, calibration, subgroup evaluation, chronological backtests, benchmarks, scenario fusion, replacement/VORP, weekly/ROS separation, market comparison;
- **TIBER-Data** — identity/source assertions, truth-source governance, observation/provenance receipts, manifests, candidate/promoted lifecycle;
- **TIBER-Rookies** — age-adjusted production, breakout age, year-over-year trends, historical comps, transition profiles, landing/role/team context, historical NFL outcome calibration, and explicit model-demotion governance;
- **TIBER-Fantasy/FORGE** — legacy feature/pillar concepts versus final grade/rank authority.

For each capability, CCF assigns one disposition:

- `rebuild_native` — preserve the useful mechanism, but source/derive/refit/revalidate it inside CCF;
- `native_equivalent` — CCF already has an independently owned equivalent, but promotion evidence still governs certification;
- `challenger_only` — retain the external output only for disagreement/benchmark evidence;
- `intentionally_retire` — do not reproduce a mechanism that fails incremental-value, leakage, stability, or explainability standards.

## High-value Forecast mechanisms still missing from production-native CCF

The Forecast tree contains several mechanisms that CCF should preserve conceptually but does not yet have as promoted native production implementations:

| Capability | CCF status | Required action |
| --- | --- | --- |
| Opportunity-based xFPG / expected-points features | rebuild required | derive from CCF-owned PBP/opportunity evidence; validate by position |
| Usage / efficiency / matchup / team / player-arc feature families | partial | complete native producers and source lineage, then ablate on unseen data |
| Regression / fragility diagnostics | rebuild required | rebuild only mechanisms that add unseen predictive value |
| Empirical residual uncertainty / context buckets | rebuild required | calibrate intervals from historical residuals rather than supplied volatility |
| Calibration / reliability tables | rebuild required | position/scoring/context reliability and quantile/probability calibration |
| Chronological / rolling backtests | rebuild required | immutable point-in-time history + time-series evaluation |
| Simple benchmark models | rebuild required | mean, recent-trend, usage-only and other intentionally simple challengers |
| Subgroup stability | rebuild required | verify calibration/performance across position, experience, usage and coverage cohorts |
| Scenario fusion | rebuild required | bounded evidence updates that recompute tails/diagnostics after injuries, role changes, environment changes, etc. |
| Replacement / VORP | rebuild required | league/scoring/roster-aware native replacement layer |
| Separate ROS / seasonal model | rebuild required | separately targeted and calibrated ROS distributions |
| Consensus / external edge comparison | challenger only | retain disagreement analysis; never make consensus native projection authority |

CCF's exact league scoring engine is already an independent native equivalent. The CCF outcome contract also has strong quantile/probability/coverage/abstention semantics, but its current fixture engine remains certification scaffolding rather than the production model.

## High-value Data mechanisms

CCF should preserve the strongest TIBER-Data governance ideas without depending on TIBER-Data as an inference authority:

- canonical identity and explicit provider/source assertions;
- immutable source observations/snapshots and checksums;
- `known_at <= as_of` temporal eligibility;
- raw trace / manifest / parser-version provenance;
- candidate versus promoted lifecycle;
- explicit unavailable/missing semantics;
- supersession/correction lineage rather than silent replacement.

CCF has meaningful foundations here, including source snapshot hashing and temporal eligibility, but historical point-in-time coverage, direct identity mapping, and the full native source spine are not complete. These remain promotion blockers.

## High-value Rookie/Devy mechanisms

The useful intellectual property in TIBER-Rookies is not the final Rookie Alpha score. The mechanisms worth rebuilding are:

- age-adjusted production;
- breakout age;
- year-over-year development;
- draft capital and athletic/context normalization where source-valid;
- historical comparable-player construction with frozen reference populations;
- pre-draft talent separated from post-draft landing/role/team opportunity;
- rookie transition profiles;
- historical NFL outcome reconstruction and calibration;
- candidate-model promotion/demotion when an apparently sophisticated model fails to earn authority.

The final Rookie Alpha score/rank/weights remain **challenger-only**. They must not be copied into CCF and relabeled native.

## FORGE policy

Do not recreate FORGE merely for parity.

- final FORGE grades, rankings and legacy pillar weights remain challenger-only;
- individual football mechanisms may be mined from FORGE only if CCF can reproduce them from source-backed native evidence;
- each migrated mechanism must survive chronological out-of-sample ablation and stability testing before it becomes recommendation-critical.

This prevents architecture migration from preserving legacy bias simply because it already existed in-repo.

## Promotion evidence rule

A capability is not `native_certified` because equivalent code exists. Recommendation-critical migrated capabilities require the applicable combination of:

1. CCF-owned implementation;
2. immutable point-in-time eligible source data;
3. chronological out-of-sample evaluation;
4. calibration / interval reliability evidence;
5. ablation evidence showing incremental value;
6. subgroup/regime stability evidence;
7. a TIBER-off execution proving no hidden fallback.

The registry's `promotionEvidenceRequired` field records which evidence classes apply to each capability.

## Current state

The migration registry intentionally fails today. That is the correct result.

CCF may continue to use TIBER/FORGE/Rookie Alpha as external challenger evidence while native work proceeds, but those signals cannot silently determine CCF recommendations, confidence, or tails.

The next implementation order is:

1. immutable point-in-time native data spine and canonical identity;
2. native opportunity/xFPG + role/participation feature layer;
3. production weekly Player Outcome Engine;
4. empirical residual/tail uncertainty and calibration;
5. chronological backtest + simple benchmark + subgroup/ablation harness;
6. scenario/update engine for injury, role, matchup, market and weather evidence;
7. replacement/value and independently calibrated ROS model;
8. native rookie/devy translation and transition models;
9. full TIBER-off certification across all active decision surfaces.

No `CCF_PRIMARY` or "all best TIBER capabilities migrated" claim is admissible before the machine-readable registry is green.
