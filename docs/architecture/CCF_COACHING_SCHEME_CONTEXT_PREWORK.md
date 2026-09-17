# CCF Coaching & Scheme Context — Held Prework

Status: **PREWORK / no runtime activation**  
Prepared from Anthony's live 2026-09-16 instruction to model coaching situations as directional positive/negative fantasy context.  
Base: `main` at `369ee88933b55c22bfaa975affe30a87c1062203`.

## Purpose

Define the consumer/integration contract for coaching and scheme context before any coaching-derived signal can affect CCF recommendations.

The intended causal form is:

```text
observed coaching/team behavior
→ mechanism
→ affected opportunity/role/environment feature
→ player-archetype directional effect
→ forecast/recommendation uncertainty
```

The prohibited shortcut is:

```text
coach reputation → generic fantasy bonus/penalty
```

There is no universal `coach_score` in this design.

## System ownership

This document records TIBER-Fantasy consumer requirements. It does not move upstream authority into this repository.

- **TIBER-Data** owns governed source/provenance truth, canonical identities, timestamps, event boundaries, source-backed play-caller history, and observed/derived football facts.
- **TIBER-Teamstate** owns team-level interpretation: pace, pass tendency/PROE, play-calling environment, personnel environment, red-zone tendency, stability/volatility, game-script response, drive-extension behavior, and coaching-regime change context.
- **Role & Opportunity** owns realized player deployment/opportunity: snaps, routes, rush/target share, alignment when governed, goal-line/two-minute work, replacement behavior, and player-level role changes.
- **TIBER-Forecast / CCF** translates governed team + role context into player outcome distributions, propagates uncertainty, and remains recommendation authority.
- **TIBER-Fantasy** orchestrates/explains promoted outputs and must fail closed rather than inventing missing coaching facts.

Current Teamstate doctrine already places pace, pass tendency, play-calling environment, red-zone tendency, stability, and volatility in Teamstate once upstream evidence is governed. Preserve that boundary.

## Coaching mechanism families

### 1. Play-caller regime

Track the actual decision-making regime rather than attaching all behavior to the head coach.

Potential fields:

- head coach identity
- offensive coordinator identity
- primary play-caller identity
- play-caller change week/timestamp
- continuity vs new regime
- within-season play-caller transfer/delegation
- tenure/sample size under the current regime

Historical priors should attach to the caller/regime only where role, personnel, and surrounding scheme remain sufficiently comparable.

### 2. Pace / tempo

Candidate observed/derived inputs:

- situation-neutral seconds per snap
- no-huddle rate where source-backed
- expected offensive plays
- pace by score/game-state bucket
- opponent pace interaction
- possession/drive context

Fast pace can increase total opportunity for both offenses. Slow pace can suppress opponent and game-wide opportunity. The player effect is conditional on role participation; pace is not universally positive.

### 3. Neutral pass/run philosophy

Candidate inputs:

- PROE / neutral pass rate
- early-down pass rate
- shotgun/under-center tendency when governed
- play-action/RPO tendency when governed
- downfield vs quick-game tendency when source-backed

These metrics belong to one correlated latent family unless evidence demonstrates separable incremental value.

### 4. Personnel and formation environment

Candidate inputs:

- 11 / 12 / 13 / 21 personnel usage
- multi-TE / multi-back usage
- condensed/bunch/motion usage only when governed

Translation must be role-specific. Example: increased 12-personnel usage can raise TE participation opportunity while reducing third-WR route opportunity. It is not a universal team boost.

### 5. Opportunity allocation philosophy

Team-level allocation traits may describe:

- RB workhorse vs committee behavior
- early-down / two-minute / goal-line specialization
- target concentration vs distribution
- rotation depth
- injury replacement: one-for-one inheritance vs role redistribution
- rookie/young-player deployment progression
- mistake/fumble/protection-assignment consequences only when evidence is sufficient

Realized player deployment remains Role & Opportunity truth. Teamstate may describe the team-level regime that helps project forward when player evidence is incomplete or a role is changing.

### 6. Red-zone / goal-line philosophy

Candidate inputs:

- rush/pass tendency by field zone
- QB goal-line carry involvement
- TE/WR/RB target/carry concentration near goal line
- condensed-formation tendency if governed

Do not apply a separate red-zone coaching boost if realized player goal-line opportunity already captures the same mechanism.

### 7. Fourth-down / drive-extension behavior

Candidate inputs:

- situation-adjusted go-for-it rate
- expected drive continuation
- expected additional offensive plays / scoring opportunities

