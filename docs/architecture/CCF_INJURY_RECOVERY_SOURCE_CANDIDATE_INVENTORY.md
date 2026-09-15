# CCF Injury & Recovery — Concrete Source Candidate Inventory

**Status:** AUDITED / ALL FOUR MINIMUM ROLES HAVE VIABLE CANDIDATES / PRODUCTION COVERAGE NOT READY  
**As of:** 2026-09-14  
**Scope:** Fantasy Football Command Center / CCF only. Football Unwritten remains separate.

## Verdict

**Minimum recovery production source coverage: FAIL / NOT READY.**

The source-discovery gap is now closed without weakening permission standards. All four required roles have a viable candidate, but **zero bindings are production eligible**.

The four required roles are:

1. official injury designation;
2. official practice participation;
3. official game activation/inactive state;
4. observed workload.

The leading activation candidate is now Sportradar's authenticated **NFL Official API — Game Roster** feed. Sportradar documents the feed as the declared game roster and states inactive players are entered around 90 minutes before kickoff. It provides a formal trial/production license path, unlike scraping the public NFL.com site. The NFL.com public inactive-report route remains recorded as `rejected` for automated/systematic FFCC ingestion under current terms.

`assertCCFRecoveryMinimumSourceCoverage()` must continue to fail until every required role has permission, point-in-time, raw-trace, parser, archive, reliability, and identity proof.

## Classification rules

- `candidate`: plausible source with a concrete dataset/product, usable semantics, and a permission path worth validating.
- `research_only`: usable for bounded research/reference but missing production requirements or not intended to satisfy the minimum spine.
- `production_eligible`: every `ccf-recovery-source-binding-v1` requirement is proven.
- `rejected`: unsuitable for the required use, including permission/terms conflicts.

A source being official or licensed does **not** automatically make it production eligible.

## Inventory

### 1. nflverse injury reports

**Current classification:** `candidate`  
**Candidate roles:** official injury designation; official practice participation; structural/reporting context.

CCF already has a bounded adapter that preserves upstream `date_modified` separately from CCF `knownAt`.

Permission evidence:
- the `nflverse-data` repository declares **CC BY 4.0**;
- the binding now records the exact repository license reference rather than leaving permission unspecified.

Still required before promotion:
- confirm the bound release artifact is covered as expected and implement attribution handling;
- persist immutable raw snapshots with hashes, retrieval times, parser identity, and archive references;
- audit historical `date_modified` meaning, revisions/corrections, and missingness;
- replay representative historical weeks against exact archived bytes;
- prove decision-checkpoint `knownAt <= asOf` rather than backdating from current files.

### 2. Sportradar NFL Official API — Game Roster

**Current classification:** `candidate`  
**Candidate role:** official game activation/inactive state.

Why it is the leading candidate:
- Sportradar documents Game Roster as the declared game roster for a specific NFL game;
- player game status includes `deactivated`;
- the NFL game-status workflow states inactive players are entered around 90 minutes before scheduled kickoff;
- the API is authenticated and explicitly supports `trial` and `production` access rather than requiring public-site scraping;
- Sportradar publishes current master terms covering both free trials and paid order-form service.

Why it is **not yet production eligible**:
- FFCC does not currently have a Sportradar API key/account binding in the repository;
- free-trial use is for internal evaluation, not automatic production authorization;
- production use requires the appropriate customer/order-form license and any approvals required by that agreement;
- no CCF parser/version has been verified against a live authorized payload;
- no immutable CCF pre-lock archive exists;
- historical provider responses may represent final state rather than prove the exact state known at a historical lineup checkpoint;
- update/correction behavior, identity joins, coverage, and missingness have not been empirically audited by CCF.

Required next proof:
1. obtain authorized trial/production access suitable for the intended use;
2. freeze the exact agreement/order/addendum references applicable to FFCC;
3. capture representative authorized Game Roster payloads before kickoff;
4. implement and version a fail-closed parser only against real authorized payloads;
5. persist raw bytes/content hashes/retrieval times/game IDs/player IDs/parser version;
6. archive the feed at decision time going forward;
7. determine whether historical data can prove pre-lock state or is suitable only for labels/outcomes;
8. audit postgame corrections and daily change-log behavior.

### 3. NFL.com public inactive reports

**Current classification:** `rejected` for automated/systematic production ingestion under current terms.

NFL.com is semantically authoritative, but its current terms prohibit systematic retrieval or compilation absent express prior written consent. FFCC requires repeatable automated acquisition and historical compilation, so the public web route is not an eligible production feed without written consent or a separately licensed path.

Repository consequence:
- the discovery fetch/parser prototype was removed;
- the rejected route remains in the machine-readable inventory to prevent accidental reintroduction;
- no scraping workaround, hidden endpoint, or credential reverse-engineering is authorized.

