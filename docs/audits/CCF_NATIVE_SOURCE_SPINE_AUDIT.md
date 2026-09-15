# CCF Native Source Spine Audit

**Status:** active migration audit for CCF-INDEP-001  
**As of:** 2026-09-15

## Executive verdict

CCF does **not** yet have a complete current-season native evidence spine for weekly player outcomes.

The repository has useful ingestion architecture and several source adapters, but no source may become recommendation-critical merely because CCF can fetch it or because a developer labels it `promoted`.

Current state is mixed:

- Sleeper is genuinely live for player identity/roster metadata and trending data, but the weekly-stat ingestion path is still placeholder/incomplete for CCF-native modeling.
- NFL-Data-Py is explicitly disabled/deprecated in the current adapter and produces only deprecation or mock payloads.
- MySportsFeeds defines useful contracts, but non-mock roster/game-log/injury paths are not proven as the live CCF source spine.
- legacy player tables and Start/Sit inputs are not sufficient authority for 2026 CCF-native weekly modeling.
- direct nflverse adapters are useful engineering/research paths, but repository-level distribution terms do **not** automatically prove intended-use permission for every underlying upstream dataset or FFCC modeling use.
- the generic CCF source-state contract now fails closed unless a promoted source carries explicit qualification evidence.

Therefore existing repository data must not be re-labeled as native merely to remove TIBER from the dependency graph.

## Generic source-promotion gate

`server/modules/ccf/sources/sourceState.ts` now requires a `ccf-source-qualification-v1` bundle before a source with `governanceState: promoted` can be eligible for CCF-native use.

A passing qualification requires:

1. a named/versioned qualification identity and review timestamp;
2. exact terms/license reference;
3. `permissionStatus = permitted_for_intended_use`;
4. versioned parser/normalizer identity;
5. raw trace support;
6. documented point-in-time semantics;
7. reliability-review reference;
8. `reliabilityStatus = passed`.

Permission states distinguish:

- `unreviewed`
- `evaluation_only`
- `conflicted`
- `permitted_for_intended_use`
- `prohibited`

Reliability states distinguish:

- `unreviewed`
- `incomplete`
- `passed`
- `failed`

The qualification receives a deterministic SHA-256 fingerprint. Regression tests prove that a bare `promoted` label, evaluation-only access, conflicting rights evidence, missing parser/raw trace/PIT proof, or incomplete reliability review remains ineligible.

This closes the generic source equivalent of the earlier authority-graph status-label bypass.

## Direct weekly-player-stat adapter: nflverse

CCF has a direct adapter for nflverse weekly player statistics:

`server/modules/ccf/sources/nflverseWeeklyPlayerStats.ts`

The release path is:

```text
https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.csv
```

The adapter is useful because it provides a CCF-owned, language-neutral ingestion path rather than a TIBER model output. It normalizes QB/RB/WR/TE weekly box-score/opportunity/efficiency fields and preserves retrieval-time provenance.

However, **adapter existence is not source promotion**.

The nflverse data repository declares a broad CC BY 4.0 distribution license, while nflverse's own terms also note that underlying NFL data belong to their respective owners and remain governed by applicable source-owner terms. CCF therefore does not treat the repository license alone as proof that every underlying dataset is permitted for FFCC's intended production/model use.

Before any nflverse-derived source state is promoted, the exact bound dataset must pass the generic intended-use permission and reliability gates.

### Temporal guardrail

The latest weekly-stat release remains `current_snapshot_only` unless CCF prospectively archives the exact bytes or can prove an immutable historical version and its availability time.

A latest-file fetch is eligible only after CCF retrieved it. It is **not** automatically eligible for a historical `as_of`, because later files may contain corrections or values not known at the historical decision time.

## Current source classification

