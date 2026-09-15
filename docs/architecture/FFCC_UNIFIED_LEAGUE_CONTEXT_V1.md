# FFCC Unified League Context v1

## Purpose

Unified League Context v1 is the single runtime boundary for league-specific truth used by FFCC decision systems. It prevents lineup, waiver, trade, Devy, keeper, and contract features from reconstructing scoring/rules independently or silently inheriting another league's assumptions.

The design follows the CCF-first doctrine: league context supplies frozen evidence and decision-readiness state; it does not replace CCF recommendation authority.

## Runtime flow

1. Platform sync retrieves league identity, scoring settings, roster positions, rosters, transactions, and other platform-native state.
2. `syncUserDataWithLeagueContext()` converts each normalized platform league into `UnifiedLeagueContextV1`.
3. Supplemental sources are attached only when explicitly refreshed:
   - Devy rights sheet for the linked Sleeper Devy league.
   - Contract workbook snapshot for 4th and Long or Dynasty Nerds.
4. `assessLeagueDecisionReadiness()` checks whether the requested decision has the evidence it requires.
5. `toDecisionPacketLeagueContext()` creates a deterministic, fingerprinted projection for the Canonical Decision Packet.
6. Decision-producing code must abstain when the projection is not ready instead of using generic defaults.

## Non-negotiable invariants

- No silent scoring defaults.
- No cross-league contract-rule inheritance.
- College Devy prospects never become platform NFL roster players.
- A registry link is not the same as a live source refresh.
- Live contract/cap decisions require a fresh normalized workbook snapshot.
- Material rule conflicts remain explicit and fail closed.

## Scoring certification

`scoringCertification.ts` preserves raw platform scoring values and fingerprints them. The certification records missing/invalid keys, freshness, and a `noSilentDefaults` invariant.

For Sleeper, the baseline decision schema requires explicit values for:
- passing yards and touchdowns;
- interceptions;
- rushing yards and touchdowns;
- receptions;
- receiving yards and touchdowns;
- fumbles lost.

All additional scoring keys are preserved. A six-point passing-touchdown league therefore remains six points; FFCC may not replace it with a conventional four-point assumption.

## Contract workbook snapshots

`contractWorkbookSnapshot.ts` is the normalized ingestion boundary for contract-league workbooks. It stores:
- exact league/profile/workbook identity;
- season and salary cap;
- as-of/source-health metadata;
- team cap ledgers;
- player contract rows;
- live re-sign and franchise-tag tables when ingested;
- validation issues and decision-readiness state.

The static contract rule registry remains useful for source identity and known policy, but its embedded numeric snapshot is not considered a fresh live workbook read. Real cap/contract decisions require an explicitly refreshed `ContractWorkbookSnapshotV1`.

The standalone FFCC server still does not poll Google Drive by itself. ChatGPT/connected Drive workflows or a future authenticated ingestion worker can populate this normalized snapshot boundary without changing downstream decision semantics.

## Contract league isolation

### 4th and Long

Profile source:
- `4th and Long Constitution`
- `4th and Long 2026 Rosters.xlsx`

The unresolved re-sign term conflict remains fail-closed: constitution 2–4 years vs. 2026 workbook 3–5 years.

### Dynasty Nerds

Profile source:
- `Dynasty Nerds 2026 Rosters.xlsx`

No separate constitution was located as of 2026-09-15. Missing policy stays unknown and is never filled from 4th and Long.

## Devy isolation

The Devy league source registry links Sleeper league `1383497639848341504` to its Google Sheet for Devy rights. The link activates the `devy_rights` capability, but ownership-sensitive decisions remain blocked until a live sheet snapshot/as-of witness is supplied to the runtime context.

## Decision Packet projection

`DecisionPacketLeagueContextV1` freezes:
- league identity;
- scoring certification, exact scoring values, and fingerprint;
- roster positions;
- active capabilities;
- contract profile and fresh workbook metadata when available;
- supplemental source status/as-of state;
- decision-specific blockers and warnings;
- deterministic context fingerprint.

This projection is intended to be embedded unchanged into Canonical Decision Packet v1 so CCF and external challengers receive identical league evidence.

## Health surface

`summarizeLeagueContextHealth()` provides the data contract for a future Command Center status surface, including scoring status, contract-workbook status, Devy-rights status, and issue counts. UI presentation is deliberately separate from source truth.
