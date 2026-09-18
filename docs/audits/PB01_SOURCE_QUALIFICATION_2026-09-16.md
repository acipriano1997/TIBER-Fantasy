# PB-01 Source Qualification Audit — 2026-09-16

**Status:** integration-ready mechanics; production source spine still blocked  
**Scope:** Fantasy Football Command Center / CCF only  
**Branch:** `ffcc/pb01-current-main-integration`  
**Production promotion:** **NONE**

## Executive verdict

PB-01 now has a coherent technical qualification path for all seven weekly capabilities, but **no complete production-ready seven-capability source spine exists yet**.

The limiting factor is no longer basic schema design. The remaining blockers are deliberately external/evidentiary:

1. exact intended-use permission for every bound provider/dataset;
2. real prospective point-in-time captures at fantasy-relevant checkpoints;
3. exact identity linkage against those captures;
4. empirical reliability evidence under a policy frozen before review;
5. trusted operator promotion attestations only after those gates pass.

Repository/public availability is never treated as equivalent to production permission. A successful parser or green CI run is never treated as equivalent to source admission.

## Intended FFCC use being evaluated

The permission question is not merely whether data can be viewed or downloaded. PB-01 needs rights appropriate to the exact intended use, potentially including:

- automated retrieval;
- retention of exact raw payloads for immutable audit/replay;
- normalization and identity linkage;
- statistical feature construction;
- input to predictive / machine-learning models;
- derived fantasy analytics and recommendations;
- historical backtesting and calibration;
- eventual product display of derived outputs.

A source may therefore be technically usable while remaining `unreviewed`, `evaluation_only`, or `conflicted` for production FFCC use.

## Current seven-capability matrix

| Capability | Leading current path | Technical state | Permission state | Reliability state | PB-01 result |
|---|---|---|---|---|---|
| weekly box score | nflverse `stats_player_week` | direct adapter exists | **unreviewed** for exact intended use | not passed | **BLOCKED** |
| play-by-play opportunity | nflverse PBP | native parser/aggregation path exists | **unreviewed** for exact intended use | not passed | **BLOCKED** |
| injury designation | nflverse `injuries` prospective archive candidate; Sportradar remains alternate licensed path | current 2025/2026 release path + immutable CCF capture mechanics exist | nflverse **unreviewed**; Sportradar **evaluation_only** absent order/addendum clearance | incomplete | **BLOCKED** |
| practice participation | nflverse `injuries` prospective archive candidate; Sportradar alternate | same prospective archive path | nflverse **unreviewed**; Sportradar **evaluation_only** | incomplete | **BLOCKED** |
| game activation / inactive | Sportradar NFL Official API Game Roster | candidate contract/source locator only | **evaluation_only** until exact licensed use is bound | incomplete | **BLOCKED** |
| observed workload | SportsDataIO NFL PlayerGame/snap counts | documented viable feed; parser/raw capture not yet bound | **evaluation_only** until exact FFCC license/feed is bound | incomplete | **BLOCKED** |
| NFL schedule / kickoff | nflverse schedules release | parser + DST-safe kickoff normalization + immutable CCF capture mechanics exist | **unreviewed** for exact intended use | incomplete | **BLOCKED** |

**Production coverage: 0 / 7.**  
**Discovery / implementation path coverage: 7 / 7.**

## nflverse — what the public license does and does not prove

The `nflverse-data` repository declares **CC BY 4.0**, and nflverse documentation states that most distributed data is broadly CC BY 4.0. That is valid evidence about the downstream repository/distribution layer.

However, nflverse also explicitly states that NFL data accessed by its packages belong to their respective owners and are governed by those owners' terms of use. PB-01 therefore preserves a two-part distinction:

```text
repository/distribution license known
!=
exact FFCC intended-use permission cleared
```

Consequences:

- nflverse weekly stats, PBP, schedules, and the revived injury feed remain useful **candidates**;
- none may self-promote merely because the repository is public or CC BY 4.0;
- source-specific lineage must be checked where the underlying data producer is identifiable;
- prospective CCF capture solves point-in-time provenance from capture forward, but does not itself solve permission or reliability.

## nflverse injury/practice — corrected 2026 state

Older source-inventory prose that says nflverse injury/practice data ended after 2024 is **superseded**.

The executable candidate inventory on the current PB-01 stack correctly records that nflverse-data again publishes 2025/2026 injury assets and that CCF has a prospective fetch-and-archive path. The current candidate semantics are:

- `status = candidate`;
- `temporalMode = archived_point_in_time` **from CCF capture forward only**;
- exact raw bytes are archived before parsed evidence is exposed;
- CCF retrieval time owns `knownAt`;
- row `date_modified` and HTTP `Last-Modified` cannot backdate knowledge;
- intended-use permission remains `unreviewed`;
- reliability remains `incomplete`.

The stale post-2024 documentation must not be used to demote the live feed, and the existence of the live feed must not be used to promote it.

## PFR-derived nflverse snap counts — keep out of the production model path

