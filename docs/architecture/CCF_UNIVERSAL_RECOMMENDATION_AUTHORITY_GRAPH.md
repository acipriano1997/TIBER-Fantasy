# CCF Universal Recommendation Authority Graph

**Status:** Architecture authority / promotion guardrail  
**As of:** 2026-09-11

## Purpose

Fantasy Football Command Center must be able to explain, mechanically and auditably, why every recommendation-critical value is allowed to influence an authoritative CCF decision.

The Universal Recommendation Authority Graph (URAG) is the required lineage model for every decision surface that may eventually claim `CCF_PRIMARY`.

A green UI, passing unit test, in-repository implementation, or sophisticated external model does not by itself grant recommendation authority.

## Canonical lineage

Every recommendation-critical path must be representable as:

```text
source evidence
  -> canonical evidence record
  -> temporal/source eligibility
  -> CCF-native derived feature
  -> CCF-native model state / outcome distribution
  -> explicit decision policy
  -> recommendation
```

External evidence follows a separate path:

```text
TIBER / expert / ECR / market / external projection / other model
  -> challenger evidence
  -> disagreement / mechanism comparison / calibration analysis
  -> explanation or investigation
```

External/challenger evidence must not silently cross into the primary path.

## Required authority fields

Every recommendation-critical edge or node must expose enough metadata to answer:

- `surface` — draft, lineup, waiver, trade, keeper, dynasty, devy, Beat Vegas, or another explicitly registered surface;
- `producer` — exact producing module/model/source;
- `producer_family` — one of the allowed authority families below;
- `evidence_kind` — fact, deterministic derivative, model inference, consensus, projection, policy, or unknown;
- `criticality` — recommendation-critical or challenger/context-only;
- `availability` — eligible, unavailable, stale, malformed, unsupported, or unknown;
- `as_of` and `known_at` — temporal eligibility boundary where applicable;
- `source/provenance reference` — reproducible trace to raw/source-backed evidence or native artifact;
- `model/calibration identity` — exact model and calibration version when inference is involved;
- `certification_state` — blocked, partial, certified, or non-authoritative;
- `fallback_behavior` — explicit behavior when the value is absent or ineligible.

## Producer-family authority

Only these producer families may satisfy recommendation-critical `CCF_NATIVE` authority:

- `ccf_native_fact`
- `ccf_native_derived`
- `ccf_native_model`
- `ccf_native_policy`

These families may be retained but cannot satisfy a native recommendation-critical edge:

- `tiber_model`
- `external_consensus`
- `external_projection`
- `market_challenger`
- `expert_challenger`
- `legacy_internal_heuristic`
- `challenger_only`
- `unknown`

A fact originally obtained through an external/TIBER transport may become eligible native evidence only when CCF preserves the source-backed fact through a CCF-owned evidence contract with complete provenance and temporal eligibility. External inferences, fitted weights, grades, ranks, probabilities, projections, or recommendation outputs do not become native merely because CCF stores them locally.

## Hard promotion invariant

A surface may claim `CCF_PRIMARY` only if all recommendation-critical paths are closed under allowed CCF-native producer families.

If any critical path contains a blocked, challenger-only, legacy, unknown, stale, unsupported, or temporally ineligible node, the surface must:

1. exclude that node from native inference;
2. continue with remaining sufficient native evidence and widen uncertainty where appropriate; or
3. abstain / expose unavailability when sufficient native coverage does not remain.

The system must never convert missingness into hidden neutral or maximum-trust evidence.

## External disagreement rule

TIBER, ECR, expert rankings, sportsbook markets, news-derived models, and other external systems are valuable because they can disagree with CCF.

The native CCF result must be frozen before challenger evidence is allowed to influence review or explanation. Material disagreement should trigger an investigation artifact containing, where available:

- magnitude of disagreement;
- differing assumptions/mechanisms;
- evidence freshness differences;
- uncertainty overlap;
- source coverage differences;
- historical reliability of the challenger for the relevant cohort;
- whether the disagreement identifies a missing CCF feature or merely reflects correlated consensus.

There is no automatic averaging-to-consensus rule.

## Surface coverage

URAG applies to every authoritative FFCC decision surface, including:

