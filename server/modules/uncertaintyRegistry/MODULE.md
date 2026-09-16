# Uncertainty State Registry — USR-0

USR-0 is the provider-neutral pure-domain foundation for FFCC's shared football-state uncertainty layer.

Canonical design authorities: Prometheus-Frameworks/TIBER-Fantasy issues #389, #393, and #394.

## Purpose

When football truth is unresolved, USR preserves:

- known shared football state;
- explicit competing plausible states;
- missing/conflicting evidence;
- resolution witnesses;
- state-specific consequences;
- point-in-time evaluation history;
- deterministic attention classification;
- a reference-only scenario seam toward CCF.

USR never turns ambiguity into an unsupported starter label, point estimate, confidence percentage, or recommendation.

## USR-0 files

- `contracts.ts` — strict versioned shared-state records and enums.
- `canonicalizationCore.ts` / `canonicalization.ts` — deterministic SHA-256 record fingerprints.
- `policyCore.ts` / `policy.ts` — pure witness, resolution, attention, temporal, and scenario rules.
- `conservation.ts` — deterministic multi-player opportunity conservation constraints.
- `conformance.ts` — digest, lineage, resolution, correction, reopening, and append-only validation.
- `fixtures/usr0Fixtures.ts` — synthetic-only golden traces.
- `__tests__/` — focused fail-closed conformance tests.

## Ownership boundary

USR-0 does not own:

- source ingestion, retrieval, freshness, or conflict discovery — CIF/evidence infrastructure owns those;
- canonical identity creation — existing identity infrastructure owns it;
- operator-private hypotheses, holding cost, or roster-fit theses — Hypothesis Core owns those;
- fantasy-point distributions, calibration, or recommendation authority — CCF owns those;
- tail interpretation — Tail Risk owns that;
- operator-specific presentation — Team/product surfaces own that.

USR uses the canonical `tiber_player_id` validator but does not mint or reconcile identity.

## Hard invariants

1. **No fabricated probabilities.** `PLAUSIBLE`, `SUPPORTED`, and `LEADING` are categorical evidence-support states, not numeric probabilities.
2. **Calibrated scenario probabilities require an exhaustive state set** plus explicit producer, calibration, and horizon references. The full branch probabilities must sum to one.
3. **Missing/unobserved/unavailable is not observed absence.** Absence has evaluative meaning only under a closed, completely covered, explicitly observable window.
4. **Persistence matters.** Fast state can resolve from direct authoritative evidence. Medium state normally needs repeated/complementary evidence. Slow regime state cannot resolve from one game.
5. **Shared football truth is operator-independent.** Operator overlay can change urgency/action timing but cannot mutate shared support or resolution.
6. **History is append-only.** New evidence, correction, resolution, and reopening produce new records. Historical belief state is never rewritten.
7. **Reopening requires a material cause.** Ordinary one-game noise cannot reopen a resolved situation.
8. **Multi-player opportunity is conserved.** Scenario allocations cannot make incompatible role shares simultaneously true.
9. **USR does not execute CCF.** Scenario bindings contain references only.
10. **No runtime activation in USR-0.** There are no routes, schedulers, providers, database writes, UI components, alerts, or recommendation changes in this module.

## Resolution semantics

### Fast
A narrowly scoped current-state question may resolve from one matching direct-authoritative, load-bearing witness if no material conflict remains.

### Medium
One deployment sample may create a lean. Durable resolution requires repeated comparable support or an overwhelming deployment witness plus an independent direct-role witness. If another load-bearing role remains unknown, the situation is only partially resolved.

### Slow
One game can support a regime hypothesis but cannot resolve it. Two comparable windows may create a lean. The v0 default durable rule requires at least three supporting windows across at least two context keys, with no material conflict.

## Shared attention

USR returns only:

`BACKGROUND | WATCH | ELEVATED | URGENT`

This is an inspectable attention classifier, not a player grade or recommendation-confidence score. It uses blast radius, unresolved load-bearing witnesses, conflict, and witness timing.

## Synthetic fixtures

USR-0 ships 15 synthetic traces covering:

- three-back partial resolution;
- workload management without probabilities;
- QB cascade joint branches;
- route/target hierarchy conflict;
- one-game regime non-resolution;
- return-driven reopening;
- source conflict;
- incomplete state sets;
- operator overlay separation;
- future-evidence rejection;
- correction history;
- material reopen causes;
- observed-absence coverage requirements;
- opportunity conservation;
- qualitative-support/probability separation.

Real 2026 players, teams, and league assertions are intentionally excluded from these fixtures.

## Activation boundary

USR-0 is contract/conformance infrastructure only. USR-1+ live materialization, watchers, CCF scenario consumption, product surfaces, and any learned prioritization require separate review and promotion.
