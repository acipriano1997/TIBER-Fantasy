# Red-Zone Usage Consumer Contract

**Status:** downstream contract / staged capability definition  
**Owner in this repository:** TIBER-Fantasy consumer boundary  
**Canonical source authority:** TIBER-Data (or another explicitly promoted governed producer)  
**Runtime activation:** only fields already present in the current Silver schema are activated by the accompanying ETL fix; richer fields below remain unavailable until a governed upstream contract exists.

## Purpose

Red-zone usage is high-value opportunity evidence. TIBER-Fantasy should preserve it as observed usage and expose it to downstream decision systems without treating touchdowns as the opportunity itself, fabricating missing values, or allowing the same signal to enter a recommendation multiple times through overlapping composites.

This contract separates:

1. observed red-zone opportunity;
2. observed scoring outcomes;
3. derived shares/trends;
4. modeled fantasy inference.

Those layers must remain distinguishable in provenance and downstream weighting.

## Current baseline in TIBER-Fantasy

`silver_player_weekly_stats` already contains:

- `rz_targets`
- `rz_rush_att`

The current Silver ETL derives both from `bronze_nflfastr_plays` using `yardline_100 <= 20`. The accompanying persistence fix ensures the already-computed aggregates are copied into the player-week record and written on insert/update.

These two fields are the only red-zone metrics activated by this change. No new database columns or recommendation weights are introduced here.

## Desired governed weekly evidence

A future promoted red-zone payload should use canonical player identity and carry season/week/team context plus explicit source metadata. At minimum, the evidence model should be able to represent the following observed opportunity fields when the source supports them.

### Rushing opportunity

- `rush_att_inside_20`
- `rush_att_inside_10`
- `rush_att_inside_5`
- `qb_designed_rush_att_inside_20`
- `qb_designed_rush_att_inside_10`
- `qb_designed_rush_att_inside_5`
- `qb_scramble_att_inside_20`
- `qb_scramble_att_inside_10`
- `qb_scramble_att_inside_5`

Designed QB rushes and scrambles must remain separate when source semantics allow the distinction. If they cannot be distinguished reliably, the producer must expose the combined observed rushing count and mark the split fields unavailable rather than infer a split locally.

### Receiving opportunity

- `targets_inside_20`
- `targets_inside_10`
- `targets_inside_5`
- `end_zone_targets`
- `routes_inside_20` only when routes are directly observed from a governed participation/tracking source

Estimated routes must never be presented as observed red-zone routes.

### Team denominators

To support opportunity-share calculations without hidden assumptions, the same governed weekly snapshot should provide or make derivable:

- team rush attempts inside 20 / 10 / 5;
- team targets inside 20 / 10 / 5;
- team end-zone targets;
- team red-zone offensive plays when available.

## Outcomes are separate from opportunity

The following are outcomes and must not be folded into raw opportunity counts:

- rushing touchdowns by zone;
- receiving touchdowns by zone;
- passing touchdowns;
- red-zone conversions / scoring rate.

Touchdowns and conversions may inform finishing/conversion efficiency or fantasy-point distributions, but they must not be counted again as additional opportunity. This is an explicit anti-double-counting rule.

## Derived features

Derived features belong in a clearly labeled derived layer. They must be reproducible from eligible observed evidence and must preserve their as-of cutoff.

Examples include:

- player share of team inside-20 rush attempts;
- player share of team inside-10 rush attempts;
- player share of team inside-5 rush attempts;
- player share of team red-zone targets;
- player share of team end-zone targets;
- high-value opportunity count combining selected rushing/receiving opportunity without adding touchdowns as extra touches;
- rolling 1-, 3-, and 6-week opportunity/share trends;
- season-to-date rates through the requested week.

### Denominator rules

- A share is `null` / unavailable when its team denominator is missing or zero.
- Missing raw observations must not be silently converted to zero.
- A true observed zero is valid only when source coverage for that player/team/week is known to be complete enough to support zero.
- Rolling windows use only source-eligible weeks at or before the as-of week. No future-week leakage is permitted.