nflverse snap counts are explicitly sourced from **Pro Football Reference / Sports Reference**.

Sports Reference's current data-use/Terms language prohibits using site content/data to train, fine-tune, prompt, or instruct AI technologies and expressly includes supporting machine-learning methods used to predict, classify, label, or score inputs without permission. It also restricts substitute databases/services and certain automated access.

Therefore the existing CCF classification remains correct:

```text
nflverse/PFR snap counts
status = research_only
permissionStatus = conflicted
```

The downstream nflverse distribution license is **not** treated as an automatic waiver of identifiable upstream intended-use restrictions. Do not use this source for production model fitting, calibration, or recommendation-critical workload features without affirmative clearance.

## SportsDataIO — cleanest documented workload licensing path, but not yet licensed

SportsDataIO's current data-rights guidance explicitly says commercial licenses can be written to permit:

- ingesting/caching/storing API responses;
- statistical models;
- machine-learning systems;
- projections/ratings/derived analytics;
- display of derived outputs within the licensed product.

It also says the exact use case and feeds must be covered by the license. Personal/non-commercial Discovery Lab access is separately scoped and should not be confused with a future commercial/product license.

Therefore SportsDataIO remains the leading observed-workload candidate, but the correct state is still:

```text
candidate
evaluation_only
reliability = incomplete
```

Promotion requires the actual FFCC feed/use license plus real payload capture, parser, identity, PIT, correction and reliability evidence.

## Sportradar — viable official pregame source, exact order/addendum still governs

Sportradar's current US master terms (updated 2026-08-05) make access/use subject to the service/order form and any data/content addenda. The public terms define acceptable sports-information use but also contain material restrictions around derivative/internal products and uses outside the authorized properties unless approved.

PB-01 therefore must not infer model/archival/derived-analytics rights from trial/API availability alone.

The current classification remains conservative and correct:

```text
Weekly Injuries: candidate / evaluation_only / reliability incomplete
Game Roster: candidate / evaluation_only / reliability incomplete
```

Only a bound order form/addendum or other explicit permission covering FFCC's intended use may move either source to `permitted_for_intended_use`.

## Point-in-time implications

Permission and point-in-time proof are independent gates.

For mutable current-season datasets:

- archive exact bytes at retrieval;
- `knownAt = CCF capture time` unless an immutable provider archive proves earlier availability;
- never backdate from row timestamps, HTTP headers, article timestamps, or later historical responses;
- a corrected later snapshot is a new observation, not a rewrite of the earlier one.

For same-game fantasy decisions, postgame workload evidence such as snap counts cannot influence the pre-lock decision for that game. It may become outcome/next-decision evidence only after it was legitimately known.

## What can proceed now

The codebase may continue to improve without weakening source truth:

1. keep the current production/trusted source registry empty;
2. run the combined PB-01 stack against current-main CI;
3. collect prospective nflverse captures under the already-frozen reliability policy;
4. materialize a real GSIS → canonical identity receipt from governed identity evidence rather than fuzzy matching;
5. obtain exact SportsDataIO/Sportradar intended-use terms before production binding;
6. build provider-specific parsers only from authorized real payloads;
7. append reliability observations prospectively and let the frozen review policy pass/fail them honestly.

## What must not happen

Do **not**:

- convert CC BY repository licensing into an unsupported statement about all upstream rights;
- use PFR-derived snap counts for CCF model fitting under the current unresolved rights conflict;
- mark a provider `permitted_for_intended_use` because a trial key works;
- fabricate a reliability pass from synthetic fixtures;
- infer historical PIT state from a current corrected file;
- substitute roster presence or later snap counts for official pregame activation;
- allow a source object to self-promote without the trusted operator attestation;
- call PB-01 ready merely because the integration branch is green.

## Promotion condition

PB-01 may pass only when one exact weekly source plan covers all seven capabilities and every binding proves, at the same governed `asOf` boundary:

```text
intended-use permission cleared
+ versioned parser
+ immutable/raw trace
+ PIT semantics
+ exact identity binding
+ correction/checkpoint policy
+ passed prospective reliability review
+ trusted operator promotion attestation
```

Until then, the truthful state is:

```text
PB01_TECHNICAL_INTEGRATION: READY_FOR_VALIDATION
PB01_SOURCE_DISCOVERY: COVERED
PB01_PRODUCTION_SOURCE_SPINE: BLOCKED
PB01_PRODUCTION_COVERAGE: 0/7
CCF_PRIMARY_CUTOVER: NOT AUTHORIZED
```

### Current public evidence reviewed

- nflverse organization/package documentation and `nflverse-data` CC BY 4.0 repository metadata;
- nflverse package Terms of Use statement that underlying NFL data remain subject to their respective owners' terms;
- nflreadr snap-count documentation identifying Pro Football Reference as the snap-count source;
- Sports Reference current Data Use / Terms restrictions on AI/ML uses without permission;
- SportsDataIO current Data Rights & Licensing guidance;
- Sportradar US Master Terms and Conditions, last updated 2026-08-05.
