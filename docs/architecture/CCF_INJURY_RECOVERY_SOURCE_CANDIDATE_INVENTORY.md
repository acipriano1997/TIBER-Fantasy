# CCF Injury & Recovery — Concrete Source Candidate Inventory

**Status:** AUDITED / MINIMUM SOURCE COVERAGE NOT READY  
**As of:** 2026-09-14  
**Scope:** Fantasy Football Command Center / CCF only. Football Unwritten remains separate.

## Verdict

**Minimum recovery source coverage: FAIL / NOT READY.**

This is an intentional fail-closed result, not a project failure. The repository and current upstream tooling provide credible candidates for injury/practice evidence and observed workload, but the full four-part production-eligible spine required by `assertCCFRecoveryMinimumSourceCoverage()` cannot yet be proven from current repository evidence.

The required spine is:

1. official injury designation;
2. official practice participation;
3. official game activation/inactive state;
4. observed workload.

No candidate below is promoted to `production_eligible` solely because an upstream loader exists.

## Classification rules used

- `candidate`: plausible source with a concrete loader/dataset and enough semantics to investigate.
- `research_only`: usable for exploratory or historical research, but missing one or more production requirements such as point-in-time archive semantics, raw-trace contract, source identity, or permission review.
- `production_eligible`: only after every `ccf-recovery-source-binding-v1` requirement is proven.
- `rejected`: unsuitable for the role or violates authority/provenance rules.

## Inventory

### 1. nflverse / nflreadpy injury reports

**Current classification:** `candidate`  
**Candidate recovery roles:** official injury designation; official practice participation; structural/reporting context.

Evidence:
- `nflreadpy.load_injuries()` exists and exposes injury/status reports with historical data available since 2009.
- nflverse documentation describes fields including `report_primary_injury`, `report_secondary_injury`, `report_status`, `practice_primary_injury`, `practice_secondary_injury`, `practice_status`, and `date_modified`.
- The upstream injury loader is backed by nflverse data releases.
- nflreadpy states that most nflverse data is broadly CC-BY 4.0, but the exact dataset/use terms still need to be captured into the FFCC source binding rather than inferred from a general package statement.

Why it is **not yet production eligible**:
- TIBER-Data does not currently ingest this dataset in its public ingestion path.
- FFCC does not yet have a versioned parser/source snapshot for injury rows.
- Historical `date_modified` is promising but has not yet been formally verified as sufficient `knownAt` evidence for each fantasy decision checkpoint.
- Revision/correction behavior has not been audited.
- Exact license/terms evidence for the bound artifact has not been frozen in the recovery source registry.
- Raw source snapshot/archive refs are not yet persisted by CCF.

Required next proof:
1. add a bounded nflverse injury adapter with a frozen parser version;
2. capture raw content hash/source URL/retrieval time and upstream `date_modified` separately;
3. audit whether `date_modified` can legitimately serve as source-known time and under what conditions;
4. document correction semantics and missingness;
5. freeze exact license/terms reference;
6. replay several historical weeks against contemporaneous source artifacts before promotion.

### 2. nflverse / PFR snap counts

**Current classification:** `candidate`  
**Candidate recovery role:** observed workload.

Evidence:
- `nflreadpy.load_snap_counts()` exists and exposes game-level offensive, defensive and special-teams snaps and percentages.
- nflverse documents the data as sourced from Pro Football Reference and available since 2012.

Why it is **not yet production eligible**:
- TIBER-Data currently does not ingest snap counts in its public ingestion path.
- FFCC has no recovery-specific snapshot/parser binding for this source.
- Game-level snap counts are post-game observed outcomes; they are useful for updating the *next* decision but must never leak into the pre-game decision they describe.
- Historical source publication/update timing and revision behavior have not been frozen.
- Exact downstream permission/attribution obligations for the PFR-sourced dataset require explicit review in the binding record.

Required next proof:
1. add a versioned snapshot/parser adapter;
2. capture provider release timestamp/retrieval timestamp and raw hash;
3. enforce `knownAt` so week-N snap counts can only affect decisions after their publication;
4. audit corrections and ID joins;
5. freeze exact terms/license/attribution reference.

### 3. nflverse participation data

**Current classification:** `candidate` / enrichment only  
**Candidate recovery roles:** observed football participation; potential richer workload support.

Evidence:
- `nflreadpy.load_participation()` exists and is documented as historical play-level participation data available since 2016.

Why it is **not minimum-spine authority yet**:
- it is not integrated in TIBER-Data or the CCF source layer;
- coverage, licensing, update timing, and exact play-level semantics have not been audited for recovery use;
- it cannot substitute for official pre-game activation evidence simply because a player later appears in participation data.

Potential use after validation:
- route/participation derivation where definitions and coverage support it;
- actual-play involvement;
- post-return role restoration research.

### 4. Existing CCF nflverse weekly player-stat adapter

**Current classification:** `research_only` for recovery source binding in its current form  
**Candidate recovery roles:** opportunities/outcomes such as carries, targets and fantasy production.

Current repository truth:
- `server/modules/ccf/sources/nflverseWeeklyPlayerStats.ts` already binds nflverse `stats_player_week` with provider/dataset/license/parser/source metadata.
- The adapter explicitly uses `current_snapshot_only` semantics unless an immutable archive is supplied.
- Its own contract correctly warns that a current/latest snapshot cannot prove historical point-in-time availability.

