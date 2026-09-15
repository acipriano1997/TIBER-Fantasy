# CCF Injury & Recovery — Concrete Source Candidate Inventory

**Status:** AUDITED / ALL FOUR MINIMUM ROLES HAVE VIABLE CURRENT CANDIDATES / PRODUCTION COVERAGE NOT READY  
**As of:** 2026-09-15  
**Scope:** Fantasy Football Command Center / CCF only. Football Unwritten remains separate.

## Verdict

**Minimum recovery production source coverage: FAIL / NOT READY.**

The source-discovery gap is closed without lowering provenance or permission standards. All four minimum roles have a viable current path, but **zero bindings are production eligible**.

The current leading source spine is:

1. official injury designation — Sportradar NFL Official API `Weekly Injuries`;
2. official practice participation — Sportradar NFL Official API `Weekly Injuries`;
3. official game activation/inactive state — Sportradar NFL Official API `Game Roster`;
4. observed workload — SportsDataIO NFL `PlayerGame` / snap-count data.

Two earlier paths remain deliberately outside the production spine:

- nflverse injury/practice data is `research_only` because its upstream injury source ended after the 2024 season;
- nflverse / Pro Football Reference snap counts are `research_only` because CCF found an unresolved intended-use permission conflict between the downstream nflverse distribution license and current Sports Reference restrictions on AI/ML-oriented use. CCF does not assume that conflict is resolved in its favor.

The NFL.com public inactive-report route remains `rejected` for automated/systematic FFCC ingestion under current terms. No scraping workaround or hidden-endpoint substitution is authorized.

`assertCCFRecoveryMinimumSourceCoverage()` must continue to fail until every required role has **explicit intended-use permission, passed reliability review, parser identity, immutable raw trace, and point-in-time eligibility**.

## Promotion semantics

A source being official, licensed, public, technically fetchable, or historically useful does **not** make it production eligible.

The executable source contract distinguishes:

- `permissionStatus = unreviewed` — intended-use rights have not been evaluated;
- `permissionStatus = evaluation_only` — enough permission exists to evaluate the source, but not to claim FFCC production/model use;
- `permissionStatus = conflicted` — material terms/license evidence points in different directions and CCF will not self-resolve the conflict;
- `permissionStatus = permitted_for_intended_use` — exact FFCC use has been affirmatively cleared;
- `permissionStatus = prohibited` — the intended use is blocked absent new permission.

Reliability is independently classified as `unreviewed`, `incomplete`, `passed`, or `failed`.

A terms URL is not permission clearance. A reliability-review note is not a passed reliability review. Production eligibility requires both explicit pass states.

## Current candidates

### 1. Sportradar NFL Official API — Weekly Injuries

**Classification:** `candidate`  
**Permission:** `evaluation_only`  
**Reliability:** `incomplete`  
**Roles:** official injury designation; official practice participation; structural/reporting context.

Why it leads the live pregame path:

- authenticated NFL Official API with stable provider identity;
- exposes game-status injury designation, injury description, practice participation, player/team identity, and provider timing metadata;
- provider documentation describes current-week update behavior;
- formal trial/production access model exists.

Still required:

1. bind an agreement/order/addendum that affirmatively permits FFCC's intended production/model use;
2. capture real authorized payloads at fantasy-relevant checkpoints;
3. build/version a fail-closed parser from those real payloads;
4. archive exact bytes and retrieval times prospectively;
5. audit corrections, latency, coverage, missingness, and identity joins;
6. prove `knownAt <= asOf` from CCF capture rather than provider timestamps alone.

### 2. Sportradar NFL Official API — Game Roster

**Classification:** `candidate`  
**Permission:** `evaluation_only`  
**Reliability:** `incomplete`  
**Role:** official game activation/inactive state.

Why it leads activation:

- provider documentation describes Game Roster as the declared game roster;
- player game status includes `deactivated` / played / started-style game participation states;
- inactive players are entered around 90 minutes before kickoff;
- game-roster corrections are exposed through the provider's change workflow.

Still required: exact intended-use authorization, real-payload parser, immutable pre-lock capture, correction/latency/coverage audit, and prospective PIT proof.

### 3. SportsDataIO NFL PlayerGame / snap counts

**Classification:** `candidate`  
**Permission:** `evaluation_only` until an FFCC-specific license/use basis is bound  
**Reliability:** `incomplete`  
**Role:** observed workload.

Why it now leads workload:

- documented `OffensiveSnapsPlayed`, `DefensiveSnapsPlayed`, `SpecialTeamsSnapsPlayed`, team snap totals, and `SnapCountsConfirmed` fields;
- documented historical snap-count coverage from 2012;
- snap counts are documented as available the morning after the game;
- provider workflow documents later stat-correction handling;
- provider licensing guidance explicitly states that commercial licenses can permit storage plus statistical / machine-learning model inputs and derived analytics, subject to exact feeds and use case.

This is a cleaner permission path than assuming PFR-derived nflverse data is safe for FFCC model inputs.

Still required:

1. bind the exact SportsDataIO product/feed and FFCC use rights;
2. freeze the exact API endpoint/source locator;
3. capture representative real payloads;
4. implement/version a fail-closed parser;
5. archive exact raw responses and retrieval times;
6. audit coverage, confirmation timing, corrections, missingness, and identity joins;
7. document prospective PIT semantics.

### 4. nflverse injury reports — historical only

**Classification:** `research_only`  
**Live use:** not eligible after 2024.

