# Contract Leagues

## Purpose

Define the normalized application boundary for user-specific salary-cap / contract-league state without making TIBER-Fantasy the authority for canonical NFL player identity or source-workbook truth.

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

Do not commit private roster/contract data, Drive file IDs, or private source URLs to this public repository.

## Ownership

- Canonical NFL player IDs remain owned by the governed identity layer / TIBER-Data.
- Platform league settings and NFL roster state remain owned by the platform adapter when available.
- Contract-league workbooks may supplement contract economics and contract-specific states that the platform does not represent.
- TIBER-Fantasy owns the user-facing normalized snapshot contract and eventual application persistence of validated snapshots.

## Scoring and lineup decisions

Football outcome distributions and league scoring are separate layers:

```text
football outcome distribution
-> league scoring translation
-> legal lineup-slot optimization
-> recommendation / explanation
```

A scoring profile must be explicit. Decision code must not silently substitute generic PPR when league scoring is missing or unresolved. The current legacy Start/Sit module does not satisfy this contract and is classified `EXTRACT`; do not broaden it with new recommendation logic.

## Current state

This module currently defines the normalized snapshot contract plus a fail-closed adapter into the generic fantasy-scoring translator. Persistence, private-source import, platform identity binding, and legal lineup optimization are follow-on work and must retain the fail-closed rules above.