Why it does not satisfy minimum workload coverage by itself:
- carries/targets are useful opportunity evidence but do not establish snap/route restoration;
- its current historical source state is not automatically PIT-certified;
- it describes post-game outcomes and cannot leak into that same game's pre-lock decision.

Use now:
- outcome/opportunity label support under proper timing;
- baseline research;
- not recovery-source certification by itself.

### 5. TIBER-Data public ingestion path

**Current classification:** `research_only` for recovery  
**Candidate recovery roles:** existing source transport pattern, not yet injury-specific.

Current repository truth:
- `src/ingest/public.py` currently ingests players, teams, weekly player stats and team-week context.
- It uses nflreadpy where available and otherwise explicit nflverse release URLs.
- It contains fixture fallback data, which TIBER-Data governance explicitly forbids promoting into canonical truth.
- No injury, practice, snap-count, participation or game-activation table is currently included in `ingest_all()`.

Implication:
- TIBER-Data is the natural evidence-transport location for expanded public NFL data, but current recovery coverage must not be overstated.

### 6. Legacy FFCC `injuries` table

**Current classification:** `research_only` / compatibility schema  
**Candidate recovery roles:** normalized injury/practice fields after provenance repair.

Current repository truth:
- the schema contains injury status/practice status and time/return-related fields;
- legacy Start/Sit reads the newest injury row and reduces it to a simple injury tag;
- the consumption path does not establish a CCF-grade upstream provider identity, raw trace, frozen parser identity, immutable source snapshot, or historical `knownAt` chain.

Why it is not production eligible:
- a database row is not provenance;
- historical values cannot be presumed to have been known at the decision time;
- compatibility data must not silently become native CCF evidence.

Required next step:
- either populate it only through a new governed recovery source adapter with provenance fields, or bypass it for the native CCF evidence ledger and leave it legacy-only.

**Recommendation:** do not retrofit this legacy table as the CCF source of truth unless there is a compelling compatibility reason. Prefer immutable source snapshots + normalized recovery evidence, then project a compatibility view outward if needed.

### 7. TIBER-Data depth-chart official-source registry

**Current classification:** `research_only` / adjacent evidence  
**Candidate recovery role:** team/role context, not minimum injury-source coverage.

Reason:
- the repository has a dedicated official-source registry for depth charts, but that authority applies to the depth-chart domain.
- it must not be generalized into injury/practice/activation authority without an explicit matching source contract.

Potential use:
- contextual role displacement/restoration after an injury;
- not a substitute for official injury or game-status evidence.

### 8. Official game-day activation / inactive source

**Current classification:** **MISSING / UNBOUND**  
**Required recovery role:** official game activation/inactive state.

This is the clearest blocking gap in the minimum source spine.

Current evidence does not establish a production-eligible source that proves the official active/inactive state with:
- exact provider/product identity;
- legal/permission reference;
- publication/retrieval/known time;
- immutable archive/raw trace;
- stable player/game identifiers;
- correction semantics.

Important distinction:
- injury-report `report_status` is not automatically the same thing as final game-day active/inactive status;
- a later snap count or participation row proves observed participation, not the official pre-game activation state known at lineup lock;
- roster status is not assumed equivalent to game-day inactive designation without a verified definition/source.

Until this is bound, `assertCCFRecoveryMinimumSourceCoverage()` should continue to fail.

## Current minimum-spine matrix

| Required role | Best concrete candidate | Current classification | Gate result |
|---|---|---:|---:|
| Official injury designation | nflverse injury reports | candidate | FAIL — not bound/PIT-certified |
| Official practice participation | nflverse injury reports | candidate | FAIL — not bound/PIT-certified |
| Official game activation/inactive | none proven | missing | FAIL |
| Observed workload | nflverse/PFR snap counts | candidate | FAIL — not bound/PIT-certified |

**Overall:** `FAIL / NOT READY`.

## What should happen next

### Immediate implementation lane

1. Implement bounded CCF/TIBER-Data adapters for nflverse injury reports and snap counts without granting production eligibility.
2. Persist immutable raw snapshots, source URLs, content hashes, retrieval timestamps, parser versions and upstream timestamps.
3. Add source-specific semantic tests for injury/practice fields and snap percentages.
4. Audit terms/license/attribution at the exact bound dataset level.
5. Test historical `date_modified` behavior against real weeks before using it as `knownAt` evidence.

### Blocking discovery lane

Find and vet a source for official final game-day active/inactive status. It must meet the same point-in-time and raw-trace standard. Do not infer this field from eventual participation.

### Historical-certification lane

Only after the four-role spine passes:
- freeze the source-binding-plan fingerprint;
- build player × game × decision-as-of recovery rows;
- measure coverage/missingness;
- freeze minimum sample thresholds;
- freeze the first validation manifest;
- run native-no-recovery vs raw-recovery baseline before learned recovery modeling.

## Explicit non-promotions

This inventory does **not** certify:
- nflverse injury/practice data as historically leak-proof;
- PFR snap counts as pre-decision information;
- roster status as game-day activation;
- the legacy `injuries` table as native CCF truth;
- any procedure/medical analyst source;
- any source-specific model weight;
- any recovery feature as recommendation-critical.

The correct current answer is that the recovery architecture is ready for source binding, but the minimum production source spine is **not yet ready**.