### 4. nflverse / PFR snap counts

**Current classification:** `candidate`  
**Candidate role:** observed workload.

CCF already has a bounded adapter and marks this as post-game observed evidence.

Permission/update evidence:
- the bound data is distributed through `nflverse-data`, whose repository declares **CC BY 4.0**;
- nflverse documents snap-count polling four times daily.

Still required before promotion:
- freeze attribution and upstream PFR implications for the intended use;
- persist immutable snapshots and hashes;
- determine actual publication/update timing and correction behavior;
- enforce `knownAt` so a game's workload cannot affect that same game's pre-lock decision;
- audit identity joins and missingness.

### 5. nflverse participation data

**Current classification:** `candidate` / enrichment only.

Potential uses include richer observed involvement and post-return role restoration. It does not substitute for official pregame activation simply because a player later appears in participation data.

### 6. Existing CCF nflverse weekly player-stat adapter

**Current classification:** `research_only` for minimum recovery coverage.

Useful for post-game outcomes and opportunity labels under proper timing, but carries/targets do not establish snap/route restoration by themselves.

### 7. TIBER-Data public ingestion path

**Current classification:** `research_only` for recovery.

Transport patterns may be reused, but recommendation authority and native evidence binding remain CCF-owned.

### 8. Legacy FFCC `injuries` table

**Current classification:** `research_only` / compatibility schema.

A database row is not provenance. Historical values cannot be presumed known at decision time.

### 9. TIBER-Data depth-chart official-source registry

**Current classification:** `research_only` / adjacent evidence.

Useful for role context, not injury/practice/final-activation authority unless separately proven.

## Current minimum-spine matrix

| Required role | Leading candidate | Classification | Gate result |
|---|---|---:|---:|
| Official injury designation | nflverse injury reports | candidate | FAIL — not PIT/archive/reliability certified |
| Official practice participation | nflverse injury reports | candidate | FAIL — not PIT/archive/reliability certified |
| Official game activation/inactive | Sportradar NFL Official API Game Roster | candidate | FAIL — access/license binding, parser, archive, PIT replay incomplete |
| Observed workload | nflverse/PFR snap counts | candidate | FAIL — not PIT/archive/reliability certified |

**Viable discovery coverage:** 4 / 4 required roles.  
**Production coverage:** 0 / 4 required roles.  
**Overall production gate:** `FAIL / NOT READY`.

## Point-in-time snapshot hardening completed during this audit

The shared `ccf-source-snapshot-v1` semantics now distinguish:
- `ccf_capture` — CCF may not claim `knownAt` before bytes were actually retrieved;
- `provider_archive_proven` — a historical source version may receive an earlier `knownAt` only when an immutable archived version has an exact proven availability time plus a durable proof reference.

HTTP `Last-Modified`, article timestamps, provider update language, or current historical files alone cannot backdate CCF knowledge. This prevents revised source state from leaking into historical decision freezes.

## What should happen next

### Immediate non-Work implementation lane

1. Finish nflverse injury/practice and snap-count source qualification: exact release semantics, attribution, corrections, missingness, archive behavior, and update timing.
2. Add immutable raw-snapshot capture/binding around authorized candidate fetches using the hardened source-snapshot contract.
3. Preserve Sportradar as the leading activation candidate, but do not write a production parser against guessed payloads or claim access that FFCC does not have.
4. When authorized Sportradar access exists, capture representative pregame payloads and build the parser from those real samples.
5. Keep NFL.com public-page automation rejected unless express permission is obtained.
6. Keep all candidate adapters non-authoritative until source bindings pass.

### Historical-certification lane

Only after all four required bindings are production eligible:
- freeze the source-binding-plan fingerprint;
- build player × game × decision-as-of recovery rows;
- measure coverage, missingness, latency, and correction frequency;
- freeze minimum sample/subgroup thresholds;
- freeze the first validation manifest;
- run native-no-recovery vs eligible-raw-recovery baseline before any learned recovery model;
- retain failed/negative/non-return outcomes and tail cases.

## Explicit non-promotions

This inventory does **not** certify:
- nflverse injury/practice data as historically leak-proof;
- Sportradar Game Roster as an authorized FFCC production feed yet;
- any provider's current historical response as proof of what CCF knew at a prior decision time;
- NFL.com public inactive pages as an automated FFCC source;
- PFR snap counts as pre-decision information;
- roster status as final game-day activation;
- the legacy `injuries` table as native CCF truth;
- any recovery feature as recommendation-critical.

The correct current answer is: **all four required recovery source roles now have viable candidates, but no binding has yet earned production eligibility; the activation gap is a licensing/access-and-point-in-time certification problem rather than a source-discovery problem.**
