# CCF Injury & Recovery — Concrete Source Candidate Inventory

**Status:** AUDITED / ALL MINIMUM ROLES HAVE CANDIDATES / PRODUCTION COVERAGE NOT READY  
**As of:** 2026-09-14  
**Scope:** Fantasy Football Command Center / CCF only. Football Unwritten remains separate.

## Verdict

**Minimum recovery production source coverage: FAIL / NOT READY.**

The important change is that the four-role minimum spine is no longer missing a discovery candidate: official NFL.com game-day inactive reports are now tracked as the candidate for final game activation/inactive truth. That closes the source-discovery hole, but it does **not** close the production-certification hole.

The required spine remains:

1. official injury designation;
2. official practice participation;
3. official game activation/inactive state;
4. observed workload.

All four roles now have concrete candidates. **Zero bindings are production eligible.** `assertCCFRecoveryMinimumSourceCoverage()` must therefore continue to fail until each required role has point-in-time, raw-trace, parser, terms/permission, archive, and reliability proof.

## Classification rules used

- `candidate`: plausible source with a concrete upstream product/dataset and enough semantics to investigate.
- `research_only`: usable for exploratory or historical research, but missing one or more production requirements or not intended to satisfy the minimum spine.
- `production_eligible`: only after every `ccf-recovery-source-binding-v1` requirement is proven.
- `rejected`: unsuitable for the role or violates authority/provenance rules.

A provider being official does **not** automatically make a binding production eligible. CCF still needs a stable acquisition contract, immutable raw capture, decision-time temporal proof, exact source identity, parser version, correction semantics, and permitted-use/retention review.

## Inventory

### 1. nflverse / nflreadpy injury reports

**Current classification:** `candidate`  
**Candidate recovery roles:** official injury designation; official practice participation; structural/reporting context.

Evidence:
- `nflreadpy.load_injuries()` exposes injury/status reports with historical data available since 2009.
- Documented fields include `report_primary_injury`, `report_secondary_injury`, `report_status`, `practice_primary_injury`, `practice_secondary_injury`, `practice_status`, and `date_modified`.
- The upstream loader is backed by nflverse data releases.
- CCF now has a bounded candidate adapter that preserves upstream `date_modified` separately from CCF `knownAt`.

Why it is **not yet production eligible**:
- FFCC does not yet persist immutable raw snapshots for this source.
- Historical `date_modified` has not been proven sufficient as decision-time source-known evidence.
- Revision/correction behavior is not yet audited.
- Exact bound-dataset terms/license evidence is not frozen in the binding record.
- Historical archive replay has not been demonstrated.

Required next proof:
1. persist raw bytes/content hash/source URL/retrieval time/parser version;
2. audit `date_modified` semantics and corrections;
3. freeze exact terms/license reference;
4. replay multiple historical weeks from immutable snapshots;
5. prove `knownAt <= asOf` at actual fantasy decision checkpoints.

### 2. Official NFL.com inactive reports

**Current classification:** `candidate`  
**Candidate recovery role:** official game activation/inactive state.

Evidence:
- NFL.com operates an official `Inactive Reports` surface.
- NFL.com also retains weekly inactive-report articles that enumerate team-by-team game-day inactive players.
- Archived report pages expose publication/update timing and game context, making them materially stronger candidates than inferring activation from downstream participation.

Why it is **not yet production eligible**:
- FFCC has not proven a stable machine-readable discovery/acquisition contract across seasons and game windows.
- No versioned CCF parser exists yet for the report pages/data payload.
- Publication/update timestamps are promising temporal evidence but are not automatically CCF `knownAt`.
- Article updates/corrections must be audited so a later edit cannot leak into an earlier lineup decision.
- Exact permitted-use, retention, attribution, and automated-access terms for the bound acquisition method are not frozen.
- CCF is not yet persisting immutable raw report snapshots with content hashes before the relevant decision checkpoints.
- Historical coverage/completeness and identity joins still need testing.

Required next proof:
1. identify the stable official discovery/acquisition path used by the live inactive-report surface and archived reports;
2. freeze the exact source/product identity and permitted-use/retention reference;
3. implement a versioned parser with schema/structure failure detection;
4. capture raw bytes, source URL, retrieval time, publication/update timestamps, content hash, parser version, team/game identity, and player identity;
5. archive reports at decision time rather than relying on later current-page state;
6. test corrections/updates and prove a later edit cannot backfill an earlier `knownAt`;
7. replay representative Thursday/Sunday/Monday and postseason reports across seasons.

Hard semantic boundary:
- an injury-report `Out`, `Doubtful`, or `Questionable` status is not automatically final active/inactive truth;
- a later snap count or participation row proves observed participation, not what the official game-day list said before kickoff;
- roster status/elevation is not assumed equivalent to game-day activation;
- no missing inactive row may be silently converted into `active` without complete team/game report proof.

### 3. nflverse / PFR snap counts

**Current classification:** `candidate`  
**Candidate recovery role:** observed workload.

Evidence:
- `nflreadpy.load_snap_counts()` exposes game-level offensive, defensive, and special-teams snaps and percentages.
- nflverse documents the data as sourced from Pro Football Reference and available since 2012.
- CCF now has a bounded candidate adapter that labels this evidence as post-game observed.

