# CCF Injury & Recovery Intelligence v0

**Status:** Evidence-contract foundation only; not recommendation-authoritative.  
**Scope:** Fantasy Football Command Center / CCF only. Football Unwritten is explicitly out of scope.

## Purpose

Improve fantasy-football decisions around injured and recently returned players without pretending CCF has private medical information or diagnostic authority.

The governing sports-science conclusion is not that modern medicine simply makes injuries heal faster. Modern care can improve outcomes through procedure selection, capacity preservation during biological healing, progressive loading, objective readiness assessment, individualized rehabilitation, and better distinction between returning to participation and returning to prior performance.

For CCF this means **active is not healthy, cleared is not full workload, full workload is not prior athletic performance, and one good box score is not proof that restrictions are gone.**

## Existing CCF strengths reused

This work deliberately reuses the CCF-first foundation rather than creating a parallel medical engine:

- CCF-native vs legacy/external/challenger producer families;
- exact `asOf` / `knownAt` temporal eligibility;
- explicit missing and ineligible evidence rather than neutral defaults;
- uncertainty and abstention;
- mechanism contributions and critical-feature provenance;
- immutable/frozen decision evidence and later post-outcome reconciliation;
- CCF-only recommendation authority.

The injury/recovery layer is an **evidence + feature family**. It does not own the fantasy recommendation.

## Live-repository audit

### What already works conceptually

The CCF-first independence work already requires injury/readiness inference to be rebuilt natively before promotion, keeps TIBER-Forecast/IRRIS as challenger/reference material, rejects non-native recommendation-critical producers, and provides leakage-safe feature/source contracts. Those are the correct foundations.

### Legacy Start/Sit oversimplification

The legacy Start/Sit path currently reduces injury to `injuryTag: OUT | D | Q | P | null` and a fixed volatility/trust adjustment. Its data assembler fetches the latest injury row and maps the designation to that tag. This collapses materially different questions:

- probability of playing;
- practice progression;
- expected snap share;
- expected routes/touches/targets;
- conditioning/ramp;
- role restoration;
- performance restoration;
- setback uncertainty.

The module is already classified `EXTRACT`, so v0 does **not** add new recommendation logic there. It remains compatibility/challenger-only.

### Legacy consensus injury-profile oversimplification

`server/consensus/injuryProfiles.ts` and `injuryProfiles.v2.json` contain fixed average recovery weeks, fixed return-to-play probabilities, fixed recurrence-risk values, linear recovery interpolation, fixed year-of-injury/year-after-return multipliers, and broad deterministic performance statements.

Those values must be treated as `legacy_internal_heuristic` / research hypotheses for CCF purposes. They are **not** valid CCF-native priors unless independently sourced, reconstructed point-in-time, refit, calibrated, and promoted through frozen chronological out-of-sample testing.

This v0 intentionally does not delete the legacy files because they may still support compatibility paths. Authority is removed by the CCF producer-family boundary, not by pretending old code never existed.

## v0 contract

`server/modules/ccf/injury/injuryRecoveryEvidence.ts` introduces `ccf-injury-recovery-evidence-v1`.

It keeps these evidence dimensions distinct:

1. **Structural** — reported/confirmed injury type, body part/tissue when known, treatment mode, procedure strategy, timing, complications.
2. **Participation** — DNP, limited/full practice, medical clearance, active/inactive, actual participation.
3. **Workload** — snaps, routes, targets, touches, designed/high-leverage/goal-line usage, pass protection, special teams.
4. **Performance** — observable football-performance proxies such as speed exposure, acceleration/deceleration when credible, rushing efficiency, yards after contact, separation, target depth, explosive rate, designed rushing, scramble rate, pressure avoidance.
5. **Conditioning/ramp** — cleared-but-limited, conditioning rotation, reduced high-demand actions, apparently normal workload, or unknown.
6. **Setback context** — recent return, recurrence history, compensatory/opposite-limb injury, aggravation, rapid workload change, age context, position demand, or other bounded context.

The contract does not require every dimension to be known. Unknown/missing evidence must remain explicit.

## Evidence status and model treatment

Each row carries both epistemic status and CCF treatment:

### Fact status

- `confirmed`
- `reported`
- `observed`
- `speculative`

### Model treatment

