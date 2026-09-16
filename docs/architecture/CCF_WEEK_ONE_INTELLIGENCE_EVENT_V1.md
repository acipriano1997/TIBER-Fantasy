# CCF Week 1 / Season Intelligence Event v1

Status: contract and certification scaffolding only  
Recommendation authority: none  
Runtime activation: not authorized

## Why this exists

Week 1 is a regime-transition problem. One game or one report can contain real information without justifying a wholesale rewrite of what is already known about a player. The correct response is to preserve stable priors, update mutable role beliefs when the evidence supports it, and widen uncertainty when a new coordinator, quarterback, role, injury recurrence, personnel package, or defensive environment makes the old precedent less reliable.

This contract turns that principle into reviewable evidence instead of letting news become an untraceable modifier inside a recommendation score.

## Evidence hierarchy

The operating order is:

1. deep history establishes stable trait priors;
2. the most comparable recent role/regime establishes the role prior when one exists;
3. verified point-in-time news and current-season observation update the role/environment state;
4. transitions may discount or replace the role state while preserving the trait prior;
5. weak, stale, missing, or conflicting evidence increases uncertainty rather than becoming a neutral/default value;
6. recommendation authority remains with the separately certified CCF outcome and decision layers.

The schema therefore fixes `traitPriorTreatment` to `preserve`. A season-intelligence event may set `rolePriorTreatment` to `preserve`, `discount`, or `new_state`, but this module cannot declare that a player's underlying talent prior has disappeared.

## Structured event model

`ccf-season-intelligence-event-v1` supports player, team, and unit evidence for:

- role and usage changes;
- depth-chart and personnel changes;
- coordinator/coaching and quarterback changes;
- injury state and recurrence context;
- teammate availability;
- scheme changes;
- defensive/opponent context.

Each usable event carries exact source references, independent evidence-root references, `knownAt`, optional report/effective timestamps, transition type, role-prior treatment, and variable-level effects. Effects describe mechanisms such as role, opportunity, target quality, availability, team environment, scheme, opponent environment, or uncertainty. They do not contain a fantasy recommendation or overall player score.

Examples of variable-level targets include snap/route participation, targets and target quality, carry share, red-zone/goal-line work, two-minute/short-down role, air-yards share, first-read involvement, availability, and team pass/rush volume. The contract deliberately uses a `variableKey` rather than hard-coding a closed list so future certified feature definitions can evolve without converting the event ledger into a model.

## Correlated-reporting control

Source breadth is not independence. A beat report quoted by an aggregator, reposted on social media, and repeated by another outlet is still one underlying evidence root unless there is independent reporting or observation.

Every usable event therefore carries both:

- `sourceRefs`: the surfaces/artifacts that supplied the evidence;
- `evidenceRootRefs`: the underlying independent roots those sources trace to.

The contract computes source count and independent-root count separately. It never treats mirrors as extra votes merely because they increased the number of URLs or feeds.

This is a structural anti-echo control, not a claim that the software can prove journalistic independence by itself. Root assignment must itself come from governed provenance/reconciliation work.

## Temporal and freeze rules

A snapshot is valid only when every event was known no later than the frozen decision boundary:

```text
event.knownAt <= snapshot.frozenAt <= snapshot.asOf
```

When `reportedAt` is available, it must not be later than `knownAt`.

`effectiveAt` is intentionally allowed to be later than `knownAt`: for example, a Friday announcement may describe a role or inactive-state change that takes effect for Sunday's game. The important anti-leakage rule is when CCF first knew the evidence, not whether the football consequence had already occurred.

A frozen snapshot may be replayed later. New information must become a later snapshot/event rather than rewriting the earlier decision boundary.

## Missing, stale, and conflicting evidence

The schema keeps four evidence states:

- `available`: usable evidence with provenance;
- `conflicted`: usable only as uncertainty evidence until the conflict is resolved;
- `stale`: explicitly retained as known-but-not-current and prohibited from producing variable effects;
- `unavailable`: explicit absence, also prohibited from producing variable effects.

