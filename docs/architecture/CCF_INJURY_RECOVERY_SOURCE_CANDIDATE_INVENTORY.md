# CCF Injury & Recovery — Concrete Source Candidate Inventory

**Status:** AUDITED / ALL FOUR MINIMUM ROLES HAVE VIABLE CURRENT CANDIDATES / PRODUCTION COVERAGE NOT READY  
**As of:** 2026-09-14  
**Scope:** Fantasy Football Command Center / CCF only. Football Unwritten remains separate.

## Verdict

**Minimum recovery production source coverage: FAIL / NOT READY.**

The source-discovery gap is closed without lowering provenance or permission standards. All four minimum roles have a viable current path, but **zero bindings are production eligible**.

The current leading source spine is:

1. official injury designation — Sportradar NFL Official API `Weekly Injuries`;
2. official practice participation — Sportradar NFL Official API `Weekly Injuries`;
3. official game activation/inactive state — Sportradar NFL Official API `Game Roster`;
4. observed workload — nflverse / Pro Football Reference snap counts.

The prior nflverse injury/practice candidate was corrected after the upstream availability audit: nflverse documents that its injury-data source ended after the **2024 season**, so it is now `research_only` historical evidence and cannot satisfy the live 2026 spine.

The NFL.com public inactive-report route remains recorded as `rejected` for automated/systematic FFCC ingestion under current terms. No scraping workaround or hidden-endpoint substitution is authorized.

`assertCCFRecoveryMinimumSourceCoverage()` must continue to fail until every required role has appropriate permission, point-in-time semantics, raw trace, parser identity, archive strategy, reliability review, and immutable evidence.

## Classification rules

- `candidate`: a plausible source with a concrete product/dataset, usable semantics, and a permission path worth validating.
- `research_only`: useful for bounded research/reference, but unavailable for the live role or missing production requirements.
- `production_eligible`: every `ccf-recovery-source-binding-v1` requirement is proven.
- `rejected`: unsuitable for the required use, including permission/terms conflicts.

Official, licensed, or historically useful does **not** automatically mean production eligible.

## Inventory

### 1. Sportradar NFL Official API — Weekly Injuries

**Current classification:** `candidate`  
**Candidate roles:** official injury designation; official practice participation; structural/reporting context.

Why it is the leading current path:
- the authenticated NFL Official API exposes a weekly injury feed with player/team identity;
- the feed contains game-status injury designation, injury description, practice participation, and `status_date`-style timing metadata;
- Sportradar documents current-week update behavior and a formal trial/production access model;
- the source can satisfy both designation and practice roles without depending on a stale 2024-only public dataset.

Why it is **not yet production eligible**:
- FFCC does not claim an authorized account/order binding for production use;
- no CCF parser has been verified against an actual authorized payload;
- no immutable pre-decision CCF archive exists for the feed;
- provider timing fields and current historical responses do not by themselves prove the exact payload known at each historical fantasy checkpoint;
- correction behavior, missingness, player/team identity joins, and latency have not yet been empirically audited by CCF.

Required next proof:
1. obtain/verify authorized access appropriate for FFCC's intended use;
2. freeze the applicable agreement/order/addendum reference;
3. capture real authorized payloads at multiple decision checkpoints;
4. build and version a fail-closed parser from those real payloads;
5. archive exact raw bytes, retrieval time, provider timing fields, content hash, parser version, and source/game/player identity;
6. measure updates/corrections/missingness;
7. prove prospective `knownAt <= asOf` behavior and separately determine what, if anything, is historically reconstructable without leakage.

### 2. Sportradar NFL Official API — Game Roster

**Current classification:** `candidate`  
**Candidate role:** official game activation/inactive state.

Why it is the leading candidate:
- Sportradar documents Game Roster as the declared roster for a specific NFL game;
- player game status includes `deactivated`;
- the NFL game-status workflow documents entry of inactive players around 90 minutes before scheduled kickoff;
- the API is authenticated and supports a formal trial/production access path rather than public-page scraping.

