# CCF Lineup Decision Core

**Status:** scaffold implemented; production recommendation authority remains blocked.

This module owns the CCF-native complete legal-lineup decision policy. It does not own player projections, scoring ingestion, roster sync, injury truth, source qualification, predictive certification, or lineup writes.

## Decision inputs

The core consumes exact league/team/season/week identity, scoring and roster fingerprints, explicit starter-slot geometry, canonical player identity, availability/bye/lock state, CCF-native player outcomes, and the native weekly source-spine audit. Missing, stale, future-known, incompatible, ambiguous, or incomplete load-bearing inputs fail closed.

The weekly source-spine audit must be evaluated at the exact frozen decision `asOf`; a previously-ready audit cannot be replayed into a later decision. Outcome envelopes must bind to players in the frozen roster snapshot, and every selectable legal roster alternative must have a compatible CCF-native outcome.

FLEX and SUPERFLEX are represented by explicit eligible-position sets rather than a special heuristic.

## Frozen roster-state integrity

`rosterStateSnapshot.ts` content-addresses the weekly roster/legality state instead of accepting a free-floating caller fingerprint. The snapshot binds league, team, season, week, exact `asOf`, active roster-slot geometry, producer/source-plan identity, source snapshot reference, and every player's canonical identity/position plus availability, bye, observed starter slot, lock state, and lock timestamp.

Player presentation order is canonicalized out of the fingerprint. Any recommendation-relevant legality mutation changes the fingerprint, and a mutation paired with the old fingerprint fails verification. Production runtime composition must also prove the snapshot matches the exact active league/team/week/as-of/slot geometry/source plan before invoking the lineup core.

## Active-league position coverage

`positionCoverage.ts` is the fail-closed bridge between resolved league slot semantics and the native outcome universe. The league-context adapter must resolve active starter slots into canonical player-position families and prove all such families are supported before lineup optimization can be certified.

The current native weekly outcome contract supports QB/RB/WR/TE. K, DST and IDP families are explicitly unsupported today and block active-league lineup readiness rather than disappearing from the lineup.

## Objective boundary

`balanced` optimizes expected fantasy points. Expected lineup points are additive even when player outcomes are correlated.

`protect_downside` and `chase_spike` remain unavailable until CCF has a governed joint-lineup distribution producer. Summing marginal player P25/P90 values and relabeling them as lineup quantiles is prohibited.

A correlation-sensitive matchup win probability remains withheld until aligned governed lineup/opponent joint distributions exist.

## Human authority

The module never writes or applies a lineup. Final action authority remains human.

## Production release gate

`lineupReleaseGate.ts` keeps production promotion closed until one certified witness exists for each of:

- Unified League Context adapter;
- active-league position coverage wiring;
- frozen roster-state snapshot integrity;
- production weekly source spine;
- predictive validation;
- trusted lineup authority binding;
- chronological lineup decision/regret evaluation;
- TIBER-off replay;
- certified downstream route cutover.

The universal CCF release checklist consumes this gate directly. Code existence alone cannot promote the lineup surface.

## Legacy boundary

Do not add new recommendation logic to `server/modules/startSit/**`. That path remains frozen/legacy; this module is the CCF-native replacement lane.