- `immediate_update`
- `partial_update`
- `watch_only`
- `context_only`
- `no_model_weight`

Guardrails prevent speculative evidence from receiving immediate/partial native-model treatment. Social-media speculation is forced to `no_model_weight`. Analyst medical inference cannot be an immediate native update.

This preserves the distinction between **news as evidence** and **recommendation authority**.

## Credibility hierarchy

The contract defines an ordinal audit hierarchy, not numeric model weights:

- **A — objective or official:** official injury designation, official practice participation, official game activation, observed game usage, observed performance;
- **B — confirmed primary:** confirmed procedure information, direct medical statement;
- **C — direct narrative:** team announcement, player statement, coach statement;
- **D — credible reporting:** independent reporting;
- **E — expert inference:** medical/fantasy analyst interpretation;
- **F — unverified:** social-media speculation.

The hierarchy is **dimension-aware**. Official game activation is strong evidence that a player may participate; it is not proof of normal workload or prior performance. Observed snaps/routes are stronger evidence of workload than a coach saying a player is “good to go.”

No fixed numeric source weights are promoted in v0.

## Return stages

CCF recovery assessment explicitly distinguishes:

- `not_returned`
- `return_to_participation`
- `return_to_football`
- `return_to_expected_workload`
- `return_to_previous_performance`
- `uncertain`

Contract validation prevents stage collapse:

- participation-stage claims require participation evidence;
- return-to-football requires participation or workload evidence;
- expected-workload restoration requires workload evidence;
- previous-performance restoration requires **both workload and performance evidence**.

Therefore `active=true` cannot by itself validate “back to normal.”

Recovery assessments must be produced by a CCF-native derived/model producer and must share the exact frozen `asOf` of the evidence bundle. External/challenger producers cannot become recovery authority merely by emitting the same fields.

## Post-return updating doctrine

CCF should update recovery expectations iteratively as new eligible evidence arrives. The intended ordering is:

```text
new point-in-time evidence
  -> source/status/eligibility validation
  -> update the relevant recovery dimension only
  -> revise workload/performance/uncertainty features
  -> recompute CCF player outcome distribution
  -> recompute decision surface
  -> freeze recommendation + evidence snapshot
```

Important separations:

- full snaps + normal routes + normal high-value usage can increase confidence in workload restoration;
- active at 35% snaps cannot;
- full snaps with reduced high-demand/explosive usage can leave performance restoration uncertain;
- poor fantasy points on normal usage are noisy outcome evidence, not automatic proof of failed physical recovery;
- strong fantasy points on limited usage are not proof that restrictions disappeared.

Usage evidence and outcome variance must be modeled separately.

## Workload changes

v0 includes a deterministic workload-comparison helper that reports absolute and relative change between matched observed metrics.

It deliberately outputs `medicalCausalityClaimed: false`.

A jump from limited to near-full workload may become **uncertainty context** after empirical validation. CCF must not state that the workload change caused or will cause reinjury in an individual player.

No universal workload-spike threshold is hard-coded in v0.

## Position-specific interpretation

The same structural injury can matter differently because fantasy positions depend on different football actions. Candidate mechanisms include:

- **WR:** high-speed running, braking, cutting, separation, target depth, route participation;
- **RB:** acceleration/deceleration, repeated contact, yards after contact, cutting, pass protection, high-leverage touches;
- **QB:** plant/platform stability, rotational movement, scramble/designed-rush behavior, pressure avoidance;
- **TE:** receiving movement plus blocking/contact demands;
- **OL:** indirect effect on QB/RB environment;
- **Defense:** indirect effect on opposing offense and matchup quality.

These are hypotheses/features to validate, not hand-set penalties. Position-specific effects should be promoted only when sample size and chronological OOS evidence support them.

## Injury-specific priors

CCF must not use fixed rules such as `ACL = 9 months` or `Achilles = 11 months`.

If injury-class priors are eventually promoted, they should be distributions/ranges conditioned on eligible evidence such as procedure/treatment information, age, position, return stage, observed workload, and era where materially useful. Poor-sample injuries must preserve wide uncertainty or unknown state.

Famous recoveries are tail observations, not baseline setters. Negative returns and failed returns must remain in the training/evaluation population to reduce survivorship bias.

## Era effects