Why it is **not yet production eligible**:
- no authorized FFCC production account/order binding is claimed;
- no CCF parser/version has been verified against a real authorized payload;
- no immutable CCF pre-lock archive exists;
- current historical responses cannot automatically prove the exact state available at a prior lineup checkpoint;
- update/correction behavior, coverage, latency, and identity joins remain unverified by CCF.

Required next proof:
1. verify authorized use rights;
2. capture representative pre-kickoff Game Roster payloads;
3. implement a versioned fail-closed parser from real samples;
4. persist exact bytes, hashes, retrieval time, game/player IDs, and parser identity;
5. archive the feed prospectively before relevant locks;
6. audit subsequent changes/corrections and provider change-log behavior.

### 3. nflverse injury reports — historical only

**Current classification:** `research_only`  
**Historical roles:** injury designation; practice participation through 2024.

CCF retains the bounded adapter because the historical fields are useful for research and source-semantics work. The adapter preserves upstream `date_modified` separately from CCF `knownAt`.

Critical availability boundary:
- nflverse documents that its injury-data source died after the 2024 season;
- no 2025+ live injury dataset is currently available through that path;
- the CCF adapter therefore fails closed for seasons after 2024 before making a network request.

Permission evidence:
- the `nflverse-data` repository declares CC BY 4.0 and the exact repository license reference is retained in the binding;
- repository licensing does not waive the need to preserve attribution, upstream-source limitations, point-in-time semantics, and correction audits.

Permitted research use does **not** make this a live 2026 source or historical PIT truth. A current copy of a historical file cannot be backdated into an earlier CCF decision merely because rows contain `date_modified`.

### 4. NFL.com public inactive reports

**Current classification:** `rejected` for automated/systematic production ingestion under current terms.

NFL.com is semantically authoritative, but its current terms prohibit systematic retrieval or compilation absent express prior written consent. FFCC requires repeatable automated acquisition and historical compilation, so the public web route is not an eligible production feed without written consent or a separately licensed path.

Repository consequence:
- the discovery fetch/parser prototype was removed;
- the rejected route remains machine-readable so it is not accidentally reintroduced;
- no scraping workaround, hidden endpoint, or credential reverse-engineering is authorized.

### 5. nflverse / Pro Football Reference snap counts

**Current classification:** `candidate`  
**Candidate role:** observed workload.

CCF has a bounded adapter and explicitly labels this as post-game observed evidence.

Permission/update evidence:
- the bound distribution is delivered through `nflverse-data`, whose repository declares CC BY 4.0;
- nflverse documents an in-season snap-count polling cadence of four times daily;
- that cadence describes upstream collection behavior, not an automatic CCF historical `knownAt`.

Still required before promotion:
- freeze the exact attribution/upstream-use implications for the intended FFCC use;
- persist immutable raw snapshots and hashes;
- determine actual publication/update timing, corrections, and missingness;
- bind a reliability review;
- enforce that game-N workload cannot affect game-N pre-lock decisions;
- audit identity joins.

### 6. nflverse participation data

**Current classification:** `candidate` / enrichment only.

Potential uses include richer observed involvement and post-return role restoration. It does not substitute for official pregame activation merely because a player later appears in participation data.

### 7. Existing CCF nflverse weekly player-stat adapter

**Current classification:** `research_only` for minimum recovery coverage.

Useful for post-game outcomes and opportunity labels under correct timing. Carries/targets do not establish snap/route restoration by themselves.

### 8. TIBER-Data public ingestion path

**Current classification:** `research_only` for recovery.

Transport patterns may be reused, but recommendation authority and native evidence binding remain CCF-owned.

### 9. Legacy FFCC `injuries` table

**Current classification:** `research_only` / compatibility schema.

A database row is not provenance. Historical values cannot be presumed known at decision time.

### 10. TIBER-Data depth-chart official-source registry

**Current classification:** `research_only` / adjacent evidence.

Useful for role context, not injury/practice/final-activation authority unless separately proven.

## Current minimum-spine matrix

