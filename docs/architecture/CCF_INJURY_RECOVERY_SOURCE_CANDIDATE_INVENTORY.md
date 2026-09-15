# CCF Injury & Recovery — Concrete Source Candidate Inventory

**Status:** AUDITED / MINIMUM PRODUCTION SOURCE COVERAGE NOT READY  
**As of:** 2026-09-14  
**Scope:** Fantasy Football Command Center / CCF only. Football Unwritten remains separate.

## Verdict

**Minimum recovery production source coverage: FAIL / NOT READY.**

The source-discovery audit found an official NFL.com game-day inactive-report surface, but the current NFL.com Terms and Conditions prohibit systematic retrieval or compilation absent express prior written consent. The automated acquisition/parser prototype created during discovery was therefore removed rather than normalized into the source spine.

The four required roles remain:

1. official injury designation;
2. official practice participation;
3. official game activation/inactive state;
4. observed workload.

Current viable discovery coverage is **3 / 4**: injury designation, practice participation, and observed workload have concrete candidates. Final official game activation remains **UNBOUND** under a permitted automated data path. The NFL.com official inactive surface is retained in the inventory as a `rejected` automated-source path so the same terms mistake is not repeated.

**Zero bindings are production eligible.** `assertCCFRecoveryMinimumSourceCoverage()` must continue to fail until every required role has point-in-time, raw-trace, parser, terms/permission, archive, and reliability proof.

## Classification rules

- `candidate`: plausible source with a concrete dataset/product and enough semantics plus permission posture to investigate further.
- `research_only`: usable for bounded research/reference but missing production requirements or not intended to satisfy the minimum spine.
- `production_eligible`: every `ccf-recovery-source-binding-v1` requirement is proven.
- `rejected`: unsuitable for the required use, including permission/terms conflicts.

A source being official does **not** automatically make it production eligible. CCF still requires a lawful/permitted acquisition path, stable identity, immutable raw capture, decision-time temporal proof, parser version, correction semantics, and reliability review.

## Inventory

### 1. nflverse / nflreadpy injury reports

**Current classification:** `candidate`  
**Candidate recovery roles:** official injury designation; official practice participation; structural/reporting context.

Evidence:
- `nflreadpy.load_injuries()` exposes historical injury/status reports.
- Documented fields include report injury/status, practice injury/status, and `date_modified`.
- CCF has a bounded candidate adapter that preserves upstream `date_modified` separately from CCF `knownAt`.

Why it is **not yet production eligible**:
- immutable raw snapshots are not yet persisted under a certified binding;
- historical `date_modified` has not been proven sufficient as decision-time source-known evidence;
- revision/correction behavior is not yet audited;
- exact bound-dataset terms/license evidence is not frozen;
- historical archive replay has not been demonstrated.

Required next proof:
1. persist raw bytes/content hash/source URL/retrieval time/parser version;
2. audit `date_modified` semantics and corrections;
3. freeze exact terms/license reference;
4. replay multiple historical weeks from immutable snapshots;
5. prove `knownAt <= asOf` at actual fantasy decision checkpoints.

### 2. NFL.com official inactive reports

**Current classification:** `rejected` for automated/systematic production ingestion under current terms  
**Potential recovery role:** official game activation/inactive state.

Evidence:
- NFL.com operates an official `Inactive Reports` surface and retains weekly inactive-report articles.
- Those reports are semantically attractive because they state the official game-day inactive list rather than requiring inference from later participation.

Terms result:
- the current NFL.com Terms and Conditions permit individual non-commercial informational use but prohibit systematic retrieval or compilation absent express prior written consent;
- FFCC requires repeatable automated acquisition, archival, and historical compilation to satisfy its production evidence contract;
- therefore the current public web surface cannot be used as the automated production feed without written consent or a separately licensed data path.

Repository consequence:
- the discovery parser/fetch prototype was removed;
- the source remains recorded as `rejected` in the machine-readable inventory to prevent accidental reintroduction;
- no NFL.com page timestamp is promoted to CCF `knownAt`;
- no scraping workaround, hidden endpoint, or credential reverse-engineering is authorized.

A future binding may reconsider NFL data only if FFCC obtains explicit permission or accesses a separately licensed/programmatic product whose terms cover the intended automated use.

### 3. nflverse / PFR snap counts

**Current classification:** `candidate`  
**Candidate recovery role:** observed workload.

