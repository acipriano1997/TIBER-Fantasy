# CCF-First Intelligence Doctrine

**Status:** Proposed architecture authority for the Fantasy Football Command Center (CCF)

## Purpose

CCF owns the primary fantasy-football decision model. TIBER systems may remain useful evidence sources, benchmarks, priors, and challengers, but they must not be critical dependencies and must never silently determine a recommendation.

The architectural target is:

```text
source evidence
  -> CCF canonical evidence + temporal eligibility
  -> CCF feature construction
  -> CCF player outcome models
  -> CCF uncertainty + calibration
  -> CCF decision optimizers
  -> CCF recommendation + explanation

TIBER outputs
  -> external/challenger evidence channel
  -> disagreement / surprise / calibration analysis
  -> optional evidence in explanation
```

CCF must remain capable of producing a bounded, uncertainty-aware answer when every TIBER-derived model artifact is absent.

## Authority hierarchy

### CCF-owned primary authority

CCF owns:

- canonical fantasy decision state for the active league and scoring format;
- feature construction used by recommendations;
- weekly and rest-of-season player outcome distributions;
- role and opportunity inference;
- matchup and scheme interaction adjustments;
- injury/readiness adjustments;
- weather and game-environment adjustments;
- player value, replacement value, roster value, and decision utility;
- uncertainty, confidence, calibration, abstention, and tail-risk logic;
- draft, lineup, waiver, trade, keeper, dynasty, and devy decision logic;
- decision-time evidence freezing and post-outcome scoring.

### TIBER as external evidence

TIBER may contribute:

- model outputs as challenger signals;
- historical research artifacts;
- source-backed facts when their provenance remains intact;
- priors where CCF lacks sufficient native evidence;
- comparison outputs used to detect disagreement;
- benchmark performance for backtests.

TIBER must not:

- be required for CCF to emit a recommendation;
- provide an opaque feature that materially determines the recommendation;
- bypass CCF temporal/source eligibility rules;
- be blended into a consensus without explicit weighting and provenance;
- substitute for a missing CCF-native model indefinitely;
- silently widen or narrow confidence.

## Failure behavior

If a TIBER input is unavailable, stale, malformed, or ineligible, CCF must:

1. exclude it from primary inference;
2. continue using CCF-native evidence where coverage is sufficient;
3. widen uncertainty or abstain when native coverage is insufficient;
4. expose the missing external signal in provenance rather than fabricating a fallback value.

## No hidden consensus rule

CCF must not automatically average itself with TIBER, ECR, market projections, or other external models.

External disagreement is an input to investigation, not an instruction to converge.

When CCF differs materially from an external model, the system should surface:

- magnitude of disagreement;
- feature/mechanism differences where known;
- source recency differences;
- uncertainty overlap;
- historical reliability of each signal for the relevant position, season, and decision type.

## Independence invariant

A CCF recommendation is independent only when all recommendation-critical values can be regenerated from CCF-owned contracts and source evidence without importing a TIBER model output.

Source facts originally retrieved through a TIBER pipeline do not automatically violate independence if CCF stores the raw/source-backed fact with full provenance and can ingest the same class of evidence through a CCF-owned contract. A TIBER-produced inference, grade, projection, tier, or value does violate independence if it is required for the recommendation.

## Migration priority

Replacement work should proceed in this order:

1. native player outcome distribution;
2. native role/opportunity model;
3. native replacement/value layer;
4. native ROS model;
5. native rookie/devy translation model;
6. TIBER-off certification across all decision surfaces.

Do not recreate legacy engines merely for parity. Preserve useful mechanisms, but replace them with the strongest CCF-native formulation compatible with the certification and explainability architecture.

## Promotion rule

A decision surface may be labeled **CCF-primary** only after it passes the TIBER-off certification gate and demonstrates that TIBER removal does not cause a hidden fallback to another external projection source.

A TIBER signal may improve a CCF-primary recommendation after certification, but the system must preserve the independent CCF result and make the contribution inspectable.
