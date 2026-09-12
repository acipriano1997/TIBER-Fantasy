# CCF TIBER-Off Certification

**Gate:** CCF-INDEP-001

## Objective

Prove that a Fantasy Football Command Center decision surface remains functional, provenance-complete, uncertainty-aware, and non-deceptive when all TIBER-derived model outputs are unavailable.

Passing this gate is required before a surface may claim **CCF-primary** authority.

## Test modes

Run the same frozen decision fixtures in four modes:

1. **CCF_NATIVE** — CCF native evidence and models only; all TIBER inference/model outputs disabled.
2. **TIBER_CHALLENGER** — CCF primary result plus eligible TIBER signals attached only as challenger evidence.
3. **EXTERNAL_BASELINE** — external/ECR/market baseline for comparison; never used as a fallback for CCF_NATIVE.
4. **FULL_EVIDENCE** — CCF plus all eligible optional external evidence.

The certification decision is based primarily on CCF_NATIVE. Other modes quantify incremental value and detect hidden dependencies.

## Hard pass criteria

For every certified decision surface:

- disabling TIBER does not cause an exception, empty result, zero-filled projection, or hidden substitution of another external projection;
- every recommendation-critical value identifies a CCF-owned producer or a source-backed fact contract;
- no TIBER grade, projection, tier, value, probability, or derived feature is required to produce the native result;
- no legacy in-repo heuristic or unclassified producer is treated as native authority merely because it is locally available;
- temporal eligibility remains frozen at `known_at <= as_of`;
- missing native evidence widens uncertainty or produces an explicit abstention rather than fabricated precision;
- recommendation ordering is deterministic for an identical frozen fixture and model version;
- explanations identify the mechanisms that materially moved the native result;
- optional TIBER challenger evidence is separately labeled and can be removed without changing the stored native result;
- post-outcome scoring can evaluate both the CCF-native result and the challenger result independently.

Any violation is a certification failure.

## Hidden-dependency checks

Instrumentation must record the producer family for every recommendation-critical input.

The only producer families eligible to influence a `CCF_NATIVE` result are:

- `ccf_native_fact`
- `ccf_native_derived`
- `ccf_native_model`

The run fails if any recommendation-critical native result depends on a producer classified as:

- `legacy_internal_heuristic`
- `tiber_model`
- `external_consensus`
- `external_projection`
- `challenger_only`
- `unknown`

Older aliases such as TIBER grade/projection/value families must be normalized to `tiber_model` for enforcement rather than creating loopholes in the producer taxonomy.

Source-backed raw facts may be eligible only when represented through a CCF evidence contract with source-level provenance. The fact's retrieval path is not itself model authority. `pending_verification` facts are not eligible native authority until their source, temporal, and identity contracts are verified.

## Required fixture coverage

At minimum, certification fixtures must include:

- QB, RB, WR, and TE;
- healthy starter;
- questionable/injury-limited player;
- role change or depth-chart transition;
- severe and benign weather conditions;
- favorite and underdog game scripts;
- high and low projected game totals;
- materially different scoring formats;
- replacement-level player;
- high-volatility / tail-risk player;
- sparse-evidence player that should trigger wider uncertainty or abstention;
- at least one case where CCF and a TIBER challenger materially disagree.

## Surface sequence

Certify in this order:

1. weekly player outcome distribution;
2. weekly ranking;
3. lineup/start-sit;
4. replacement value / VORP-like utility;
5. rest-of-season value;
6. waiver recommendations;
7. trade recommendations;
8. draft value;
9. dynasty and rookie/devy surfaces.

A downstream surface cannot be certified if any recommendation-critical upstream surface is uncertified.

## Ablation report

Each certification run should emit a machine-readable report containing:

- fixture and as-of identifiers;
- CCF model/version identifiers;
- enabled and disabled producer families;
- native projection/distribution;
- challenger outputs;
- recommendation result;
- confidence / uncertainty fields;
- abstention state;
- critical feature provenance;
- delta when challenger evidence is attached;
- outcome, when available;
- calibration and error metrics.

## Performance comparisons

Do not require CCF to beat TIBER on every fixture. Require the following before broad promotion:

- no material calibration regression versus a simple baseline over the validation set;
- competitive or better ranking/decision accuracy versus the incumbent TIBER path;
- explicit identification of slices where TIBER remains superior;
- no improvement claim without frozen out-of-sample evaluation.

TIBER may remain a useful challenger specifically in slices where it adds independent information.

## Promotion states

- `UNCERTIFIED`: native path incomplete or hidden dependency detected.
- `NATIVE_READY`: native path passes functional/provenance checks but lacks adequate outcome evaluation.
- `CCF_PRIMARY`: functional independence plus calibration/validation requirements pass.
- `CCF_PRIMARY_TIBER_ADDITIVE`: CCF_PRIMARY and TIBER challenger evidence demonstrates reproducible incremental value without becoming a dependency.

## Release veto

A surface must not be described as CCF-primary if the TIBER-off run fails. Product/UI convenience, deadline pressure, or apparently good aggregate results do not override the independence gate.
