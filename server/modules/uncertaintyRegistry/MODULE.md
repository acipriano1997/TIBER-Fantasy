# Uncertainty State Registry v0

USR-0 is the provider-neutral pure-domain slice for shared unresolved football state.
It implements the frozen semantics from Prometheus-Frameworks/TIBER-Fantasy #389,
#393 and #394 without activating a runtime registry.

## Public boundary

- `contracts.ts` owns strict closed Zod contracts and typed state vocabularies.
- `canonicalization.ts` owns `ffcc.usr.digest/jcs-sha256-v0` canonicalization and record fingerprints.
- `policy.ts` owns deterministic witness evaluation, resolution classification, shared-attention classification, point-in-time eligibility, scenario-binding validation and reopen/reevaluation rules.
- `conformance.ts` validates append-only cross-record history and definition/snapshot/scenario consistency.
- `fixtures/usr0Fixtures.ts` contains synthetic-only golden traces. No real 2026 player/team assertions are embedded.

## Core invariants

- Unknown football state is first-class state; it is not collapsed into one role label or point estimate.
- State support is categorical only: `UNASSESSED | PLAUSIBLE | SUPPORTED | LEADING | CONTRADICTED | RULED_OUT`.
- Qualitative support is never mapped to a numeric probability.
- Calibrated scenario probability binding is allowed only for an exhaustive state set with explicit producer, calibration and horizon references.
- Missing/unobserved/unavailable evidence is not negative evidence.
- Observed absence is evaluative only after a closed window with complete governed coverage and an explicit observable-zero policy.
- Fast, medium and slow persistence classes have different resolution requirements. One game cannot resolve a slow offensive-regime claim.
- Shared attention is ordinal (`BACKGROUND | WATCH | ELEVATED | URGENT`) and emits reason codes; there is no opaque uncertainty score.
- Operator overlays may change decision timing/presentation but never mutate shared football truth.
- Resolution, correction and reopening are append-only records. Routine one-game noise cannot reopen a resolved situation.
- CCF remains sole forecast/recommendation authority. USR can reference coherent scenario branches but cannot emit fantasy-point distributions or recommendation outputs.

## Explicit exclusions

USR-0 contains no database/store, provider clients, network calls, environment reads,
clock/random access, routes, scheduler, UI, alerting, discovery engine, source ingestion,
CCF execution, recommendation change, model probability producer, or autonomous fantasy action.

The module imports canonical player-ID validation only. It deliberately does not import
Hypothesis Core's operator-private envelope; shared USR state and operator-local hypotheses
remain separate domains.

## Promotion boundary

USR-0 certifies contracts and deterministic policy behavior only. Live materialization,
CIF watcher integration, CCF scenario-conditioned forecasts and product presentation belong
to later separately reviewed USR stages.