## Provenance and coverage

Every promoted red-zone snapshot must make the following inspectable either per record or through an attached dataset envelope:

- producer/source identifier;
- dataset/version identifier;
- season and week;
- as-of timestamp or source publication timestamp;
- identity key and identity-resolution status;
- coverage state for each optional metric group;
- observed vs derived classification;
- derivation/version metadata for shares and rolling features.

Recommended coverage states are explicit values such as `available`, `partial`, `unavailable`, and `stale`. Consumers must fail closed rather than substitute a confident numeric default for unavailable evidence.

## Invariants and quality gates

When all nested-zone fields are available, the following invariants must hold:

- `rush_att_inside_5 <= rush_att_inside_10 <= rush_att_inside_20 <= total_rush_attempts`
- `targets_inside_5 <= targets_inside_10 <= targets_inside_20 <= total_targets`
- `end_zone_targets <= targets_inside_20` when the producer's end-zone-target definition is a subset of red-zone targets
- all counts are non-negative integers
- all shares are within `[0, 1]`
- player shares use the matching team/week/zone denominator
- rolling features contain no weeks after the requested as-of week

Violations should produce a quality failure or explicit unavailable/partial state, not normalization that hides the defect.

## Downstream CCF / FFCC use

Red-zone evidence may contribute to role/opportunity, expected-touchdown probability, expected fantasy points, ceiling/bust distributions, role-change detection, waiver/trade evidence, and lineup decisions. Downstream consumers must preserve these rules:

1. **CCF-first authority.** External rankings or expert signals do not silently determine how red-zone evidence is weighted.
2. **Opportunity before result.** High-value opportunity is the primary role signal; touchdowns are outcomes and are modeled separately.
3. **Role-aware interpretation.** RB goal-line work, WR/TE end-zone targeting, and QB designed goal-line rushing are not interchangeable features even if they all increase TD probability.
4. **No double counting.** A composite that already includes high-value opportunity must not separately add the same inside-5 / end-zone evidence again without an explicit orthogonal transformation.
5. **Uncertainty travels.** Sparse samples, partial source coverage, and unstable team roles reduce confidence rather than being replaced with league-average certainty.
6. **Point-in-time eligibility.** Lineup, waiver, trade, and backtest decisions may only use red-zone evidence available by the decision's frozen as-of time.

## Staged implementation path

### Stage 0 — existing-field persistence

Activated by the accompanying TIBER-Fantasy ETL fix:

- persist `rz_targets`;
- persist `rz_rush_att`;
- no schema changes;
- no scoring/recommendation activation.

### Stage 1 — upstream governed contract

Canonical producer defines and validates the richer weekly raw fields, denominators, provenance, and coverage semantics. TIBER-Fantasy consumes only a promoted/versioned boundary.

### Stage 2 — derived red-zone feature view

Build deterministic shares and rolling 1/3/6-week trends from the promoted evidence with as-of eligibility tests and denominator guards.

### Stage 3 — model integration

Integrate the derived evidence into CCF-native opportunity / TD-probability / distribution features. Before promotion, run ablations and leakage checks to prove that incremental red-zone features improve calibration or decision quality rather than merely duplicating existing xFP/role features.

### Stage 4 — product inspection

Expose the signal in player/decision evidence surfaces with source, freshness, sample size, trend, and unavailable states. UI is an inspection layer and must not become the source of truth.

## Acceptance criteria for richer activation

Richer red-zone evidence is not considered production-ready until:

- upstream ownership and versioned schema are explicit;
- nested-zone invariants are tested;
- unavailable and true-zero states are distinguishable;
- team denominators are validated;
- point-in-time backtests show no leakage;
- opportunity/outcome double-counting tests pass;
- CCF integration has an ablation showing incremental value or is intentionally retained as explanatory evidence only;
- failure of the upstream source results in explicit missing evidence rather than fabricated continuity.
