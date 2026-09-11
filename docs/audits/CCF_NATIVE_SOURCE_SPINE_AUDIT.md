# CCF Native Source Spine Audit

**Status:** active migration audit for CCF-INDEP-001

## Executive verdict

CCF does **not** yet have a complete current-season native evidence spine for weekly player outcomes.

The repository has useful ingestion architecture and several source adapters, but the current state is mixed:

- Sleeper is genuinely live for player identity/roster metadata and trending data, but the weekly-stat ingestion path is still a placeholder.
- NFL-Data-Py is explicitly disabled/deprecated in the current adapter and produces only deprecation or mock payloads.
- MySportsFeeds defines useful contracts, but its non-mock roster, game-log, and injury paths still store placeholder payloads rather than performing the documented live API integration.
- the Bronze Layer gives CCF a useful raw-payload/checksum/lineage foundation, but its current persisted `ingest_payloads` record does not preserve all response metadata passed by adapters, such as source response headers / extraction metadata, as first-class fields.
- legacy player tables and Start/Sit inputs are not sufficient authority for 2026 CCF-native weekly modeling.

Therefore existing repository data must not be re-labeled as native merely to remove TIBER from the dependency graph.

## First direct replacement source: nflverse

CCF now has a direct source adapter for nflverse weekly player statistics:

`server/modules/ccf/sources/nflverseWeeklyPlayerStats.ts`

The upstream weekly player-stat release URL is defined by nflreadr as:

```text
https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.csv
```

Why this is appropriate as the first native source:

- it is source data rather than a TIBER model output;
- the weekly player-stat dataset is designed to match official NFL box-score statistics;
- current-season data is actively updated;
- GSIS player IDs provide a durable identity key;
- the data repository is CC-BY-4.0, so CCF must preserve attribution/license metadata;
- CSV access works without coupling CCF to R/Python-specific loaders.

The CCF adapter currently normalizes QB/RB/WR/TE weekly box-score and efficiency fields including passing attempts/yards/TD/INT/sacks/air yards/EPA/CPOE, carries/rushing production/EPA, targets/receptions/receiving production/air yards/YAC/EPA, two-point conversions, and published fantasy-point fields for outcome reconciliation.

### Temporal guardrail

The latest nflverse release is tagged `current_snapshot_only` in CCF.

A latest-file fetch is safe for a live decision only after CCF retrieved it. It is **not** automatically eligible for a historical `as_of`, because the latest file can contain corrections or rows that were not known at the historical decision time.

Historical certification therefore requires CCF to archive immutable source snapshots at ingestion time and bind each snapshot to its retrieval/known time and content hash.

## Current source classification

| Source/path | What is genuinely available now | CCF-native use | Status |
| --- | --- | --- | --- |
| nflverse direct weekly player stats | current/historical weekly box-score player stats and several derived football metrics | observed weekly outcomes, volume history, efficiency history, model features after as-of controls | **FIRST-PARTY CCF ADAPTER ADDED** |
| nflverse direct PBP | current 2026 raw play-by-play release exists; can support CCF-owned red-zone, high-value-touch, game-script and opportunity derivation | future native feature computation | **NEXT PRIORITY** |
| nflverse rosters/player IDs | direct current identity/roster datasets | identity cross-check and team membership | **NEXT PRIORITY** |
| nflverse snap counts / advanced stats / NGS | upstream release families are actively maintained, with source-specific update schedules | role participation and efficiency enrichments, subject to source/legal/temporal review | **CANDIDATE** |
| Sleeper `/players/nfl` | live player metadata | league/provider identity, injury-status evidence with freshness caveats | **USABLE FACT SOURCE** |
| Sleeper trending | live add/drop trend | market behavior evidence only | **USABLE, NON-MODEL** |
| Sleeper weekly stats adapter | placeholder payload, not real weekly bulk stats | none | **BLOCKED** |
| NFLDataPyAdapter | deprecation notice or mock data | none | **BLOCKED** |
| MySportsFeeds non-mock paths | placeholder payloads despite adapter contracts | none until actual API integration is implemented/verified | **BLOCKED** |
| `playerAdvanced2024` Start/Sit path | stale 2024 aggregate/advanced rows | compatibility only | **LEGACY / BLOCKED** |
| TIBER-Data source-backed facts | governed upstream facts/artifacts | temporary secondary evidence when raw provenance survives | **ALLOWED SECONDARY, NOT CRITICAL** |
| TIBER-Forecast / FORGE / Rookie Alpha inference | model/grade/value outputs | challenger/benchmark only | **BLOCKED FROM CCF_NATIVE** |

