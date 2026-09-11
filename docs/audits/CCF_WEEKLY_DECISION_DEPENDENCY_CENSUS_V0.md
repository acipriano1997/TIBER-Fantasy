# CCF Weekly Decision Dependency Census v0

**Purpose:** First-pass inventory for CCF-INDEP-001. This document is intentionally conservative: anything not yet proven CCF-native remains unpromoted.

## Confirmed architectural dependencies from current repository documentation

| Capability | Current/legacy producer | Current role | CCF independence status | Required action |
|---|---|---|---|---|
| Weekly rankings | TIBER-Forecast preferred path with in-repo FORGE fallback | Produces ranking/scoring outputs | **BLOCKING** | Replace recommendation-critical projection/ranking authority with native CCF Player Outcome Engine |
| Player grading/ranking | FORGE | Central Alpha grading/ranking in legacy architecture | **BLOCKING** where consumed critically | Keep only as challenger/benchmark after native feature/output path exists |
| Rookie context | TIBER-Rookies promoted Rookie Alpha | Additive fallback in Management | **BLOCKING** only for any surface claiming native rookie valuation | Preserve as external evidence until CCF rookie/devy model is independently certified |
| Canonical data/identity | TIBER-Data | Contract/source authority | **TRANSITIONAL** | CCF may consume source-backed facts, but recommendation-critical features must be represented through CCF-owned evidence contracts and provenance |
| Start/Sit | in-repo Start/Sit engine | Recommendation layer | **UNCERTIFIED** | Current EPA-projection proxy and missing-value heuristics are legacy internal heuristics; replace with native outcome distribution |
| Schedule/matchup context | in-repo SoS/matchup services | Context layer | **POTENTIALLY NATIVE** | Verify producer provenance and remove placeholder/default behavior that creates false certainty |
| Role banks / derived data | in-repo Data Lab role banks | Feature/data layer | **POTENTIALLY NATIVE** | Verify source lineage and temporal eligibility; retain only if reproducible from source-backed evidence |
| External models adapter layer | `server/modules/externalModels/**` | Adapter/orchestration boundary | **KEEP** | Reclassify TIBER model outputs passing through this boundary as challenger-only by default |
| Sentinel | in-repo validation/guardrail layer | Validation | **KEEP** | Extend to police CCF_NATIVE producer-family assertions |

## Producer-family policy for the implementation census

Every recommendation-critical value must be tagged as exactly one of:

- `ccf_native_fact`
- `ccf_native_derived`
- `ccf_native_model`
- `legacy_internal_heuristic`
- `tiber_model`
- `external_consensus`
- `external_projection`
- `challenger_only`
- `unknown`

`CCF_NATIVE` may depend only on the first three families. Code location does not determine authority: an in-repo heuristic remains blocked until it is explicitly rebuilt or certified as a CCF-native producer. Unclassified critical inputs are `unknown` and fail closed.

## Known high-risk hidden-fallback zones

The implementation audit must inspect these first:

1. weekly rankings path that prefers TIBER-Forecast and retains FORGE compatibility;
2. start/sit orchestration and route-level recommendation logic, including the 2024 EPA-to-projection proxy and missing-value defaults;
3. PlayerCompass / OVR / dynasty heuristic remnants if any output leaks into active recommendation paths;
4. external-model adapters that may normalize a missing TIBER output into a plausible-looking value;
5. ECR/consensus fields used as defaults rather than explicit challenger evidence;
6. matchup/environment services with neutral placeholder values;
7. rookie fallback paths that may treat Rookie Alpha as if it were native valuation coverage.

## Certification blockers already established

The following statements are enough to prevent an immediate `CCF_PRIMARY` claim today:

- current weekly rankings documentation explicitly prefers TIBER-Forecast when configured and sufficiently covered;
- FORGE remains a recommendation-relevant grading/ranking system in the current architecture;
- the current Management surface treats FORGE coverage as meaningful model coverage;
- promoted Rookie Alpha is still the owned upstream rookie model artifact;
- the legacy Start/Sit path manufactures projection/floor/ceiling values from a fixed EPA mapping and converts several unavailable risk inputs into neutral or positive trust;
- no production native CCF weekly outcome distribution is yet the recommendation authority.

Therefore the current state is **UNCERTIFIED / dependency-present**, not CCF-primary.

## Machine-readable census now established

The initial code-level census lives at:

`server/modules/ccf/independence/weeklyDependencyCensus.ts`

It records, for active weekly/start-sit mechanisms:

- surface;
- field or mechanism;
- producing path;
- producer family;
- recommendation-critical flag;
- native eligibility status;
- fallback behavior;
- replacement owner;
- explanatory note.

`canClaimCCFPrimary()` fails while any critical record remains blocked, challenger-only, or pending verification. This census is the initial test oracle for CCF-INDEP-001 and should become progressively more complete as implementation paths are audited.