Do not create a raw "aggressiveness bonus." Reconcile this family with realized play volume so additional opportunity is counted once.

### 8. Game-script response

Model behavior conditional on game state:

- leading
- tied / neutral
- trailing

Relevant effects include run/pass shift, tempo shift, no-huddle activation, target concentration, and whether an offense continues attacking with a lead.

### 9. Protection / offensive-line response

Where source-backed, capture coaching responses to protection stress:

- extra protectors
- chip help
- quick-game rate
- screens
- pocket movement

Downstream effects should pass through explicit mechanisms such as route-count, target-depth, or role changes rather than narrative tags.

### 10. Adaptation

Capture persistent or repeated tactical adjustments without inventing a subjective "coach IQ" score.

Possible signals:

- changes after sustained pressure problems
- changes after injuries/personnel loss
- multi-week role or concept reallocation
- repeated departure from prior tendencies in a coherent new regime

One-game tactical reactions should not automatically become durable priors.

## Evidence hierarchy

### Class A — observed behavior

Play-by-play, personnel, deployment, drive, and other source-backed observations with explicit provenance and timestamp.

### Class B — deterministic derived tendency

Aggregates calculated from Class A evidence with explicit denominators and methodology.

### Class C — declared intent

Press conferences, team statements, beat reporting, depth-chart discussion, and similar statements. These are weak priors unless confirmed by behavior.

### Class D — external analysis

Expert/public analysis may serve as secondary evidence, benchmark, or challenger.

### Class E — speculation

Never an authoritative numeric input.

Coach-speak has **no direct numeric weight by default**. If retained for context, it must be clearly qualitative/low-confidence and require behavioral confirmation before promotion.

## Bayesian / regime-update doctrine

For each coaching/team feature:

1. Start with a neutral or hierarchical prior appropriate to caller/team/season context.
2. Historical caller tendencies contribute only when the decision-maker and surrounding context are reasonably comparable.
3. Offseason reports may weakly nudge priors but cannot override observed play.
4. Current-season observations update the posterior with shrinkage proportional to sample size and feature stability.
5. A true play-caller/regime change triggers a reset or partial reset instead of blindly carrying prior team tendencies forward.
6. Posterior variance travels with the feature.
7. Repeated current-regime evidence eventually dominates the historical prior.

A coach name alone is not a sufficient stable key when play-calling authority, personnel, or scheme materially changes.

## Latent families / anti-double-counting

Every activated feature must declare a latent family and downstream owner.

Minimum families:

- `PACE_VOLUME`
- `PASS_RUN_TENDENCY`
- `PERSONNEL_DEPLOYMENT`
- `TARGET_TOUCH_CONCENTRATION`
- `RED_ZONE_ALLOCATION`
- `DRIVE_EXTENSION`
- `GAME_SCRIPT_RESPONSE`
- `PROTECTION_ADAPTATION`
- `ROLE_REPLACEMENT`
- `REGIME_CHANGE`

Correlated observations must be pooled/shrunk before forecast use.

Examples:

- no-huddle + seconds/snap + plays/game are not three independent pace bonuses;
- PROE + neutral pass rate + early-down pass rate are related evidence, not additive independent bonuses;
- 12-personnel usage and TE route growth should not both be fully credited when the route growth is the realized downstream mechanism;
- fourth-down attempts and extra plays should not both receive full credit when the latter is caused by the former.

Prefer fresh/reliable realized player deployment over upstream coaching inference. Coaching/team tendencies are most useful for projecting forward, handling regime changes, filling uncertainty, and modeling counterfactual game states.

## Point-in-time / freshness contract

Every usable coaching observation must carry or inherit:

- `season`
- `week` or event timestamp
- `known_at`
- `source_snapshot_at`
- source/provenance reference
- play-caller/regime identifier
- sample size / exposure denominator
- freshness state
- uncertainty / posterior variance

Historical recommendation replay must fail if future-week or post-cutoff information leaks into the feature state.

## Player translation

Context is translated through player role/archetype, never uniformly across the offense.

### Example: faster neutral pace

```text
neutral pace ↑
→ expected team plays ↑
→ absolute opportunities ↑
→ largest benefit to high-participation players
→ weak benefit to low-route rotational players
```

### Example: increased 12 personnel

```text
12 personnel ↑
→ TE participation opportunity ↑ / WR3 participation opportunity ↓
→ actual effect conditional on each player's route/snap role
```

### Example: committee RB regime