Why it is **not yet production eligible**:
- CCF has no immutable point-in-time archive binding for this source.
- Snap counts are post-game outcomes and can only affect later decisions.
- Historical publication/update timing and revision behavior are not frozen.
- Exact downstream permission/attribution obligations for the PFR-sourced dataset require explicit review.

Required next proof:
1. persist raw bytes/hash/provider timestamps/parser version;
2. enforce publication-aware `knownAt`;
3. audit corrections and player/game identity joins;
4. freeze exact terms/license/attribution reference;
5. prove week-N workload cannot leak into week-N pregame decisions.

### 4. nflverse participation data

**Current classification:** `candidate` / enrichment only  
**Candidate recovery roles:** observed football participation; richer workload/role support.

Potential use after validation:
- route/participation derivation where definitions and coverage support it;
- actual-play involvement;
- post-return role restoration research.

It does **not** substitute for official pre-game activation evidence simply because a player later appears in participation data.

### 5. Existing CCF nflverse weekly player-stat adapter

**Current classification:** `research_only` for recovery source binding in its current form  
**Candidate recovery roles:** post-game opportunities/outcomes such as carries, targets, and fantasy production.

Current repository truth:
- the adapter binds nflverse `stats_player_week` with provider/dataset/license/parser/source metadata;
- it explicitly uses `current_snapshot_only` semantics unless an immutable archive is supplied;
- it warns that a current/latest snapshot cannot prove historical point-in-time availability.

Use now:
- outcome/opportunity label support under correct timing;
- baseline research;
- not minimum workload certification by itself because carries/targets do not establish snap/route restoration.

### 6. TIBER-Data public ingestion path

**Current classification:** `research_only` for recovery  
**Candidate recovery role:** source-transport pattern, not recovery authority.

Current repository truth:
- public ingestion currently covers players, teams, weekly player stats, and team-week context;
- fixture fallback data must never be promoted into canonical truth;
- injury, practice, final game activation, snap-count, and participation ingestion are not yet a certified recovery path.

Implication:
- TIBER-Data patterns can inform evidence transport, but CCF recommendation authority cannot depend on TIBER and current coverage must not be overstated.

### 7. Legacy FFCC `injuries` table

**Current classification:** `research_only` / compatibility schema.

Why it is not production eligible:
- a database row is not provenance;
- historical values cannot be presumed to have been known at decision time;
- the legacy consumer collapses nuanced evidence into a simple tag;
- compatibility data must not silently become native CCF evidence.

Recommendation: prefer immutable source snapshots + normalized recovery evidence as CCF truth, then project compatibility views outward if needed rather than retrofitting the legacy table as authority.

### 8. TIBER-Data depth-chart official-source registry

**Current classification:** `research_only` / adjacent evidence.

Potential use:
- team/role context and post-injury role displacement/restoration.

It is not authority for injury, practice, or final game activation unless a separate matching source contract proves that role.

## Current minimum-spine matrix

| Required role | Best concrete candidate | Current classification | Gate result |
|---|---|---:|---:|
| Official injury designation | nflverse injury reports | candidate | FAIL — not PIT/archive/terms certified |
| Official practice participation | nflverse injury reports | candidate | FAIL — not PIT/archive/terms certified |
| Official game activation/inactive | NFL.com Inactive Reports | candidate | FAIL — acquisition/parser/PIT/terms/archive proof incomplete |
| Observed workload | nflverse/PFR snap counts | candidate | FAIL — not PIT/archive/terms certified |

**Discovery coverage:** 4 / 4 required roles have candidates.  
**Production coverage:** 0 / 4 required roles are production eligible.  
**Overall production gate:** `FAIL / NOT READY`.

## What should happen next

### Immediate implementation lane

1. Preserve the existing bounded nflverse injury and snap-count adapters as candidate-only.
2. Build a bounded NFL.com inactive-report acquisition/parser prototype only after the stable official source path is identified; fail closed on structure drift or incomplete team/game coverage.
3. Add immutable raw-snapshot support shared across all recovery sources: source URL, raw-content hash, retrieval time, upstream publication/update time when present, parser version, archive identity, and `knownAt` derivation.
4. Add source-specific semantic tests for injury/practice fields, inactive lists, and snap percentages.
5. Freeze exact terms/license/attribution/retention evidence for each bound source.
6. Test historical timestamp/update behavior against real weeks before promoting any upstream timestamp to decision-time `knownAt`.

### Historical-certification lane

Only after all four required bindings are production eligible:
- freeze the source-binding-plan fingerprint;
- build player × game × decision-as-of recovery rows;
- measure source coverage, missingness, update latency, and correction frequency;
- freeze minimum sample and subgroup thresholds;
- freeze the first validation manifest;
- run native-no-recovery vs eligible-raw-recovery baseline before any learned recovery model;
- retain failed/negative/non-return outcomes and tail cases rather than training only on successful returns.

## Explicit non-promotions

This inventory does **not** certify:
- nflverse injury/practice data as historically leak-proof;
- NFL.com inactive pages as a stable production API or parser contract;
- publication/update timestamps as automatically safe CCF `knownAt` values;
- PFR snap counts as pre-decision information;
- roster status as game-day activation;
- the legacy `injuries` table as native CCF truth;
- any procedure/medical analyst source;
- any source-specific model weight;
- any recovery feature as recommendation-critical.

The correct current answer is now more precise: **the recovery architecture has a concrete candidate for every required source role, but none of those roles has yet earned production eligibility.**
