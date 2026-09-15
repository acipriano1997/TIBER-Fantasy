# CCF Native Opportunity Derivation v0

**Status:** FOUNDATION / SOURCE-GATED / NON-AUTHORITATIVE  
**Scope:** Fantasy Football Command Center only.  
**Parent:** CCF-first independence foundation (#25).

## Purpose

CCF needs native role/opportunity evidence before it can own weekly player outcome distributions. This module defines a deterministic game-level derivation layer without importing TIBER grades, third-party fantasy projections, hand-set role weights, or a provider-specific play-by-play parser.

The narrow pipeline is:

```text
promoted source-backed canonical play evidence
  -> complete-game + as-of validation
  -> deterministic CCF opportunity ledger
  -> later rolling/weekly feature construction
  -> later native outcome model
```

This is **not** a source promotion and **not** a projection model.

## Canonical input boundary

`ccf-game-opportunity-input-v1` accepts normalized play facts with:

- game/season/week/team identity;
- offensive-play inclusion;
- dropback and role-relevant rush-attempt facts;
- target/rusher identity;
- completed-pass fact;
- air yards;
- explicit **designed quarterback rush** vs scramble separation;
- down;
- distance to opponent goal line;
- two-minute state;
- offense-perspective score differential;
- exact `knownAt` and raw/source reference.

A future source adapter owns the mapping into these fields. The derivation engine deliberately does not guess provider semantics. In particular, the source normalizer must decide whether kneels, aborted plays, penalties/no-plays, spikes, and provider-specific QB classifications count toward each canonical fact.

## Fail-closed gates

Derivation requires:

1. `CCFSourceState` is `source_backed` and `promoted` at the target `asOf`;
2. the caller explicitly asserts complete game evidence;
3. at least one play exists;
4. every play matches the same game/season/week;
5. every play is known by `asOf`;
6. event IDs are unique;
7. excluded/no-play rows cannot secretly carry opportunities;
8. targets require dropbacks;
9. rushes require rusher identity;
10. rush and target opportunity cannot coexist on one normalized play;
11. completions/air yards require a target;
12. scrambles require both dropback and rush semantics;
13. scrambles and designed-QB-rush labels are mutually exclusive;
14. malformed field ranges fail rather than being clipped.

Missing/incomplete evidence is never converted into zero role.

## Derived team ledger

For each offense in the game CCF derives:

- offensive plays;
- dropbacks;
- role-relevant rush attempts;
- targets and receptions;
- air yards;
- red-zone opportunities (`yardline100 <= 20`);
- goal-line opportunities (`yardline100 <= 5`);
- two-minute opportunities;
- first-down opportunities;
- opportunities while leading, tied, and trailing.

These are deterministic definitions, not model weights.

## Derived player ledger

For each player with a carry or target CCF derives:

- carries, targets, receptions, touches;
- air yards;
- designed QB rushes and scrambles as separate facts;
- red-zone carry/target/opportunity counts;
- goal-line carry/target/opportunity counts;
- two-minute carry/target/opportunity counts;
- first-down carry/target/opportunity counts;
- opportunity counts while leading/tied/trailing;
- carry share;
- target share;
- combined carry+target opportunity share;
- air-yards share;
- red-zone, goal-line, and two-minute opportunity shares.

Zero-denominator shares remain `null`; CCF does not invent a neutral value.

`touches` means carries + receptions. Targets are preserved separately and are not mislabeled as touches.

## Provenance

The ledger is explicitly `ccf_native_derived` / `derived`, but only after the input source state itself passes native source eligibility.

The result preserves:

- source ID;
- `knownAt` equal to the latest eligible time across the promoted source state and supplied play evidence;
- deduplicated source references;
- game/season/week/as-of identity;
- deterministic ledger fingerprint support.

Player share outputs depend on both a player numerator and team denominator. Their `sourceRefs` therefore include the team-level denominator evidence as well as the player's direct opportunity evidence.

A locally implemented transform does not make a candidate external source native.

## Source status

No live PBP provider is promoted by this branch.

nflverse PBP is useful research/reference evidence, but nflverse's own terms note that underlying NFL data remain governed by their respective owners' terms. Until CCF completes intended-use permission, raw-trace, archive, parser, correction, completeness, and point-in-time review for a chosen PBP source, the production path remains source-gated.

Fixtures may use a synthetic `promoted` source state solely to certify engine behavior. That is test scaffolding, not a claim about a live provider.

## Next legitimate work

1. audit/select a permitted PBP source for FFCC's intended production/model use;
2. implement immutable capture and a versioned fail-closed source parser;
3. prove game completeness and correction semantics;
4. bind canonical IDs;
5. promote the source only after source-state gates pass;
6. add rolling prior-game windows and recency/regime features without leaking game-N outcomes into game-N pre-lock decisions;
7. compare opportunity-family additions through frozen chronological OOS ablations before they influence recommendation authority.

No player projection, fantasy-point coefficient, or recommendation weight is introduced by v0.