Evidence:
- nflverse exposes game-level offensive, defensive, and special-teams snaps and percentages sourced from Pro Football Reference;
- CCF has a bounded candidate adapter that labels this evidence as post-game observed.

Why it is **not yet production eligible**:
- no immutable point-in-time archive binding exists yet;
- snap counts are post-game outcomes and can only affect later decisions;
- historical publication/update timing and revision behavior are not frozen;
- exact downstream permission/attribution obligations require explicit review.

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

**Current classification:** `research_only` for recovery source binding in its current form.

Use now:
- post-game opportunity/outcome labels under correct timing;
- baseline research;
- not minimum workload certification by itself because carries/targets do not establish snap/route restoration.

### 6. TIBER-Data public ingestion path

**Current classification:** `research_only` for recovery.

TIBER-Data patterns can inform evidence transport, but CCF recommendation authority cannot depend on TIBER and current coverage must not be overstated.

### 7. Legacy FFCC `injuries` table

**Current classification:** `research_only` / compatibility schema.

A database row is not provenance. Historical values cannot be presumed known at decision time, and compatibility data must not silently become native CCF evidence.

### 8. TIBER-Data depth-chart official-source registry

**Current classification:** `research_only` / adjacent evidence.

Useful for role context, but not authority for injury, practice, or final activation unless a separate matching source contract proves that role.

## Current minimum-spine matrix

| Required role | Best current path | Classification | Gate result |
|---|---|---:|---:|
| Official injury designation | nflverse injury reports | candidate | FAIL — not PIT/archive/terms certified |
| Official practice participation | nflverse injury reports | candidate | FAIL — not PIT/archive/terms certified |
| Official game activation/inactive | no permitted bound feed; NFL.com public web path terms-blocked | missing / NFL.com rejected | FAIL — source still unbound |
| Observed workload | nflverse/PFR snap counts | candidate | FAIL — not PIT/archive/terms certified |

**Viable discovery coverage:** 3 / 4 required roles.  
**Production coverage:** 0 / 4 required roles.  
**Overall production gate:** `FAIL / NOT READY`.

## Point-in-time snapshot hardening completed during this audit

The shared `ccf-source-snapshot-v1` semantics now distinguish:
- `ccf_capture` — CCF may not claim `knownAt` before the bytes were actually retrieved;
- `provider_archive_proven` — a historical source version may receive an earlier `knownAt` only when an immutable archived version has an exact proven availability time plus a durable proof reference.

`Last-Modified`, article timestamps, or other upstream metadata alone cannot backdate CCF knowledge. This shared hardening applies beyond recovery and prevents later-corrected source state from leaking into historical decision freezes.

## What should happen next

### Immediate non-Work implementation lane

1. Audit exact nflverse/nflreadpy and PFR-derived dataset terms, archive behavior, update timing, and correction semantics.
2. Add immutable raw-snapshot persistence/binding for injury/practice and snap-count candidates using the hardened source-snapshot contract.
3. Search for a **permitted programmatic source** for official game-day activation/inactives. Prefer explicit licensed/API access or written permission over scraping public pages.
4. Keep all candidate adapters fail-closed and non-authoritative until source bindings pass.
5. Add source-specific historical replay fixtures only from data that FFCC is permitted to retain and use.

### Historical-certification lane

Only after all four required bindings are production eligible:
- freeze the source-binding-plan fingerprint;
- build player × game × decision-as-of recovery rows;
- measure coverage, missingness, update latency, and correction frequency;
- freeze minimum sample/subgroup thresholds;
- freeze the first validation manifest;
- run native-no-recovery vs eligible-raw-recovery baseline before any learned recovery model;
- retain failed/negative/non-return outcomes and tail cases rather than training only on successful returns.

## Explicit non-promotions

This inventory does **not** certify:
- nflverse injury/practice data as historically leak-proof;
- NFL.com public inactive pages as an automated FFCC data source;
- publication/update timestamps as automatically safe CCF `knownAt` values;
- PFR snap counts as pre-decision information;
- roster status as final game-day activation;
- the legacy `injuries` table as native CCF truth;
- any source-specific model weight;
- any recovery feature as recommendation-critical.

The correct current answer is: **recovery architecture and three source roles have credible implementation candidates, but final official activation remains unbound under a permitted automated source, and no recovery source has yet earned production eligibility.**
