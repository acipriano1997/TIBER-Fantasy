# CCF Start/Sit Legacy Authority Audit

**Status:** Blocking audit for CCF-INDEP-001

## Verdict

The current Start/Sit path must be treated as a **legacy internal heuristic**, not as CCF-native model authority.

It can remain available for compatibility while the CCF Player Outcome Engine is built, but it must not be used to satisfy the TIBER-off certification simply because its code lives inside TIBER-Fantasy.

## Evidence from the current implementation

### 1. Projection authority is a hand-built EPA proxy

`server/modules/startSit/dataAssembler.ts` reads from `playerAdvanced2024` and creates `projPoints` through `mapEPAToProjection(epaPerPlay, position)`.

The mapping is a fixed bounded transformation:

- QB: EPA is mapped into a 12–28 point range;
- RB: EPA is mapped into an 8–22 point range;
- WR/TE: EPA is mapped into a 6–20 point range.

`projFloor` and `projCeiling` are produced by first scaling EPA by 0.7 and 1.3 and passing those values through the same fantasy-point proxy.

This is not a calibrated weekly player-outcome model and must not become the native CCF baseline.

**Classification:** `legacy_internal_heuristic` — recommendation-critical and blocked in `CCF_NATIVE`.

### 2. The profile uses a 2024 advanced-stat table as its player data base

Player resolution and EPA retrieval rely on `playerAdvanced2024`. The function's default season is also 2024.

That makes the current path unsuitable as a 2026 point-in-time weekly authority without a governed current-season evidence spine.

### 3. Several important recommendation inputs are explicitly unavailable

The assembler currently leaves these fields undefined or unavailable in the normal path:

- snap percentage;
- route participation;
- weighted touches;
- red-zone touches;
- implied team total;
- offensive-line health;
- weather impact;
- recent fantasy-point standard deviation;
- committee risk;
- depth-chart threats;
- news heat;
- ECR delta.

Missing evidence is therefore common rather than exceptional.

### 4. Missing data can be converted into plausible-looking scores

`server/modules/startSitEngine.ts` uses helpers that convert missing values through zero or neutral defaults.

Examples:

- missing projection -> zero before projection scaling;
- missing defense rank -> rank 16;
- missing implied total -> zero before the implied-total scaler;
- missing OASIS/OL inputs -> zero;
- missing weather impact -> zero, which maps to the midpoint of the weather scale;
- missing recent standard deviation -> zero, which maps to maximum stability/trust;
- no injury tag -> maximum injury trust;
- missing committee risk -> zero risk, which maps to maximum trust;
- missing depth-chart threats -> zero risk, which maps to maximum trust;
- missing ECR delta -> zero, which maps to the midpoint of the ECR subscore.

The most serious problem is not that defaults exist; it is that several unavailable risk inputs can become **positive trust evidence** instead of reducing coverage/confidence.

### 5. External consensus is embedded as a scoring input

The engine exposes `ecrDelta` as a weighted news/market input. Any active use of ECR in a native path must be classified `external_consensus` and therefore blocked from recommendation-critical `CCF_NATIVE` authority.

ECR can remain challenger evidence after the native result is frozen.

### 6. The final score is a fixed weighted heuristic

Default skill-position weighting gives projection approximately 45% of the score, then combines hand-set usage, matchup, volatility, and news weights. The engine also contains a separate Start Your Studs bias layer.

This can be useful product logic, but it is not a calibrated probability distribution and must not substitute for the native Player Outcome Engine.

## CCF migration treatment

Until replaced, classify the current path as follows:

| Current input / behavior | Producer family | Native eligibility |
| --- | --- | --- |
| EPA-to-fantasy projection proxy | `legacy_internal_heuristic` | blocked |
| fixed floor/ceiling proxy | `legacy_internal_heuristic` | blocked |
| hand-built matchup normalization | `legacy_internal_heuristic` unless rebuilt as a certified derived feature | blocked |
| ECR delta | `external_consensus` | challenger only |
| unavailable fields coerced through defaults | `unknown` / unavailable | blocked as critical evidence |
| current injury row | potentially `ccf_native_fact` only after temporal/source contract verification | pending |
| target share from governed source data | potentially `ccf_native_fact` | pending |
| Start Your Studs bias | `legacy_internal_heuristic` | blocked from native outcome authority; may later become explicit decision policy after validation |

## Required replacement behavior

The CCF replacement must:

1. compute a native outcome distribution before decision policy is applied;
2. preserve missingness and coverage explicitly;
3. never transform missing risk data into maximum trust;
4. use current, temporally eligible evidence;
5. carry producer-family provenance for critical features;
6. treat ECR/TIBER/external projections as post-native challenger evidence;
7. calibrate ranges and event probabilities against frozen historical outcomes;
8. allow downstream start/sit policy to consume the native distribution rather than manufacturing a projection itself.

## Promotion impact

This audit is a hard blocker against labeling the existing Start/Sit route `CCF_PRIMARY`.

The path may be retained during migration, but the CCF UI/API should eventually distinguish legacy/compatibility output from independently certified CCF-native output.
