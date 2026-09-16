# FFCC Uncertainty State Registry — USR-0

Status: **pure-domain implementation, runtime inactive**.

Authority lineage: Prometheus-Frameworks/TIBER-Fantasy #389 (architecture), #393 (contract freeze), #394 (implementation slice).

## Why this exists

Fantasy decisions are often made while the upstream football state itself is unresolved: committee allocation, target hierarchy, starter identity, return-from-absence role, scheme usage, or an offensive-regime change. USR represents that uncertainty explicitly instead of hiding it inside one depth-chart label, one point estimate, or one confident sentence.

The core representation is:

`known facts + competing states + missing/conflicting witnesses + resolution policy + state-specific consequences + replayable point-in-time history`.

## Record family

USR-0 freezes an append-only family rather than one mutable situation row:

- `SituationDefinitionV0`
- `SituationEvaluationSnapshotV0`
- `SituationResolutionReceiptV0`
- `SituationReopenReceiptV0`
- `SituationCorrectionReceiptV0`
- `ScenarioBranchBindingV0`
- `OperatorSituationOverlayV0`

A future read model may materialize current state from these records; the read model is disposable, the history is not.

## Resolution doctrine

### Fast
Direct authoritative, load-bearing evidence can resolve a narrowly scoped current-state claim when no material conflict remains.

### Medium
One deployment window can create a lean. Durable resolution requires repeated comparable deployment or an overwhelming deployment witness plus an independent direct role witness.

### Slow
One game cannot resolve an offensive-regime or durable scheme-persistence claim. USR-0 requires repeated windows plus context diversity before the deterministic v0 policy can resolve it.

No hidden weighted confidence score is used.

## Attention doctrine

Shared football attention is classified as:

`BACKGROUND | WATCH | ELEVATED | URGENT`.

The classifier consumes blast radius, load-bearing unknowns, source conflict and the timing of the next unresolved witness. It is not a player-value score and does not use operator roster exposure.

Operator-specific urgency lives only in `OperatorSituationOverlayV0` and cannot mutate shared resolution/support.

## Point-in-time and absence semantics

Evidence is eligible only when `knownAt <= asOf`.

`UNOBSERVED`, `UNAVAILABLE`, and future-known evidence remain indeterminate. `OBSERVED_ABSENT` is evaluative only when the witness explicitly defines observable-zero semantics and the observation comes from a closed, completely covered window.

Corrections append a correction receipt and replacement snapshot. Earlier belief state remains replayable.

## CCF boundary

USR does not create forecasts. `ScenarioBranchBindingV0` may map each declared football state to a coherent scenario reference. CCF can later consume those references as a joint branch so teammate consequences are not sampled independently.

Numeric state-probability binding is valid only when:

1. the state set is exhaustive;
2. every state is represented;
3. one promoted calibrated producer is referenced;
4. calibration and horizon references are explicit.

Qualitative support labels can never be converted to probabilities by USR.

## Synthetic certification pack

The module carries 15 synthetic golden traces:

1. three-back partial resolution;
2. workload management without probability;
3. QB cascade joint branches;
4. route/target hierarchy conflict;
5. one-game regime restraint;
6. return-from-absence reopen;
7. source conflict preservation;
8. incomplete state set rejecting calibrated mixture;
9. operator overlay isolation;
10. future witness rejection;
11. correction preserving prior belief;
12. valid material reopen;
13. observed absence requiring complete window;
14. conservation/undeclared-player rejection;
15. qualitative support not becoming probability.

All fixture identities and evidence are synthetic.

## Deliberate non-claims

USR-0 does not mean FFCC has a live league-wide uncertainty registry. It does not ingest news, injuries, PBP, depth charts, expert signals or market data. It does not persist records, watch sources, schedule checks, render UI, call CCF, alter recommendations or create any fantasy action.

Later stages must separately prove those integrations against the then-current CIF/CCF/source contracts.