```text
committee tendency ↑
→ individual touch ceiling ↓
→ receiving/game-script insulation depends on role split
→ uncertainty can rise even when team rushing volume is healthy
```

### Example: fourth-down aggressiveness

```text
situation-adjusted go-for-it tendency ↑
→ expected drive continuation ↑
→ modest team opportunity effect
→ reconcile with realized plays/drives before forecast use
```

## Producer contract concept

Do not emit a single `coach_score`.

A future upstream context packet should resemble:

```json
{
  "team": "XXX",
  "season": 2026,
  "as_of_week": 3,
  "regime_id": "example-regime-id",
  "play_caller": {
    "id": "example-id",
    "status": "observed"
  },
  "features": [
    {
      "family": "PACE_VOLUME",
      "metric": "neutral_seconds_per_snap",
      "estimate": 0,
      "uncertainty": 0,
      "sample_size": 0,
      "direction_vs_prior": "neutral",
      "source_status": "unknown",
      "known_at": "2026-09-16T00:00:00Z",
      "source_refs": []
    }
  ],
  "warnings": [],
  "coverage": {}
}
```

This is illustrative consumer prework only. Exact versioned schema belongs to the producing repository and requires its own contract/review authority.

## Backtesting / calibration gates before activation

No coaching-derived family may influence CCF recommendation authority until point-in-time evaluation passes.

Required gates:

1. **Walk-forward only** — reconstruct historical weeks using only evidence available at the recommendation cutoff.
2. **Baseline ablation** — baseline CCF vs baseline + coaching context; measure incremental value.
3. **Family-level ablation** — evaluate pace, pass/run, personnel, red-zone, drive-extension, replacement, and other families separately.
4. **Regime-change slice** — separately evaluate new HC/OC/play-caller and midseason play-caller changes.
5. **Position/archetype slices** — QB, RB, WR, TE and relevant role archetypes.
6. **Distribution calibration** — interval coverage / probabilistic calibration, not just point-error metrics.
7. **Decision quality** — lineup/waiver/trade metrics where appropriate, not fantasy-point MAE alone.
8. **Leakage tests** — future coach changes, end-of-season aggregates, postgame depth-chart resolution, and retrospective narrative labels must fail closed.
9. **Double-counting tests** — correlated family inputs cannot create duplicated lift.
10. **Low-sample robustness** — Weeks 1-3 and new regimes use stronger shrinkage / wider uncertainty.
11. **Negative control** — shuffled or irrelevant coach labels must not create apparent lift.
12. **Challenger comparison** — external/expert coaching narratives may be challengers, never silent authority.

Activation requires material, repeatable incremental value with acceptable calibration and no leakage. If a family does not clear that bar, retain it as explanatory context only.

## Current implementation posture

### Safe now

- keep this contract as held prework;
- inventory existing TIBER-Data and Teamstate fields against the mechanism families;
- define deterministic regime-change/reset semantics;
- define synthetic/governed fixture expectations;
- prepare fail-closed adapters for future promoted inputs;
- prepare backtest interfaces without recommendation-weight activation.

### Blocked / future

- sourcing a coaching tendency that is not currently governed upstream;
- treating operator-seeded Teamstate values as production truth;
- enabling coaching-derived recommendation deltas;
- assigning numeric effect sizes before walk-forward evidence exists;
- using current-season coach-speak as authoritative numeric input;
- using proprietary route/alignment claims without governed source rights.

## Promotion criteria

This prework may move toward runtime influence only when:

- upstream source ownership exists for each activated field;
- Teamstate exposes regime-aware point-in-time context with provenance and explicit unknown states;
- Role & Opportunity ownership remains cleanly separated from team interpretation;
- latent-family de-duplication is tested;
- regime reset semantics are tested;
- CCF walk-forward ablations demonstrate incremental value;
- uncertainty is propagated into player distributions;
- explanations trace `observation → mechanism → feature → player effect`;
- no generic coach score exists;
- a separate authorized decision activates any recommendation impact.

## Hard guardrails

- CCF-first recommendation authority remains unchanged.
- No TIBER/expert/market source silently determines a recommendation.
- Missing evidence is `unknown`, never zero.
- Preserve frozen `as_of` / `known_at` discipline and immutable replay.
- Preserve fail-closed source and readiness behavior.
- Preserve Football Unwritten separation.
- This file is documentation/prework only and does not activate runtime behavior.

## Authority / materialization note

This document was prepared by ChatGPT from Anthony's live instruction. It records bounded R1 preparation and does not independently prove human-origin authority for any consequential transition, merge, production activation, deployment, or scope expansion.
