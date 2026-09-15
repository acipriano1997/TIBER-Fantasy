# Contract Leagues

## Purpose

Define the normalized application boundary for user-specific salary-cap / contract-league state without making TIBER-Fantasy the authority for canonical NFL player identity, source-workbook truth, or league-constitution truth.

Contract support has two distinct responsibilities:

1. represent a replayable snapshot of current economic/competitive state;
2. later evaluate that state under an explicit, versioned league-policy profile to determine legal moves and deterministic cap/contract consequences.

Do not collapse those responsibilities into one schema.

## Source boundary

Private league workbooks or platform exports are **source inputs**. Source-specific parsing must occur before `contract-league-snapshot.v1` and must preserve:

- source league/team/player labels for auditability;
- exact season mapping;
- guaranteed, optional, and cap-hit money separately;
- dead cap and special roster states;
- negative cap remaining when the source says a team is over cap;
- unresolved player identity rather than guessed canonical IDs;
- source provenance and import timestamps;
- validation warnings and unresolved fields.

Do not commit private roster/contract data, Drive file IDs, private source URLs, or private league-rule values to this public repository.

## Ownership

- Canonical NFL player IDs remain owned by the governed identity layer / TIBER-Data.
- CCF owns football outcome distributions, fantasy decision modeling, uncertainty, and recommendation authority.
- Platform adapters own platform league identity/settings and NFL roster state when available.
- Private workbooks may supplement contract economics and contract-specific states that the platform does not represent.
- League constitutions/rules sources own custom league-policy truth when platform settings are insufficient.
- TIBER-Fantasy owns the user-facing normalized snapshot boundary, eventual application persistence, the versioned contract-league policy representation, and the deterministic transaction-consequence layer.

## State vs policy

A snapshot answers **what is true now**:

- contract schedule;
- guarantees/options/cap hit;
- dead cap;
- team cap ledger;
- roster/economic state;
- scoring/lineup context;
- provenance and unresolved fields.

A policy profile answers **what transformations are legal and how they change state**:

- cap enforcement and compliance windows;
- contract lengths/structures and acquisition-specific rules;
- cut/dead-cap consequences;
- retained salary / cap loans / transferable dead cap where allowed;
- extension, re-sign, restructure, option, amnesty, tag/RFA rights;
- rookie contract rules;
- roster-slot cap treatment;
- auction/bid legality;
- trade/pick/roster constraints;
- lifecycle deadlines and rule-effective dates.

`contract-league-snapshot.v1` should remain stable rather than absorbing policy merely because a private league or external platform exposes a new rule. Policy must be a separately versioned, provenance-aware follow-on boundary.

## Scoring and lineup decisions

Football outcome distributions and league scoring are separate layers:

```text
football outcome distribution
-> explicit league scoring translation
-> legal lineup-slot optimization
-> recommendation / explanation
```

A scoring profile must be explicit. Decision code must not silently substitute generic PPR when league scoring is missing or unresolved. The current legacy Start/Sit module does not satisfy this contract and is classified `EXTRACT`; do not broaden it with new recommendation logic.

## Contract decision architecture

```text
validated contract snapshot
+ versioned league-policy profile
+ exact decision timestamp / lifecycle state
-> legal move generator
-> deterministic transaction consequence engine
-> cap / contract / roster deltas by season

CCF fantasy outcome distribution
+ deterministic economic consequences
+ roster / contender-rebuilder context
-> contract-aware recommendation / explanation
```

The deterministic transaction layer owns legality and cap math. CCF may consume those results but must not independently reimplement league rules.

## Scenario safety

War Room / what-if simulations are read-only hypothetical state. They must:

- never mutate authoritative imported/platform state;
- expose rule violations rather than auto-correcting them;
- show current and future cap deltas;
- preserve scarce-right consumption in the simulated branch;
- carry a deterministic fingerprint so a scenario can be replayed;
- abstain when required policy is unavailable.

## Current state

This module currently defines the normalized snapshot contract plus a fail-closed adapter into the generic fantasy-scoring translator. Persistence, private-source import, platform identity binding, versioned league-policy representation, legal lineup optimization, deterministic transaction consequences, market valuation, and Contract League War Room behavior are follow-on work.

The durable follow-on scope lives in `.claude/tasks/contract-league-persistence-and-scoring.md`.
