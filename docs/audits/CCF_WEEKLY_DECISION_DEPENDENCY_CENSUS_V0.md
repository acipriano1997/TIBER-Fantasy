# CCF Weekly Decision Dependency Census v0

**Purpose:** First-pass inventory for CCF-INDEP-001. This document is intentionally conservative: anything not yet proven CCF-native remains unpromoted.

## Confirmed architectural dependencies from current repository documentation

| Capability | Current/legacy producer | Current role | CCF independence status | Required action |
|---|---|---|---|---|
| Weekly rankings | TIBER-Forecast preferred path with in-repo FORGE fallback | Produces ranking/scoring outputs | **BLOCKING** | Replace recommendation-critical projection/ranking authority with native CCF Player Outcome Engine |
| Player grading/ranking | FORGE | Central Alpha grading/ranking in legacy architecture | **BLOCKING** where consumed critically | Keep only as challenger/benchmark after native feature/output path exists |
| Rookie context | TIBER-Rookies promoted Rookie Alpha | Additive fallback in Management | **BLOCKING** only for any surface claiming native rookie valuation | Preserve as external evidence until CCF rookie/devy model is independently certified |
| Canonical data/identity | TIBER-Data | Contract/source authority | **TRANSITIONAL** | CCF may consume source-backed facts, but recommendation-critical features must be represented through CCF-owned evidence contracts and provenance |
| Start/Sit | in-repo Start/Sit engine | Recommendation layer | **UNCERTIFIED** | Audit every input and producer; remove hidden dependence on FORGE/Forecast/external consensus for CCF_NATIVE mode |
| Schedule/matchup context | in-repo SoS/matchup services | Context layer | **POTENTIALLY NATIVE** | Verify producer provenance and remove placeholder/default behavior that creates false certainty |
| Role banks / derived data | in-repo Data Lab role banks | Feature/data layer | **POTENTIALLY NATIVE** | Verify source lineage and temporal eligibility; retain only if reproducible from source-backed evidence |
| External models adapter layer | `server/modules/externalModels/**` | Adapter/orchestration boundary | **KEEP** | Reclassify TIBER model outputs passing through this boundary as challenger-only by default |
| Sentinel | in-repo validation/guardrail layer | Validation | **KEEP** | Extend to police CCF_NATIVE producer-family assertions |

## Producer-family policy for the implementation census

Every recommendation-critical value must be tagged as exactly one of:

- `ccf_native_fact`
- `ccf_native_derived`
- `ccf_native_model`
- `tiber_model`
- `external_consensus`
- `external_projection`
- `challenger_only`

`CCF_NATIVE` may depend only on the first three families.

## Known high-risk hidden-fallback zones

The implementation audit must inspect these first:

1. weekly rankings path that prefers TIBER-Forecast and retains FORGE compatibility;
2. start/sit orchestration and route-level recommendation logic;
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
- no native CCF weekly outcome distribution contract was previously the recommendation authority.

Therefore the current state is **UNCERTIFIED / dependency-present**, not CCF-primary.

## Next census artifact

The code-level census must replace this architectural inventory with a machine-readable graph containing, for each active weekly/start-sit output:

- output field;
- producing function/module;
- upstream input fields;
- producer family;
- evidence/provenance contract;
- temporal eligibility rule;
- fallback behavior;
- critical/noncritical flag;
- CCF_NATIVE eligibility;
- replacement owner if blocked.

That graph becomes the test oracle for CCF-INDEP-001 hidden-dependency assertions.
