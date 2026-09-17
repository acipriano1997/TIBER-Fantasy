# CCF Team Passing Intent — Held Prework v1

Status: **PREWORK / no runtime activation**

This companion contract closes the ambiguity around neutral pass rate inside the broader Coaching & Scheme Context work. It does not change projections, rankings, lineup decisions, recommendation weights, source authority, or deployment behavior.

## Existing upstream reality

TIBER-Teamstate already exposes `neutral_pass_rate` in `team_environment_forecast_features_v1` as a pre-cutoff numeric team-environment feature eligible for model use. Therefore CCF should consume that governed field when it is promoted rather than re-derive or duplicate it in TIBER-Fantasy.

The missing semantic piece is a fuller **PASS_RUN_TENDENCY** family that distinguishes descriptive neutral passing behavior from situation-adjusted passing aggressiveness.

## Canonical distinctions

### Neutral pass rate

Observed share of qualifying neutral-script offensive plays that are passing plays.

It answers: **What did this offense actually do in neutral game states?**

Required denominator/provenance must travel with the observation. Zero is a real value; missing evidence is `null`/unavailable, never silently zero.

### PROE

Pass Rate Over Expectation is a situation-adjusted residual: observed passing tendency relative to an expected pass probability conditioned on the underlying play situation and the upstream methodology used by the governed producer.

It answers: **How pass-aggressive was this offense relative to what the situation would normally imply?**

PROE must never be approximated by subtracting a fixed league pass-rate constant from neutral pass rate. It requires its own governed expected-pass model/methodology, provenance, versioning, and point-in-time availability.

### Early-down / first-down pass rate

These are supporting descriptive tendency signals. They may improve stability or explain mechanism, but they belong to the same correlated latent family unless walk-forward ablation demonstrates independent incremental value.

## Causal placement

The intended primary pathway is:

```text
PASS_RUN_TENDENCY evidence
→ posterior team passing intent
→ expected team dropbacks / designed-pass opportunities
→ player routes and target opportunities conditional on role
→ player outcome distribution
```

Do not then apply a second generic "pass-heavy offense" fantasy bonus to QB/WR/TE projections. That would double-count the same mechanism.

The same rule applies to neutral pass rate + PROE + early-down pass rate: they are evidence about a shared tendency, not additive independent boosts.

## Regime handling

Passing intent is regime-aware. The future upstream producer should identify the active play-calling regime where governed evidence allows it.

A meaningful HC/OC/play-caller change may trigger a full or partial prior reset. Historical tendencies may contribute only as shrinkage priors when decision-maker, scheme, personnel, and role context remain sufficiently comparable. Current-regime evidence should increasingly dominate as sample size grows.

Unknown regime identity widens uncertainty; it does not justify inventing continuity.

## Point-in-time contract

Any passing-intent evidence eligible for eventual activation must preserve at minimum:

- team identity;
- season and as-of week/event cutoff;
- `known_at` no later than recommendation cutoff;
- source/provenance reference;
- regime identifier when known;
- metric methodology/version where relevant;
- neutral-play exposure denominator for neutral pass rate;
- explicit missingness;
- uncertainty/confidence state.

Historical replay must reject any observation whose `known_at` occurs after the forecast cutoff.

## Current implementation seam

`server/prework_teamPassingIntentV1.ts` provides an inert, fail-closed downstream contract with:

- separate `neutralPassRate` and `proe` fields and semantics;
- optional early-down and first-down pass rates;
- neutral-play denominator;
- point-in-time leakage rejection;
- explicit `complete | partial | unavailable` coverage;
- `PASS_RUN_TENDENCY` latent-family ownership;
- a hard declaration that direct-player fantasy bonuses and additive metric stacking are not allowed.

The companion test proves null-vs-zero preservation, neutral-pass-rate/PROE separation, anti-double-counting semantics, unavailable-state behavior, range validation, denominator validation, and future-known evidence rejection.

## Activation gates

No passing-intent signal should influence live CCF recommendations until all of the following are true:

1. Upstream Teamstate/TIBER-Data evidence is governed and point-in-time eligible.
2. PROE, if used, has an explicit expected-pass methodology and versioned provenance rather than an inferred proxy.
3. Regime/reset semantics are deterministic and testable.
4. CCF consumes the family through expected team dropback/opportunity generation rather than a direct player multiplier.
5. Walk-forward ablation shows repeatable incremental value beyond existing pace, role, and game-environment features.
6. Calibration and low-sample/new-regime slices remain acceptable.
7. Double-counting tests show that correlated passing-tendency metrics and realized routes/targets are not independently credited for the same mechanism.
8. A separate authorized activation decision is made.

Until then this remains held prework.

## Hard guardrails

- CCF remains the sole recommendation authority.
- TIBER-Fantasy does not fabricate upstream team-state truth.
- Missing evidence remains unknown/null, never zero.
- No runtime source may import or re-export this held-prework module.
- No fantasy projection, recommendation, lineup, waiver, trade, or deployment behavior changes here.
- Football Unwritten remains strictly separate.
