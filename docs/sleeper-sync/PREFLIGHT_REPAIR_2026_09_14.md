# Sleeper preflight repair — 2026-09-14

The [PR #24 job](https://github.com/acipriano1997/TIBER-Fantasy/actions/runs/34547581258/job/103103437964) on head `41250c289c0cacce4f7b516950edeff6ef9d0609` reached the mounted live route successfully, then failed with `jq: Cannot index array with string "data"`.

The expression `(.data.leagues | length == .data.count)` changed jq's input to the array before resolving the count. Parenthesizing only the length expression fixes the comparison. The same script now avoids `mapfile` and `head -n -1`, which are unavailable in stock macOS tools.

Seven synthetic transport tests execute the real shell script and jq filters. They prove valid and mixed portfolios reach the negative-query checks, while all-RED portfolios, inconsistent counts/authority, bad provenance, and upstream/error-contract violations fail. Synthetic responses are test fixtures, never live certification evidence.

The historical response contained 52 leagues, all RED against `tiber_forecast_xfpg_ppr_v1`. This is a separate scoring-coverage blocker that the repaired script will expose; it is not permission to widen the registry or lower the green-league requirement. The live response is historical evidence, not a claim about the present portfolio.

Legacy Forecast compatibility does not confer CCF-primary recommendation authority. Native CCF scoring/model/runtime and chronological certification remain separately required.

Validation: seven shell tests passed; the complete Sleeper/health regression group passed 8 suites / 54 tests and existing coverage gates; `sh build.sh` and `git diff --check` passed. No runtime scoring or recommendation behavior changed.