1. Draft
2. Weekly lineup / Start-Sit
3. Waivers / FAAB
4. Trades
5. Keeper
6. Dynasty
7. Devy
8. Beat Vegas / market-value decisions

Additional surfaces must register into the same authority system rather than create a parallel exception.

## Current migration interpretation

### Legacy Start/Sit

The current legacy Start/Sit engine is `legacy_internal_heuristic` and cannot satisfy native authority. Its 2024 EPA-derived projection proxy, hand-set weighting, and missing-value defaults remain compatibility/challenger behavior until replaced by the native CCF outcome distribution and explicit decision policy.

### TIBER-Forecast / IRRIS

Existing TIBER-Forecast injury/readiness inference is valuable research and challenger/reference implementation. It does not satisfy native CCF injury/readiness authority. CCF may mine mechanisms and compare outputs, but recommendation-critical injury/readiness inference must ultimately be independently sourced, fit, calibrated, and certified inside CCF.

### TIBER-Data evidence contracts

Source-backed TIBER-Data contracts may serve as transitional evidence transport where provenance and point-in-time semantics remain intact. They are not inference authority. CCF should own recommendation-critical derived features/modeling and should maintain an independently operable evidence path before universal promotion.

### Weather

Provider evidence, venue/roof facts, and deterministic geometry may be external/source-layer evidence. Provider reconciliation, weather-impact inference, player sensitivity, uncertainty effects, and recommendation consequences belong to CCF-native modeling before they may become critical.

### Markets / Beat Vegas

Markets remain challenger/validation evidence until frozen chronological tests show a specific derived market feature has incremental value and it is explicitly promoted through CCF governance. Cross-sport market information is a research hypothesis, not presumed useful evidence.

### Expert Signal Engine

Expert and ECR signals remain challenger-only. Reliability, echo/correlation, and rationale extraction may improve investigation, but external agreement must never substitute for native CCF evidence or increase confidence by default.

## Reconciliation / learning rule

Post-outcome learning must distinguish at least:

- `model_error`
- `evidence_error`
- `calibration_error`
- `decision_policy_error`
- `regime_change`
- `irreducible_variance`

A loss is not automatically evidence that the recommendation process was wrong. Randomness must be recorded rather than trained on as regret.

Changes to native models/policies should be supported by repeated or mechanistically credible evidence, frozen decision-time artifacts, and subsequent out-of-sample verification.

## Enforcement target

The 2026-09-14 implementation in `server/modules/ccf/independence/authorityGraph.ts` validates declared graphs for all eight registered surfaces (`beat_vegas` is the machine identifier). It validates runtime schema, fingerprints normalized lineage, traverses every root dependency regardless of criticality labels, and rejects missing/duplicate references, cycles, skipped stages, disconnected critical nodes, inadmissible producer families, and invalid provenance/time metadata.

The 2026-09-15 follow-up adds a separate trusted-binding prerequisite. Every
recommendation-critical node must match exactly one operator-controlled binding
for its graph, surface, stage, producer, producer family, evidence kind, and
provenance reference. Bindings have independent attestation/support windows,
revocation state, evidence references, and deterministic bundle fingerprints.
Changed producer text or provenance cannot be rescued by preserving a
caller-supplied `ccf_native_*` label. Missing, malformed, duplicate, ambiguous,
revoked, future-attested, expired, mismatched, and orphan bindings all fail
closed.

`CCF_TRUSTED_AUTHORITY_BINDINGS_V1` intentionally remains empty. Only reviewed
operator-owned code/config may populate it; request payloads and submitted
graphs are never trusted binding evidence.

A model must identify a matching, previously recorded certified release in the canonical CCF backtest progression ledger, including model/calibration versions, scoring profile, population, evidence references, and finite model/baseline errors. Missing or duplicate surface graphs block universal release. Fixture graphs and caller-supplied test history do not grant production authority. The evaluator always returns `recommendationAuthority: false`.

This is a structural release prerequisite, not complete production enforcement. The binding mechanism exists, but no production bindings are registered; binding evidence does not itself validate source contents or certification artifacts. Genuine source/runtime attestation, per-surface graph extraction, frozen production backtests, and route cutover remain OPEN. No model or predictive performance is certified by these graph tests.
