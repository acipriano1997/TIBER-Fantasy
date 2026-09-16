# CCF Injury & Recovery — Source Binding and Historical Validation Plan

**Status:** IMPLEMENTATION PLAN / PROMOTION-GATED  
**Scope:** Fantasy Football Command Center / CCF only. Football Unwritten remains separate.

This plan takes the v0 recovery evidence contract from “we can represent the evidence correctly” to “we can prove which sources are eligible and whether recovery features actually improve fantasy decisions.” It does **not** activate recommendation authority.

## 1. Source-binding doctrine

A source is not “bound” merely because CCF can fetch it. Production eligibility requires all of the following:

1. **Identity** — named provider + dataset/product + parser version.
2. **Permission** — explicit license/terms reference appropriate for the intended use.
3. **Point-in-time semantics** — CCF can prove what was known at the decision `asOf`; current-only snapshots are insufficient for historical certification.
4. **Archival strategy** — immutable snapshot, append-only event log, or a trustworthy provider archive.
5. **Raw traceability** — every promoted evidence row can point back to the underlying captured record.
6. **Reliability review** — field semantics, correction behavior, missingness, update cadence, and known provider limitations are documented.
7. **Authority classification** — raw fact, reported evidence, observed football evidence, or challenger inference.
8. **No silent promotion** — external/legacy/challenger inference can remain useful evidence but cannot become CCF recommendation authority simply because it is available.

The executable contract is `server/modules/ccf/injury/injurySourceBinding.ts`.

## 2. Minimum source coverage before recovery modeling

CCF should not fit or promote a recovery model until it has production-eligible point-in-time coverage for these four minimum evidence roles:

### A. Official injury designation

Purpose:
- establish official week/game health designation as known at the time;
- detect designation changes;
- support availability uncertainty without pretending designation equals workload readiness.

Required capture:
- player/team/game/week identity;
- designation/status;
- published/issued time when available;
- retrieval and `knownAt`;
- raw trace;
- correction/revision semantics.

### B. Official practice participation

Purpose:
- represent DNP / limited / full progression separately from game activation;
- test whether practice trajectory predicts workload restoration.

Required capture:
- practice date/session identity;
- official participation category;
- injury/body-part text only as officially reported;
- publication/retrieval/known timestamps;
- raw trace and revision behavior.

### C. Official game activation / inactive state

Purpose:
- resolve whether a player was eligible/active for the game;
- distinguish “available to play” from “actually used normally.”

Required capture:
- official active/inactive state or equivalent roster/game-status fact;
- publication/retrieval/known timestamps;
- raw trace.

### D. Observed workload

Purpose:
- determine what actually happened after return independently from health labels.

Minimum candidate fields:
- offensive snap share;
- route participation where reliably available;
- carries / targets / touches;
- designed or high-leverage usage when deterministically derivable;
- goal-line/red-zone usage when definition is frozen;
- pass-protection/special-teams exposure only if source quality supports it.

Required capture:
- source/player/game identity;
- statistic definition and parser version;
- immutable game-level source snapshot or event log;
- raw trace.

`assertCCFRecoveryMinimumSourceCoverage()` now fails closed if any of these four roles are absent from the production-eligible binding plan.

## 3. Enrichment sources — useful but not minimum-gate requirements

These should be added only after the minimum source spine is reliable.

### Structural / procedure evidence

Potential evidence includes confirmed surgery/procedure, operative vs non-operative treatment, repair/reconstruction/preservation, laterality, or complications **only when explicitly and reliably reported**.

Rules:
- never infer a hidden procedure from expected recovery time;
- never backfill later-known details into an earlier historical decision;
- preserve `reported` vs `confirmed` status;
- use credible reporting as evidence, not diagnosis.

### Performance proxies

Candidate football-observable signals can include:
- maximum-speed exposure or tracking-derived movement measures where licensed/reliable;
- explosive-play rate;
- yards after contact;
- separation/target-depth changes;
- scramble/designed-rush behavior;
- pressure avoidance;
- other position-relevant actions.

These are not required for the first source-bound recovery model because coverage/licensing may be incomplete. Missingness must remain explicit.

### Conditioning / ramp evidence

Coach/player statements about conditioning may be captured as narrative evidence, but observed snaps/routes/high-demand actions take precedence for workload inference. No narrative source becomes objective physical testing.

### Setback context

Recurrence history, compensatory/opposite-limb events, recent return, and rapid workload changes may become context features only after the underlying event data and definitions are reliable. They must not be converted directly into individualized medical-risk probabilities.

## 4. Source priority by question, not one global ranking

Source credibility is dimension-specific:

- **Did the player carry an official designation?** Official injury report is strongest.
- **Did the player practice?** Official practice participation is strongest.
- **Was the player active?** Official game activation is strongest.
- **How much did the player actually play?** Observed snaps/routes/touches are stronger than coach optimism.
- **Was prior performance restored?** Repeated observed football performance matters more than active status alone.
- **What medical procedure occurred?** Confirmed primary reporting is necessary; analyst inference remains secondary.

The existing ordinal credibility bands are audit aids, not numeric model weights.

## 5. Snapshot and provenance path

Every source promoted into recovery evidence should flow through existing CCF source-snapshot semantics:

```text
provider record
  -> immutable/raw capture
  -> CCF source snapshot manifest
  -> parser/versioned normalized fact
  -> recovery source binding
  -> recovery evidence row
  -> frozen decision evidence / historical expectation freeze
  -> CCF-native derived features
  -> recommendation only after model certification
```

Use `ccf-source-snapshot-v1` for content identity and `knownAt` eligibility. Current-only snapshots may support live display/research but **cannot** establish historical point-in-time truth unless an eligible archive exists.

## 6. News / reporting integration

Injury reporting should reuse FFCC's Season Intelligence / News Intelligence evidence doctrine rather than create a second reporting system.

Mapping rule:
- a news/intelligence event may produce one or more recovery evidence rows;
- the original event remains the provenance owner for source, timestamp, fact status, mechanism, uncertainty, recheck/expiry, and raw reference;
- the recovery layer adds only the recovery dimension and fantasy-relevant normalized fields;
- no duplicate “injury news truth” database should be created.

Until the news-intelligence runtime is fully bound in the repository, this remains an integration obligation rather than a claim of live support.

## 7. Historical dataset unit

The validation unit should be a **player × game × decision-as-of checkpoint** record, not a retrospective player-season row.

Each record must freeze:
- season/week/game/player/team/position;
- scoring-profile fingerprint;
- decision `asOf`;
- every eligible recovery/source artifact known by that time;
- baseline CCF football context available at the same `asOf`;
- explicit missing/unavailable recovery dimensions;
- eventual outcomes stored separately from the pre-decision freeze.

The existing `ccf-historical-expectation-freeze-v1` remains the pre-decision evidence authority.

## 8. Decision checkpoints

Historical evaluation should mirror actual fantasy decisions. Use standardized checkpoint classes rather than a single retrospective end-of-week view:

1. **Early-week checkpoint** — initial injury/availability uncertainty.
2. **Post-practice checkpoint** — after the latest eligible official practice evidence for that decision horizon.
3. **Official game-status checkpoint** — after eligible game-status evidence.
4. **Last eligible pre-lock checkpoint** — closest legal/available evidence before the relevant fantasy lineup locks.

Exact timestamps must come from actual source publication/retrieval and league/game lock rules. Do not invent synthetic `knownAt` times to make historical data easier.

A source that lacks historical publication timing cannot be treated as known at an earlier checkpoint merely because its final weekly value is available now.

## 9. Outcome labels

Keep outcomes distinct so the model does not learn “fantasy points = health.”

### Participation outcomes
- active/inactive;
- any offensive participation where relevant.

### Workload outcomes
- snap share;
- route participation where available;
- carry/target/touch opportunity;
- high-leverage usage where definition is frozen.

### Fantasy outcomes
- scoring-format-specific fantasy points;
- boom/bust or threshold events only under predeclared definitions;
- feasible-alternative lineup regret for actual decision evaluation.

### Performance-restoration research outcomes
Use football-observable, predeclared metrics. “Return to previous performance” must never be labeled from a single good fantasy score. Baseline/restoration definitions must be frozen before the final test is inspected.

## 10. Required comparison arms

Every certified recovery experiment must include at least:

1. `native_baseline_no_recovery_features`
2. `eligible_raw_recovery_evidence`
3. `learned_recovery_features`

`legacy_or_external_challenger` may be included for comparison but is never target truth or recommendation authority.

This isolates three different questions:
- does recovery information itself help?
- do learned recovery mechanisms add value beyond raw status/practice/workload facts?
- does CCF outperform or meaningfully differ from legacy/external injury heuristics without depending on them?

## 11. Predeclared recovery research questions

The v1 protocol supports these frozen questions:

1. **Active vs workload readiness** — does separating game activation from expected workload improve predictions/decisions?
2. **Practice progression → workload** — does DNP/limited/full trajectory predict snaps/routes/opportunity?
3. **Role evidence vs time since injury** — do observed role/workload signals outperform generic elapsed-time heuristics?
4. **Return to performance separation** — can workload restoration and performance restoration be modeled as separate states?
5. **Position interaction** — are injury/recovery effects stable and materially different by QB/RB/WR/TE after role/opportunity controls?
6. **Treatment/procedure interaction** — does reliably known treatment information add incremental value?
7. **Setback uncertainty** — does explicit uncertainty/context improve calibration/selectivity without pretending to predict individual reinjury causally?