| Required role | Leading current candidate | Classification | Gate result |
|---|---|---:|---:|
| Official injury designation | Sportradar NFL Official API Weekly Injuries | candidate | FAIL — authorized binding/parser/archive/PIT proof incomplete |
| Official practice participation | Sportradar NFL Official API Weekly Injuries | candidate | FAIL — authorized binding/parser/archive/PIT proof incomplete |
| Official game activation/inactive | Sportradar NFL Official API Game Roster | candidate | FAIL — authorized binding/parser/archive/PIT proof incomplete |
| Observed workload | nflverse/PFR snap counts | candidate | FAIL — archive/PIT/reliability proof incomplete |

**Viable current discovery coverage:** 4 / 4 required roles.  
**Production coverage:** 0 / 4 required roles.  
**Overall production gate:** `FAIL / NOT READY`.

## Point-in-time and raw-archive hardening completed during this audit

The shared `ccf-source-snapshot-v1` semantics now distinguish:
- `ccf_capture` — CCF may not claim `knownAt` before the bytes were actually retrieved;
- `provider_archive_proven` — a historical source version may receive an earlier `knownAt` only when an immutable archived version has an exact proven availability time plus a durable proof reference.

HTTP `Last-Modified`, article timestamps, provider status dates, update schedules, or current historical files alone cannot backdate CCF knowledge.

The repository also now includes a generic immutable raw-source archive writer:
- exact source bytes are preserved alongside the source-snapshot manifest;
- archive identity includes capture metadata as well as content identity, so two retrievals of identical bytes remain distinct observations;
- repeat writes of the exact same capture are idempotent;
- tampering is detected rather than silently overwritten;
- provider/source permission and reliability remain separate promotion gates.

## Promotion-readiness diagnostics

Source readiness is no longer only a binary validation failure. `evaluateCCFRecoverySourcePromotionReadiness()` reports explicit blockers for each binding, including:
- rejected/research-only status;
- disallowed challenger/speculative authority;
- missing archived point-in-time mode;
- missing archive strategy;
- missing permission/terms reference;
- missing parser version/source locator;
- undocumented PIT semantics;
- missing raw trace;
- missing reliability review.

Current expected blockers are machine-tested. No blocker is cleared merely by changing a status label.

## What should happen next

### Immediate non-Work implementation lane

1. Finish nflverse/PFR snap-count source qualification: upstream attribution, corrections, missingness, update timing, and reliability review.
2. Preserve nflverse injury/practice only as historical research through 2024; do not use it as a 2026 live source.
3. Preserve Sportradar Weekly Injuries and Game Roster as the leading current pregame candidates without inventing credentials or payloads.
4. When authorized Sportradar access exists, capture representative real payloads at fantasy-relevant checkpoints and archive them with the generic raw-source archive writer.
5. Build parsers only from real authorized payloads and fail closed on schema drift/incomplete identity.
6. Keep NFL.com public-page automation rejected unless express permission is obtained.
7. Keep all candidate adapters non-authoritative until their binding blockers are genuinely cleared.

### Historical-certification lane

Historical endpoints are useful for outcomes/labels and research, but they do not automatically reconstruct what was known at a prior decision time. If an exact versioned provider archive cannot prove intermediate past states, the first fully leak-proof recovery validation corpus must rely on **prospective CCF capture** for those dimensions.

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
- nflverse injury/practice data as a current 2026 feed or historically leak-proof evidence;
- Sportradar Weekly Injuries or Game Roster as authorized FFCC production feeds yet;
- any provider's current historical response as proof of what CCF knew at a prior decision time;
- NFL.com public inactive pages as an automated FFCC source;
- PFR snap counts as pre-decision information;
- roster status as a substitute for final game-day activation;
- the legacy `injuries` table as native CCF truth;
- any recovery feature as recommendation-critical.

The correct current answer is: **all four required recovery source roles have viable current candidates, but no binding has earned production eligibility. The remaining problem is source authorization, parser/raw-capture implementation, reliability auditing, and prospective point-in-time certification—not source discovery.**
