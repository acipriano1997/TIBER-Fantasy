# CCF Season Intelligence

## Purpose

This module formalizes in-season news, role, personnel, scheme, injury-state, and defensive-context evidence before it can become a CCF feature.

The module is an **evidence boundary**, not a recommendation engine. `ccf-season-intelligence-snapshot-v1` is permanently `recommendationAuthority: "none"`.

## Core rules

- Freeze evidence at an explicit decision boundary: event `knownAt <= snapshot.frozenAt <= snapshot.asOf`.
- Keep stable player-trait priors separate from mutable role priors. Season news may preserve, discount, or start a new role state, but it cannot silently erase the trait prior.
- Preserve `unavailable`, `stale`, and `conflicted` states. They are not neutral values.
- Conflicted evidence may widen uncertainty, but it cannot choose an up/down directional winner.
- Count independent evidence roots separately from source surfaces so mirrors and aggregators cannot become extra votes.
- Team/unit events only propagate to a player snapshot when their team scope matches.
- Source references are provenance pointers only. Their presence does not imply source promotion, intended-use permission, reliability certification, or native recommendation authority.

## Intended flow

```text
qualified point-in-time evidence
-> ccf-season-intelligence-event-v1
-> frozen ccf-season-intelligence-snapshot-v1
-> separately validated CCF feature transform
-> native outcome model / uncertainty handling
```

The final two steps are intentionally outside this module and require their own source, temporal, calibration, and authority gates.

## Validation

Focused tests live in `server/modules/ccf/intelligence/__tests__/seasonIntelligenceEvent.test.ts` and are registered in the CCF Independence workflow.