The historical adapter remains useful for bounded source-semantics and historical research. It preserves upstream `date_modified` separately from CCF `knownAt` and fails closed on 2025+ seasons.

A current historical release cannot establish what CCF knew at an earlier checkpoint merely because a row contains an older timestamp.

### 5. nflverse / Pro Football Reference snap counts — permission-conflicted reference path

**Classification:** `research_only`  
**Permission:** `conflicted`  
**Reliability:** `incomplete`.

CCF has already built useful provenance infrastructure here:

- versioned parser;
- prospective immutable capture of exact nflverse release bytes;
- retrieval-time `knownAt` semantics;
- raw trace and archive integrity checks.

However, the data lineage is explicitly Pro Football Reference. Current Sports Reference terms restrict use of its content for AI/ML prediction and certain substitute data-store uses without permission, while the nflverse release is distributed under a CC BY 4.0 repository license. CCF will not decide that rights conflict by assumption.

**Policy:** do not use this binding for production model fitting, calibration, or recommendation-critical features until intended-use rights are affirmatively cleared. Preserve the adapter/archive work for provenance engineering and bounded non-authoritative inspection.

### 6. NFL.com public inactive reports

**Classification:** `rejected` for automated/systematic production ingestion under current terms.  
**Permission:** `prohibited` absent express consent or a separately licensed path.

The rejected route remains machine-readable to prevent accidental reintroduction. No scraping workaround, hidden endpoint, or credential reverse-engineering is authorized.

## Minimum-spine matrix

| Required role | Leading current candidate | Permission | Reliability | Gate result |
|---|---|---|---|---|
| Official injury designation | Sportradar Weekly Injuries | evaluation only | incomplete | FAIL — production rights/parser/archive/PIT proof incomplete |
| Official practice participation | Sportradar Weekly Injuries | evaluation only | incomplete | FAIL — production rights/parser/archive/PIT proof incomplete |
| Official game activation/inactive | Sportradar Game Roster | evaluation only | incomplete | FAIL — production rights/parser/archive/PIT proof incomplete |
| Observed workload | SportsDataIO PlayerGame snap counts | evaluation only | incomplete | FAIL — exact license/feed/parser/archive/PIT proof incomplete |

**Viable current discovery coverage:** 4 / 4 required roles.  
**Production coverage:** 0 / 4 required roles.  
**Overall production gate:** `FAIL / NOT READY`.

## Point-in-time and raw-archive hardening already completed

The shared `ccf-source-snapshot-v1` semantics distinguish:

- `ccf_capture` — CCF may not claim `knownAt` before bytes were actually retrieved;
- `provider_archive_proven` — an earlier historical `knownAt` is allowed only when an immutable historical version and exact availability proof exist.

HTTP `Last-Modified`, article timestamps, provider status dates, update schedules, or current historical responses cannot backdate CCF knowledge.

The generic raw-source archive preserves exact bytes plus manifest identity, treats separate retrieval events as separate observations, supports idempotent exact replays, and detects tampering rather than silently overwriting it.

## Promotion-readiness diagnostics

`evaluateCCFRecoverySourcePromotionReadiness()` reports explicit blockers for every binding. Current blocker families include:

- rejected/research-only status;
- challenger/speculative authority;
- missing archived PIT mode or archive strategy;
- missing terms/license reference;
- **permission not cleared for intended use**;
- missing parser/source locator;
- undocumented PIT semantics;
- missing raw trace;
- missing reliability-review reference;
- **reliability review not passed**.

The live inventory blocker sets are regression-tested. A source cannot become promotable merely by changing its label.

## Next non-Work lane

1. Preserve the Sportradar and SportsDataIO candidates without inventing credentials or payloads.
2. Bind exact production/evaluation permission evidence when access exists.
3. Capture real authorized payloads and immediately run them through the generic immutable archive.
4. Build parsers only from real payloads; fail closed on schema drift, incomplete identity, and malformed required fields.
5. Complete empirical reliability reviews for correction behavior, latency, coverage, missingness, and identity joins.
6. Keep nflverse injury data historical-only and PFR-derived snap counts permission-conflicted until explicitly cleared.
7. Keep NFL.com public-page automation rejected unless express permission is obtained.

## Historical-certification lane

Historical endpoints can support outcomes and research, but they do not automatically reconstruct what was known at an earlier fantasy decision checkpoint. If no immutable provider archive proves intermediate historical states, fully leak-proof recovery certification for those dimensions begins with **prospective CCF capture**.

Only after all four required bindings are production eligible:

- freeze the source-binding-plan fingerprint;
- build player × game × decision-as-of recovery rows;
- measure coverage, missingness, latency, and correction frequency;
- freeze minimum sample/subgroup thresholds;
- freeze the first validation manifest;
- compare native-no-recovery vs eligible-raw-recovery before fitting learned recovery mechanisms;
- retain failed, diminished, recurrent, non-return, and tail outcomes.

## Explicit non-promotions

This inventory does **not** certify:

- Sportradar or SportsDataIO as authorized FFCC production feeds yet;
- nflverse injury/practice as a live 2026 source;
- nflverse/PFR snap counts as a permitted production model input;
- any provider's current historical response as proof of earlier decision-time knowledge;
- NFL.com public inactive pages as an automated FFCC source;
- roster status as a substitute for game-day activation;
- any recovery feature as recommendation-critical.

The correct current answer is: **all four required recovery source roles have viable current candidates, but no source has yet passed both permission and reliability gates plus parser/archive/PIT certification.**