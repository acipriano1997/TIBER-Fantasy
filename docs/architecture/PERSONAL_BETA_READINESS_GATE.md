# FFCC Personal Beta Readiness Gate

Status: ACTIVE
Owner: CCF / Command Center
Scope: minimum trustworthy personal-beta weekly use; not full roadmap completion

## Principle
FFCC may enter personal beta when Anthony can load his real leagues, receive CCF-native recommendations or explicit abstentions from exact league context, inspect the evidence/provenance, and safely preview/execute authorized platform actions without silent fallback to stale, synthetic, legacy, or challenger authority.

The beta gate is intentionally narrower than full product completion. Research surfaces and long-tail feature families do not block weekly use unless they become recommendation-critical.

## Launch-critical gates

### PB-01 — Production-native weekly data spine
PASS only when every recommendation-critical native feature used by the weekly surface is backed by a source binding that passes intended-use permission, parser/version identity, raw traceability, point-in-time semantics, identity joins, coverage/correction review, and reliability qualification. Evaluation-only, conflicted, unreviewed, research-only, stale, or future-known sources cannot satisfy this gate.

### PB-02 — Frozen historical CCF evaluation dataset
PASS only when a player × game × decision-as-of dataset is frozen with source/model/scoring identity and exact known-at semantics sufficient for production-candidate CCF evaluation. Current/final snapshots cannot be silently backdated into historical decision truth.

### PB-03 — Executable native CCF certification
PASS only when CCF Baseline 1.0 is frozen before final-holdout access and an executable rolling-origin evaluation has produced an immutable receipt covering at minimum: native baseline comparisons, TIBER-off replay, leakage controls, negative controls, calibration/distribution quality, rank quality, selective-prediction risk/coverage, feasible-lineup regret, subgroup stability, and preregistered promotion thresholds.

Architecture and test scaffolding alone are not a pass. A real frozen run is required.

### PB-04 — Recommendation authority cutover
PASS only when the weekly recommendation surface can prove its path through the Universal Recommendation Authority Graph and cannot be unlocked by legacy Start/Sit, TIBER, market, expert, ECR, or other challenger evidence. Missing critical native evidence must yield `UNCERTIFIED` or abstention rather than a synthetic recommendation.

### PB-05 — Real Sleeper portfolio preflight
PASS only after the live portfolio is resolved through immutable Sleeper identity and exact league/scoring/roster/matchup truth for Anthony's real account, with unsupported leagues remaining visibly locked. Route existence or fixture success does not count as production proof.

Sleeper permission/licensing is an external dependency; internal work must continue while it is pending.

### PB-06 — Guarded Sleeper actions
If write access is authorized, every action must require explicit user approval, pre-action legality/lock validation, deterministic/idempotent request identity, fail-closed handling for ambiguity or stale state, and post-action readback/verification. No autonomous action loop is required for personal beta.

### PB-07 — Devy identity linkage
The private Devy workbook and Sleeper league must be linked through governed canonical player/roster identity. Unresolved players remain explicit; fuzzy guessing cannot create authoritative ownership or roster state.

### PB-08 — Integration and smoke certification
The exact deployed candidate must complete a real personal-beta smoke path:

`league load -> exact context -> canonical decision packet -> CCF native recommendation or abstention -> explanation/provenance -> action preview -> authorized action/readback when available`

Capabilities that live only on unmerged/open branches must not be described as production behavior.

## Explicitly non-blocking for personal beta

- Beat Vegas / DFS production recommendation authority
- full Market Perception Intelligence provider ingestion
- every Expert Signal Engine source
- all contract-league transaction families and long-tail policy mechanics
- every Uncertainty State Registry situation family
- broad public/multi-user deployment hardening
- Chrome Web Store publication of the ESPN draft bridge
- cosmetic/presentation polish that does not affect truth, legality, provenance, or decision safety

## Current blocker classes

1. **Internal and actionable now**: production source qualification, frozen historical dataset, first native CCF certification run, authority cutover plumbing, branch integration, Devy live identity validation, personal-beta smoke harness.
2. **External but preparable now**: Sleeper permission/write access. All action contracts, validation, idempotency, and readback logic should be ready before approval lands.
3. **Post-beta expansion**: research and breadth work listed above.

## Promotion rule

Do not call FFCC `personal-beta ready` until every PB-01 through PB-08 gate that applies to the user's active weekly surface is green on one exact candidate. Record unavailable external gates explicitly rather than weakening them.
