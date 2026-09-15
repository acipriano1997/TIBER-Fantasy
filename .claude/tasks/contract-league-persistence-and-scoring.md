# Contract League Persistence and Scoring

## Status

Prepared 2026-09-15 from a live user request. Draft PR #37 owns the bounded foundation work. Repository issues are disabled on the user fork, so this task file is the durable scoped follow-on record.

## Goal

Make private contract/salary-cap leagues first-class FFCC league contexts with durable, provenance-aware contract state and league-specific scoring that can safely feed future lineup, trade, waiver, keeper, cut, and roster-planning decisions.

## Non-goals

- Do not commit private workbook contents, Drive IDs/URLs, team rosters, or contract values.
- Do not guess platform league IDs, player identities, scoring settings, or calendar-year mappings.
- Do not broaden the legacy `server/modules/startSit` recommendation engine; it is classified `EXTRACT`.
- Do not merge or deploy from this task without the repository's normal review/authority gates.
- Do not make contract economics alter the underlying football outcome distribution.

## Read first

- `AGENTS.md`
- `ARCHITECTURE.md`
- `CURRENT_PHASE.md`
- `.claude/AGENTS.md`
- `.claude/conventions.md`
- `CODEBASE_MAP.md`
- `server/modules/startSit/MODULE.md`
- `server/modules/contractLeagues/MODULE.md`

## Observed source requirements

The user's private source workbooks demonstrate that the normalized model must support:

- multi-year contract seasons;
- guaranteed and optional money as distinct components;
- annual cap hit, AAV, and total contract value;
- re-sign/amnesty/contract-structure metadata;
- dead cap;
- normal IR and season-ending IR semantics;
- team totals for guaranteed money, cap hit, cap after guarantees, and cap remaining;
- negative future cap remaining as valid evidence;
- source layouts where some tabs may use ordinal year labels rather than calendar years.

One league has an authoritative rules document proving a Superflex/full-PPR/TE-premium shape. The second league's exact scoring rules remain unresolved and must not be inferred from the roster workbook.

## Decision architecture

```text
football outcome distribution
-> explicit league scoring translation
-> legal lineup-slot optimization
-> recommendation / explanation

validated contract snapshot
-> contract economics / cap constraints
-> roster-management decision layer
```

## Phase A — normalized boundary (PR #37)

- `contract-league-snapshot.v1`
- explicit provenance and validation state
- unresolved identity allowed, never guessed
- explicit scoring + lineup fields
- generic fantasy scoring translator
- fail-closed adapter from snapshot scoring to translator
- synthetic regression tests

## Phase B — persistence

Prefer an append-only/versioned snapshot persistence boundary before designing highly normalized contract tables. Persistence must record at least:

- internal league key;
- schema version;
- source kind and private source reference token/opaque key;
- source modified/as-of timestamp;
- importer version;
- deterministic fingerprint;
- validation status/warnings/unresolved fields;
- normalized snapshot payload;
- imported/created timestamp.

Do not overwrite prior imports. A newer import supersedes through explicit lineage so old Canonical Decision Packets remain replayable.

## Phase C — private-source importer

Build a source-specific importer outside public fixtures. It must:

1. read source content through an authorized private integration/export path;
2. preserve source labels for auditability;
3. map calendar seasons explicitly;
4. reject or mark `PARTIAL` for ordinal year headers without an authoritative mapping;
5. separate guaranteed, optional, and cap-hit values;
6. reconcile derived team totals against source cap totals;
7. preserve negative cap remaining;
8. leave unmatched players unresolved for governed identity resolution;
9. emit `contract-league-snapshot.v1` only after validation.

## Phase D — platform / league binding

Where the contract league also exists on Sleeper/ESPN/Yahoo:

- platform remains authoritative for league identity, scoring settings, lineup slots, NFL roster state, starters/bench/IR, transactions, and matchups where available;
- private workbook supplements contract economics and contract-only states;
- conflicting evidence must be surfaced, not silently overwritten.

## Phase E — scoring-aware lineup optimizer

The current legacy Start/Sit engine is not an exact league optimizer. Build the new optimizer at the current FFCC/CCF decision boundary rather than adding new recommendation logic to the `EXTRACT` module.

Required behavior:

- input: frozen football outcome distributions, exact league scoring, exact lineup-slot eligibility, roster candidates, injury/readiness state, and decision timestamp;
- translate each player's football distribution into a fantasy-point distribution under that league's scoring;
- solve the legal lineup assignment deterministically;
- support QB/RB/WR/TE/FLEX/SUPERFLEX at minimum;
- preserve uncertainty/tail-risk outputs rather than optimizing a single mean only;
- abstain with explicit `SCORING_UNAVAILABLE`, `LINEUP_RULES_UNAVAILABLE`, or equivalent when critical inputs are missing;
- never default silently to generic PPR.

Regression matrix should include:

- standard;
- half PPR;
- full PPR;
- 4-point vs 6-point passing TD;
- TE premium;
- Superflex;
- different FLEX counts/eligibility;
- identical football stat line producing different fantasy outcomes across league profiles.

## Phase F — contract-aware decisions

After persistence and validation are certified, expose contract context to:

- cap space by season;
- expiring contracts;
- dead-cap/cut savings;
- extension/re-sign/restructure candidates;
- player value per cap dollar;
- trade affordability and post-trade cap trajectory;
- waiver/free-agent bid affordability;
- keeper/roster construction;
- multi-year fragility and flexibility.

Contract economics are decision context, not a football-performance feature.

## Done criteria

- Both private leagues can be imported and persisted without publishing source data.
- Every persisted snapshot has source/version/as-of/fingerprint lineage.
- Source cap totals reconcile or the import remains visibly partial/rejected.
- Ambiguous year labels and unresolved identities fail closed.
- Exact scoring + legal lineup rules feed the new lineup optimizer.
- The same football outcome can score differently across league profiles as expected.
- Missing scoring never silently becomes PPR.
- Contract decisions are replayable from frozen as-of evidence.