## 12. Chronological split and leakage rules

Use the existing chronological split utilities and require a true held-out test window.

Hard rules:
- training observations must be strictly earlier than evaluation observations;
- final test outcomes remain unseen while model/feature/threshold choices are made;
- parser and feature definitions are frozen before final test;
- scoring profile, source-binding plan, dataset, and validation protocol each receive deterministic fingerprints;
- revised/corrected source data cannot silently replace the historical snapshot used by a prior run;
- later-known procedure details, rest-of-season outcomes, future game usage, final season aggregates, closing market information, and retrospective depth-chart conclusions are forbidden from earlier decision freezes.

## 13. Survivorship and selection-bias controls

The historical population must include:
- players who returned successfully;
- players who returned with diminished workload/performance;
- players who aggravated/recurred where the event is observable;
- players who did not return in the sampled horizon;
- short and long absences;
- low-profile players, not only famous recoveries.

Do not construct the dataset by first identifying notable comebacks. That would turn tail cases into the sampling frame.

## 14. Metrics

The executable protocol permits predeclared primary/secondary metrics including:
- fantasy-points MAE/RMSE;
- rank quality;
- interval coverage;
- boom/bust Brier score;
- lineup regret;
- abstention/selectivity;
- snap-share MAE;
- route-participation MAE;
- touch/opportunity MAE.

The final protocol must identify **primary** metrics before results are inspected. Secondary metrics cannot be promoted post hoc because they happened to look favorable.

## 15. Subgroups and statistical support

Candidate subgroup axes:
- position;
- injury class;
- return stage;
- week since return;
- age band;
- scoring format;
- role tier;
- season/era.

Minimum overall paired rows and minimum subgroup rows must be predeclared in the frozen protocol. This plan intentionally does not invent the numeric thresholds before historical coverage is measured.

Underpowered subgroups must be marked report-only, pooled under a predeclared rule, or excluded from promotion claims. They cannot receive bespoke coefficients because the point estimate looks interesting.

## 16. Promotion criteria

Before final evaluation, freeze:
- candidate arm;
- comparator arm;
- primary metric;
- direction of improvement;
- absolute and/or relative improvement threshold;
- whether criterion applies overall, to supported subgroups, or both.

No threshold may be chosen after viewing the final holdout result.

Passing prediction metrics alone is insufficient. Promotion also requires:
- point-in-time source coverage;
- calibration and subgroup stability;
- no unresolved leakage;
- TIBER-off replay;
- authority-graph compliance;
- explicit behavior under missing evidence;
- retention of failed candidates/negative findings in append-only history.

The executable manifest is `server/modules/ccf/injury/injuryRecoveryValidationProtocol.ts`.

## 17. Recommended execution order

### Phase 1 — source inventory
- enumerate candidate providers already available to FFCC/TIBER-Data;
- classify each source using `ccf-recovery-source-binding-v1`;
- verify terms/license, historical archive behavior, field semantics, correction behavior, and raw-trace support;
- mark sources `candidate`, `research_only`, `production_eligible`, or `rejected`.

### Phase 2 — minimum spine
- bind official designation;
- bind official practice participation;
- bind official game activation;
- bind observed workload;
- run minimum-source-coverage gate.

### Phase 3 — historical archive
- capture/freeze source snapshots;
- construct player-game-decision checkpoint rows;
- preserve outcomes separately;
- fingerprint dataset and scoring profile.

### Phase 4 — baseline experiment
- run native CCF with no recovery features;
- run raw eligible recovery evidence only;
- compare point/play/workload/fantasy outcomes chronologically.

### Phase 5 — learned recovery features
- fit only on training data;
- tune only through allowed validation windows;
- freeze model + protocol;
- inspect final test once.

### Phase 6 — enrichment
Only after the minimum recovery model proves useful, test procedure details, performance proxies, position interactions, age, recurrence context, workload ramp, and era effects one family at a time through ablations.

## 18. What remains deliberately unbound

As of this plan, no provider is declared production-eligible merely by name. Concrete bindings require evidence of terms/license, archival point-in-time behavior, parser identity, raw trace, and reliability. This avoids turning a design document into false source certification.

Likewise, no historical recovery model has yet earned recommendation-critical authority. The next legitimate milestone is a **fingerprinted source-binding inventory**, followed by a **frozen historical dataset and predeclared validation protocol**.