Historical injury evidence may differ materially across eras because procedure technique, tissue preservation, imaging, rehabilitation philosophy, strength/conditioning, return-to-sport testing, emergency medicine, and roster management change.

No era coefficient is added in v0. Add era conditioning only if historical-depth testing demonstrates material incremental value.

## Fantasy decision implications

### Start/Sit

Native CCF should eventually separate at least:

- probability of playing;
- expected snap/route/touch opportunity;
- expected efficiency/performance;
- ceiling;
- bust/near-zero risk;
- setback uncertainty.

These components belong in the player outcome distribution and decision policy, not in one injury penalty.

### Waivers

Recovery evidence can help distinguish temporary backup value, persistent role transfer, market overreaction to an injury label, and role restoration that is occurring faster/slower than consensus. No claim should outrun observed evidence.

### Trades / Dynasty

Separate current recovery discount from long-horizon athletic uncertainty, dynasty age interaction, and public-name/injury narrative bias. Current-week availability is not equivalent to long-term value.

### DFS / Beat Vegas

Recovery information may be tested as contextual evidence under existing CCF/market promotion rules. CCF must not imply access to inside medical data.

## Canonical Decision Packet integration

The frozen Canonical Decision Packet should eventually carry the materially relevant recovery evidence available at decision time, including:

- exact `asOf` / `knownAt`;
- raw evidence references and source classes;
- fact status and model treatment;
- distinct participation/workload/performance state;
- CCF-native derived recovery assessment when certified;
- explicit missing/uncertain dimensions;
- recheck requirements.

CCF, Gemini, Claude, Grok, or any other challenger must receive the same frozen packet. Challengers may identify missing evidence but must not mutate it during blind analysis.

## Validation plan

Use point-in-time chronological OOS data only.

Primary questions:

1. Does separating active status from workload readiness improve projection error and interval calibration?
2. Does practice progression predict snap/route restoration?
3. How quickly do usage and fantasy production normalize by injury class and position?
4. How often does first-game active status overstate role restoration?
5. Do workload/role indicators outperform generic time-since-injury?
6. Can the model distinguish return-to-play from return-to-performance more accurately than a one-tag injury heuristic?
7. Does explicit recovery uncertainty improve boom/bust and abstention calibration?
8. Does the model avoid overweighting spectacular comeback outliers?
9. Do position-specific recovery features add stable incremental value after controlling for role/opportunity?
10. Do treatment/procedure distinctions add value when they are reliably known?

Required comparisons should include:

- native CCF without recovery-derived features;
- CCF with eligible raw injury/participation evidence only;
- CCF with validated workload/performance recovery features;
- any candidate injury-specific/position-specific prior;
- legacy/TIBER/IRRIS outputs only as challengers, never as target truth.

Promotion requires calibration, subgroup stability, minimum sample support, leakage checks, and incremental decision value. Failed candidates remain in append-only history.

## Safety / epistemic boundary

FFCC is a fantasy-football decision system, not a diagnostic system.

CCF must never:

- diagnose an undisclosed injury;
- infer a hidden procedure or complication as fact;
- give individualized treatment advice;
- invent a reinjury probability because a player returned quickly;
- treat coach optimism, player confidence, or analyst speculation as equivalent to observed workload/performance;
- convert absence of evidence into “healthy.”

When materially relevant recovery evidence is insufficient, reduce confidence or abstain.

## v0 completion boundary

Implemented now:

- governed injury/recovery evidence contract;
- independent recovery dimensions;
- evidence status/treatment and source hierarchy;
- temporal/raw-trace/unavailable validation;
- native-only recovery-assessment authority;
- explicit return stages;
- active-status-vs-performance guardrail;
- non-causal workload-change comparison;
- focused regression tests;
- durable future work preserved in the canonical FFCC carry-forward queue.

Not implemented now:

- live injury/practice/procedure ingestion;
- medical diagnosis or private testing;
- fixed injury timelines or recurrence probabilities;
- hand-set injury penalties;
- production recovery model;
- Bayesian parameters fitted from history;
- position-specific recovery weights;
- procedure-specific priors;
- era coefficients;
- Canonical Decision Packet runtime binding;
- recommendation activation.

Those remain gated on source binding, historical point-in-time data, calibration, and CCF promotion evidence.