| Source/path | What is genuinely available | CCF-native use | Status |
| --- | --- | --- | --- |
| nflverse direct weekly player stats | direct current/historical release + CCF adapter | research/candidate outcome and history facts after permission/PIT qualification | **ADAPTER IMPLEMENTED / SOURCE NOT PROMOTED** |
| CCF native PBP opportunity derivation (#34) | source-agnostic deterministic transform | native carries/targets/air-yards/situational opportunity derivation once a PBP source is promoted | **ENGINE IMPLEMENTED / SOURCE-GATED** |
| nflverse direct PBP | broad historical/current release family | possible input to CCF opportunity engine after intended-use/source qualification | **RESEARCH / CANDIDATE SOURCE ONLY** |
| nflverse rosters/player IDs | current identity/roster datasets | identity cross-check/team membership after qualification | **CANDIDATE** |
| nflverse/PFR snap counts | technically available and prospectively archivable | non-authoritative reference/provenance work while intended-use rights conflict remains unresolved | **RESEARCH ONLY / PERMISSION CONFLICT** |
| Sportradar Weekly Injuries | authenticated injury/practice product | leading current designation/practice candidate on recovery branch | **CANDIDATE / ACCESS+PERMISSION GATED** |
| Sportradar Game Roster | authenticated declared game-roster product | leading current active/inactive candidate | **CANDIDATE / ACCESS+PERMISSION GATED** |
| SportsDataIO PlayerGame snap counts | documented snap-count fields and licensable model-use path | leading observed-workload candidate | **CANDIDATE / EXACT LICENSE+PARSER GATED** |
| Sleeper `/players/nfl` | live player metadata | identity/provider facts subject to exact qualification | **LIVE EXTERNAL FACT PATH / NOT AUTOMATICALLY NATIVE** |
| Sleeper trending | live add/drop trend | market behavior evidence only | **NON-MODEL CONTEXT** |
| Sleeper weekly stats adapter | placeholder/non-authoritative weekly bulk path | none | **BLOCKED** |
| NFLDataPyAdapter | deprecation notice or mock data | none | **BLOCKED** |
| MySportsFeeds non-mock paths | not proven live/native source path | none until actual integration + qualification | **BLOCKED** |
| `playerAdvanced2024` Start/Sit path | stale 2024 aggregate/advanced rows | compatibility only | **LEGACY / BLOCKED** |
| TIBER-Data source-backed facts | governed upstream facts/artifacts | secondary evidence where provenance survives; must independently qualify before CCF-native promotion | **SECONDARY, NOT CRITICAL** |
| TIBER-Forecast / FORGE / Rookie Alpha inference | model/grade/value outputs | challenger/benchmark only | **BLOCKED FROM CCF_NATIVE** |

## Raw provenance and archive requirements

Legacy Bronze-layer storage is useful, but CCF-native source promotion must prove the complete source envelope required by the generic qualification and temporal contracts.

Required source evidence includes:

- provider/product/source URL;
- exact raw bytes or durable raw record reference;
- retrieval time / `knownAt`;
- provider update time where available but never substituted for CCF `knownAt` without proof;
- ETag / Last-Modified where useful;
- content hash and byte size;
- terms/license and intended-use permission basis;
- temporal mode and immutable archive reference;
- parser/schema version;
- correction/supersession behavior;
- field coverage/missingness/identity-join review;
- passed reliability review.

PR #32 adds a generic immutable raw-source archive and hardened snapshot semantics for the recovery lane. Those mechanisms should be reused or promoted into the shared foundation deliberately rather than duplicated ad hoc.

## Required native source sequence

### S0 — weekly player stats

Implemented foundation:

- direct nflverse CSV adapter;
- schema fail-closed validation;
- QB/RB/WR/TE normalization;
- retrieval-time provenance;
- latest-file historical leakage guard.

Remaining before native promotion:

- audit the exact bound dataset's intended-use rights rather than relying only on repository-level distribution terms;
- capture/freeze exact raw snapshots;
- bind the parser and archive into a passing generic source qualification;
- map GSIS IDs into the CCF canonical identity spine;
- empirically audit correction behavior, coverage, missingness, and update latency;
- reconcile CCF-computed scoring against source outcomes as QA, never as projection authority.

### S1 — play-by-play opportunity derivation

Draft PR #34 implements the first source-agnostic deterministic CCF opportunity engine.

Implemented transform outputs include:

- team offensive plays/dropbacks/role-relevant rush attempts;
- carries, targets, receptions and touches;
- target/carry opportunity shares;
- air-yards and air-yards share;
- red-zone and goal-line opportunities;
- two-minute and first-down opportunities;
- designed QB rush vs scramble separation;
- opportunity state while leading/tied/trailing;
- player-share provenance that includes team denominator evidence;
- deterministic fingerprints and exact as-of/source-state gating.

Important guardrail: player absence from PBP opportunity rows is **not** an observed zero role. Rolling player windows must join promoted participation/activation evidence before absent opportunity rows become zero-opportunity observations.

Remaining before production use:

- select/qualify a PBP source with intended-use permission;
- immutable raw capture and source parser;
- complete-game and correction semantics;
- canonical identity joins;
- PIT qualification;
- participation-aware player time-series construction;
- frozen chronological OOS feature-family ablations.

### S2 — participation / depth / roster

Add promoted direct evidence for:

- snap share;
- route/participation proxies where legitimately available;
- active/inactive/team membership;
- depth-chart transitions.

Missing participation data must remain missing. Do not infer full role confidence or zero opportunity from absence alone.

### S3 — environment

Join CCF-owned weather, venue/roof, market and schedule evidence only after their own source qualifications and temporal gates pass.

### S4 — injury/readiness

PR #32 provides the CCF-owned recovery evidence/source-binding foundation. Its current live candidate spine is permission/access gated; no recovery source or model is yet recommendation-authoritative.

## What remains deliberately external

The following stay outside the native critical path even after the source spine is complete unless a specific raw fact is independently qualified:

- ECR;
- expert rankings/takes;
- TIBER-Forecast;
- FORGE;
- external fantasy projections;
- market fantasy projections;
- proprietary third-party recommendation outputs.

They are useful disagreement/challenger evidence, not native truth.

## Promotion condition

A direct source does not become `ccf_native_fact` merely because CCF can fetch it, parse it, store it locally, or label it `promoted`.

Generic promotion now requires machine-enforced qualification proving:

1. exact intended-use permission;
2. stable identity/source definition;
3. versioned parser/schema;
4. retrieval/known timestamp;
5. immutable raw trace;
6. explicit missing/unavailable semantics;
7. documented point-in-time semantics;
8. support/staleness windows;
9. passed reliability review covering corrections, coverage, latency, missingness and provider limitations;
10. no hidden transformation into an external model output.

Until those conditions pass, the source remains candidate/research/provisional rather than recommendation-critical native evidence.