Conflicted evidence cannot choose an `up` or `down` direction. It may only express `uncertain` direction with `widen` uncertainty. This prevents the news layer from silently adjudicating contested reports.

Prior context also has explicit available/unavailable states. A missing comparable role prior or measurement regime must be represented as unavailable with a reason; it cannot be replaced by an invented reference or a neutral numeric value.

## Week 1 transition handling

The first application is Week 1, but the contract is season-generic so the same evidence grammar can be reused after later transitions.

Important Week 1 patterns are represented without bespoke scoring rules:

- **new coordinator / scheme:** discount or create a new role state; initially widen uncertainty until observed deployment accumulates;
- **new quarterback:** update team/opportunity context while preserving trait prior and exposing uncertainty;
- **reported role promotion/demotion:** map to role/opportunity variables, not directly to fantasy points;
- **injury recurrence:** update availability/readiness variables and uncertainty while preserving the stable trait prior;
- **defensive/personnel change:** use team/unit scope and propagate only to snapshots for the matching team or explicitly named players;
- **one-game usage surprise:** record current evidence, but keep the historical prior visible rather than treating Week 1 as a full new sample history.

How quickly uncertainty narrows and how strongly any of these events should move an outcome distribution are model/calibration questions. They must be learned under frozen chronological validation, not hard-coded in this evidence contract.

## Source-admission boundary

Creating an event does **not** promote its source.

The PB-01 weekly source spine remains the source-admission authority for its seven current production-critical capabilities:

- weekly box score;
- play-by-play opportunity;
- injury designation;
- practice participation;
- game activation;
- observed workload;
- NFL schedule.

This Week 1/season-intelligence contract does not add an eighth PB-01 capability and does not weaken any existing qualification gate. News/scheme/role evidence that is not already derivable from qualified PB-01 facts must receive its own governed source qualification, immutable point-in-time capture, identity/provenance treatment, reliability evidence, and trusted promotion before it can become recommendation-critical native input.

External consensus, market, social, or expert interpretation remains challenger/context evidence unless a specific source-backed fact or derived feature independently earns native admission. The number of experts agreeing is not itself a native football fact.

## Snapshot contract

`ccf-season-intelligence-snapshot-v1` binds:

- player/team/position/season/week identity;
- `asOf` and `frozenAt`;
- explicit trait, role, and measurement-regime prior references or unavailable reasons;
- the exact eligible season-intelligence events;
- explicit missing inputs;
- `recommendationAuthority: "none"`.

A snapshot rejects events for the wrong season/week, future-known events, duplicate event IDs, unrelated team/player events, fabricated prior references, and any attempt to grant the packet recommendation authority.

Snapshot fingerprints are deterministic under event/reference ordering so the same evidence set can be replayed and compared without order-dependent identities.

## Certification tests

The first contract suite preregisters these invariants:

- Week 1 role change can discount the role prior while preserving the trait prior;
- post-freeze news is rejected;
- unavailable/stale evidence cannot become a neutral or directional feature effect;
- conflicting reports cannot choose a directional winner;
- mirrored reports increase source breadth without increasing independent-root breadth;
- snapshot fingerprints are ordering-stable;
- team/unit evidence cannot leak across unrelated teams;
- the intelligence packet cannot acquire recommendation authority.

These tests are included in the CCF Independence workflow. Fixture success certifies contract behavior only; it does not certify a real news source, a live Week 1 snapshot, predictive value, or production use.

## Next admissible work

After this contract is green, the next legitimate steps are deliberately separate:

1. qualify the real source(s) needed for news/role/scheme evidence or prove the variables can be derived from already-qualified PB-01 evidence;
2. materialize immutable point-in-time snapshots rather than reconstructing historical news from today's state;
3. bind event-to-feature transforms to versioned feature definitions and measurement regimes;
4. freeze chronological evaluation/ablation plans before looking at holdout outcomes;
5. promote only event/feature families that demonstrate incremental value and acceptable calibration;
6. keep an intelligence-off replay so CCF can measure whether the layer actually improved decisions.

No runtime route, lineup decision, authority graph, source promotion, historical result, or production cutover is changed by this v1 contract.