## Bronze Layer provenance gap

`BronzeLayerService.storeRawPayload()` currently hashes and persists the source, endpoint, raw payload, version, job, season/week, status, record count, checksum, and ingestion time.

Adapters may pass richer metadata such as:

- request URL;
- source response headers;
- extraction time;
- source format;
- source size.

That richer metadata is not currently persisted by `storeRawPayload()` as a first-class immutable source envelope. CCF-native source promotion therefore should not rely on the legacy Bronze record alone for `known_at`/source-version proofs.

For new CCF sources, provenance must travel with the source snapshot itself until the canonical evidence layer is extended to preserve:

- source URL/product;
- retrieval time;
- provider update time where available;
- ETag / Last-Modified where available;
- content hash;
- byte size;
- license/attribution requirement;
- temporal mode (`current_snapshot_only` vs archived point-in-time snapshot);
- parser/schema version;
- supersession lineage.

## Required native source sequence

### S0 — weekly player stats

Implemented foundation:

- direct nflverse CSV URL;
- schema fail-closed validation;
- QB/RB/WR/TE normalization;
- retrieval-time provenance;
- explicit CC-BY-4.0 license metadata;
- latest-file historical leakage guard.

Remaining before promotion:

- execute against a live file in the project runtime;
- archive immutable raw snapshots;
- persist content hash and parser version;
- map GSIS IDs into the CCF canonical identity spine;
- reconcile CCF-computed fantasy scoring against upstream published fantasy-point fields as a QA check, not as projection authority.

### S1 — play-by-play opportunity derivation

Build CCF-owned PBP feature derivation rather than importing another provider's final fantasy projection.

Initial features should include:

- team offensive plays / dropbacks / rush attempts;
- targets and carries;
- target/carry opportunity shares;
- air-yards share;
- red-zone and goal-line opportunities;
- two-minute usage where derivable;
- designed QB rushes / scrambles;
- first-down and high-value opportunities;
- team scoring opportunities;
- game-script state.

Each derived feature must retain play-level source lineage and as-of eligibility.

### S2 — participation / depth / roster

Add direct snap-count, roster and depth-chart evidence for:

- snap share;
- route/participation proxies where legitimately available;
- active/inactive/team membership;
- depth-chart transitions.

Missing participation data must remain missing; do not infer maximum role confidence from absence.

### S3 — environment

Join CCF-owned weather, venue/roof, market and schedule evidence after their own temporal/source gates pass.

### S4 — injury/readiness

Use official status/practice/news facts plus the CCF Readiness model. Do not convert a missing injury row into proof of full health.

## What remains deliberately external

The following stay outside the native critical path even after the source spine is complete:

- ECR;
- expert rankings/takes;
- TIBER-Forecast;
- FORGE;
- market fantasy projections;
- proprietary third-party player projections.

They are valuable disagreement/challenger evidence, not native truth.

## Promotion condition

A direct source does not become `ccf_native_fact` merely because CCF can fetch it.

Promotion requires:

1. legal/source-use review;
2. stable identity mapping;
3. schema validation;
4. retrieval/known timestamp;
5. immutable raw trace or snapshot hash;
6. explicit missing/unavailable semantics;
7. temporal eligibility for the target decision;
8. parser/normalizer versioning;
9. focused tests against real source shape;
10. no hidden transformation into an external model output.

Until those conditions pass, the source remains candidate/pending rather than recommendation-critical native evidence.
