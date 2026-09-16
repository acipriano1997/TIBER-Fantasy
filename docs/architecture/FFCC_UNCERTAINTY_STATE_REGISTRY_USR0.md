# FFCC Uncertainty State Registry — USR-0

Status: **pure-domain implementation candidate; no runtime activation**.

Architecture authority remains Prometheus-Frameworks/TIBER-Fantasy #389. Contract freeze: #393. Engineering packet: #394.

## Why USR exists

Fantasy decisions frequently occur before the underlying football state is settled. Committees, returning players, quarterback contingencies, target hierarchies, and offensive-regime changes are not well represented by one mutable depth-chart label or one point estimate.

USR therefore models shared uncertainty directly:

`definition -> observations -> witness results -> immutable evaluation snapshots -> resolution/correction/reopen receipts -> scenario references`

The current UI/read model is derived and disposable; the append-only evidence/evaluation history is authoritative.

## USR-0 scope

Implemented in `server/modules/uncertaintyRegistry/`:

- strict Zod contracts;
- canonical SHA-256 fingerprints;
- categorical support only (`UNASSESSED`, `PLAUSIBLE`, `SUPPORTED`, `LEADING`, `CONTRADICTED`, `RULED_OUT`);
- fast/medium/slow persistence policy;
- `UNRESOLVED`, `CONTESTED`, `LEANING`, `PARTIALLY_RESOLVED`, `RESOLVED` classification;
- `BACKGROUND`, `WATCH`, `ELEVATED`, `URGENT` shared attention;
- source/metric-specific resolution witnesses;
- correct absence semantics;
- future-evidence eligibility helper;
- append-only conformance and reopening rules;
- multi-player opportunity conservation;
- CCF-safe scenario branch references;
- 15 synthetic golden traces.

## Deliberate exclusions

USR-0 contains no:

- live source ingestion;
- provider client;
- database migration or persistence adapter;
- scheduler/watcher;
- route or UI;
- automatic situation discovery;
- numeric uncertainty score;
- LLM-derived probability;
- fantasy-point forecast;
- CCF execution;
- recommendation mutation;
- autonomous fantasy action.

## Probability boundary

A scenario binding may be `UNAVAILABLE`, `QUALITATIVE_ONLY`, or `CALIBRATED`.

`CALIBRATED` is valid only when:

1. the declared state set is exhaustive;
2. every declared state has exactly one branch;
3. every branch has a numeric probability;
4. probabilities sum to one;
5. producer, calibration, and horizon refs are all supplied.

Qualitative evidence-support labels may never be converted into percentages.

## Point-in-time and replay

Every observation carries `knownAt`; the eligibility helper enforces `knownAt <= asOf`. Evaluation snapshots carry an input fingerprint and prior-snapshot ref. Corrections append new records. Reopening points back to the exact prior resolution receipt and requires a predeclared material cause.

This enables later backtests to answer both:

- what eventually happened? and
- what did FFCC legitimately know at the decision time?

## Integration seams

### CIF / source infrastructure
Future USR materialization should consume governed evidence refs, freshness/conflict status, and change triggers. USR must not duplicate ingestion or source truth.

### Hypothesis Core
Use its append-only/pure-domain design lessons only. Shared USR state does not inherit the operator-private Hypothesis envelope.

### CCF
USR scenario bindings are reference-only. CCF remains the sole fantasy-distribution and recommendation authority. A later integration may consume coherent branches jointly; USR itself never emits fantasy quantiles or weighted mixtures.

### Operator surfaces
`OperatorSituationOverlayV0` can express league/roster exposure, decision boundaries, and action timing. It cannot mutate shared football-state support or resolution.

## Promotion sequence

- **USR-0**: contracts/policy/conformance — this slice.
- **USR-1**: read-only materialized registry over admitted evidence.
- **USR-2**: watchers and resolution engine integration.
- **USR-3**: certified CCF scenario-conditioned forecast seam.
- **USR-4**: product/decision composition.
- **USR-5**: learned prioritization/resolution only after sufficient operating history.

No later stage is authorized by USR-0 implementation alone.
