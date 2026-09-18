# Contract Cap Intelligence v1

## Status

Prepared 2026-09-15 from the live Contract League War Room design thread. This is a bounded follow-on specification under PR #37. It extends the existing contract-league snapshot, policy, rights, transaction-consequence, CCF valuation, and market-evidence architecture. It does not create a second cap truth system and does not authorize merge/deploy or real roster transactions.

## Product objective

Turn raw salary-cap accounting into a novice-friendly GM assistant that can answer:

1. How healthy is my cap now and in future seasons?
2. How much room can I create, how quickly, and at what cost?
3. What is the least damaging way to become compliant?
4. How much can I safely spend on a free agent, extension, trade acquisition, or auction bid?
5. Which current contracts are worth protecting, restructuring, trading, cutting, or replacing?
6. What future options does a move preserve or destroy?
7. How does my cap position compare with the rest of the league when authoritative league-wide data exist?

The intended experience is a Contract League War Room, not a cap calculator.

## Architectural ownership

Preserve one owner for each truth family:

- `contract-league-snapshot`: authoritative imported economic state;
- `contract-league-policy`: authoritative legality and league-specific consequence rules;
- `contract-league-rights-state`: immutable scarce-right history and remaining availability;
- `contract-transaction-engine`: deterministic legal transformation and cap consequences;
- CCF: football/fantasy value, uncertainty, roster marginal value, decision ranking, and final recommendation authority;
- market/MPI evidence: secondary/challenger acquisition-price evidence only;
- Cap Intelligence: read-only views, scenario orchestration, optimization, explanation, and comparison over those owners.

Cap Intelligence MUST NOT recompute contract legality, invent market prices, mutate CCF football distributions, or silently turn assumptions into facts.

## Build priority

### P0 — required before advanced cap recommendations

1. **Multi-Year Cap Health / Commitment Map**
2. **Cap Liquidity / Escape-Hatch Map**
3. **Cap Relief / Compliance Rescue Solver**
4. **CCF Player + Contract Value / Replacement Frontier**
5. **Safe Spending / Bid Envelope**
6. **Cap Scenario Stress Tester v1**

These six functions form the minimum coherent decision loop. The stress tester is P0 because it is the composition surface that verifies the first five work together.

### P1 — high-value extensions

7. Re-sign / extension budget planner
8. Transaction branch / `What Does This Prevent?`
9. Cap calendar / decision queue
10. Positional spend and value efficiency
11. Cap concentration / fragility
12. Scarce contract-right opportunity cost

### P2 — data-dependent / broader strategic intelligence

13. League-wide cap intelligence
14. Marginal value of cap space / opportunity-cost lens
15. League-local cap-space purchasing-power model
16. Historical cap-management regret / post-outcome learning

P2 features may be promoted only when the required league-wide and chronological market evidence is sufficiently complete.

---

# Cap Scenario Stress Tester v1

## Core doctrine

A stress test is a **frozen base state plus an explicit assumption set plus deterministic legal transactions plus CCF evaluation**.

Never overwrite or blur these categories:

### A. Frozen facts

Known at the scenario as-of timestamp:
- roster and contract state;
- cap ledger by season;
- guaranteed / optional / dead money;
- league cap values already defined by authoritative policy/source;
- rights availability;
- roster requirements;
- deadlines/lifecycle window;
- scoring and lineup rules;
- current free-agent availability where authoritatively known;
- CCF football/fantasy evidence frozen at the same decision boundary.

### B. Explicit scenario assumptions

Examples:
- `retain Player A`;
- `target Player B at $X for N years`;
- `reserve $Y for rookies` only when user-selected rather than policy-required;
- `assume future league cap = Z` only when policy allows future-cap scenarios;
- `assume no rollover` / `assume rollover = X` where policy makes this scenario-valid;
- `exercise option on Player C`;
- `do not use final restructure right`;
- `preserve at least $X in in-season liquidity`;
- `protect these extension priorities`.

Every assumption must be visible, typed, removable, and replayable. No silent forecasted contracts.

### C. Derived deterministic consequences

Produced only by authoritative policy + transaction engine:
- legality;
- cap deltas by year;
- dead money;
- obligation changes;
- roster-slot changes;
- rights consumed;
- deadlines/cooldowns created;
- compliance state.

### D. Model-based decision consequences

Produced by CCF and clearly labeled as model output:
- lineup-value delta;
- roster marginal-value delta;
- uncertainty / floor / ceiling changes;
- contender-window impact;
- replacement quality;
- decision regret/risk estimate;
- recommendation ranking.

## Scenario input schema

A scenario should contain at minimum:

- `scenario_id`;
- `scenario_version`;
- `league_key`;
- `base_snapshot_fingerprint`;
- `policy_version`;
- `rights_state_fingerprint`;
- `decision_as_of`;
- `ccf_evidence_fingerprint` where CCF is used;
- `assumptions[]`;
- `proposed_actions[]`;
- `constraints[]`;
- `objective`;
- `created_by` / origin;
- deterministic scenario fingerprint.

## Supported v1 constraints

The solver should support combinations of:

- remain cap compliant in every enforced season;
- reach at least `$X` current-year room;
- preserve at least `$X` future-year room;
- preserve at least N restructure/re-sign/amnesty/tag rights;
- protect specified players from CUT/TRADE/RESTRUCTURE;
- keep specified players under contract through a selected season;
- preserve a minimum viable legal roster;
- preserve a minimum CCF lineup-value threshold;
- limit dead-cap creation to `$X`;
- limit future guaranteed-money exposure to `$X`;
- reserve user-selected budget for rookies, extensions, or in-season acquisitions;
- exclude actions not currently legal under the frozen lifecycle window.

A constraint unsupported by authoritative league policy must be `UNAVAILABLE`, never approximated.

## Supported v1 objectives

The same feasible scenario set should be rankable through different lenses:

1. **Recommended / minimum total regret** — default CCF authority.
2. **Preserve contender strength** — minimize near-term CCF lineup/roster value lost subject to compliance.
3. **Protect future flexibility** — minimize future guaranteed/dead exposure and scarce-right consumption.
4. **Maximum immediate relief** — diagnostic extreme, never automatically recommended.
5. **Minimum dead money**.
6. **Minimum rights consumption**.
7. **Maximum expected roster surplus** when player/contract valuation is available.

Do not collapse these into one hidden score. Show the winning plan for each lens plus why the default recommendation differs when it does.

## Scenario families

### 1. Baseline / no action

Show the deterministic trajectory if nothing changes.

### 2. Compliance rescue

If currently or deterministically future-over-cap, find legal action combinations that restore compliance.

Output at least:
- minimum number of moves;
- recommended least-damaging plan;
- maximum-relief plan;
- future-flexibility plan;
- infeasibility witness if no legal combination can restore compliance.

### 3. Free-agent / auction acquisition

Test a target salary + term or a range of bids.

Answer:
- legal maximum bid;
- strategically safe envelope;
- cap-by-year impact;
- replacement/lineup improvement;
- future extension or liquidity constraints introduced;
- breakpoints where another important action becomes impossible.

### 4. Re-sign / extension budget

Lock selected future keepers and determine:
- remaining spendable cap;
- which combinations fit;
- which priority must be sacrificed if all cannot fit;
- cheaper replacement frontier where available.

### 5. Restructure / cut / trade branch comparison

For one player or a set of players, compare all currently legal paths side-by-side with the same frozen evidence.

### 6. Contender shock test

Given explicit assumptions, test whether the roster can absorb:
- one expensive acquisition;
- preserving core extensions;
- a selected dead-cap event;
- selected reserve requirements.

Do not simulate football injuries as contract-cap facts unless the user explicitly asks for a scenario and league policy defines exact economic treatment.

## Safe Spending / Bid Envelope

Define three different values and keep them separate:

- **legal maximum**: highest commitment that passes deterministic rules now;
- **constraint-safe maximum**: highest commitment that also preserves selected future constraints;
- **CCF-recommended range**: economically/competitively justified range based on player value, alternatives, uncertainty, and opportunity cost.

The recommended range may be lower than both maximums. If market-price evidence is unavailable, do not fabricate an expected winning bid; show only legal/constraint envelopes and CCF value boundaries.

## Cap Liquidity metrics

Expose liquidity by year and by player using inspectable components rather than one opaque score:

- immediately creatable room;
- room creatable by next legal window;
- room creatable without dead cap;
- room creatable without consuming scarce rights;
- room creatable while preserving selected CCF value threshold;
- first clean-exit season;
- relief-to-value-lost ratio;
- relief-to-future-cost ratio.

Any summary band must be traceable to these components.

## `What Does This Prevent?` causal branch analysis

After each scenario, derive only consequences that follow from the scenario state. Examples:

- selected extension no longer fits;
- Year N becomes non-compliant;
- last restructure right is consumed;
- in-season reserve drops below selected floor;
- future option cannot be exercised without another move;
- minimum roster fill becomes impossible;
- target FA bid ceiling falls from X to Y.

Warnings must name the causal assumption/action that caused the branch closure.

## User-facing War Room output

For each scenario show:

### Summary
- status: legal / illegal / unavailable / feasible-with-follow-up;
- current cap before / after;
- spendable cap before / after;
- future cap trajectory;
- CCF roster-strength delta;
- dead-money delta;
- rights consumed;
- major future obligation change;
- recommendation + confidence.

### Why
- top 2–4 drivers;
- replacement alternative when relevant;
- opportunity cost;
- important missing evidence;
- exact assumption list.

### Timeline
Show effects by season and upcoming decision window rather than only a current-year total.

### Compare
Allow baseline plus multiple named scenarios to be compared using identical metrics and frozen evidence.

## Solver behavior

Use deterministic enumeration when the feasible action space is small. For larger spaces, use bounded search/optimization over transaction-engine-certified actions. The optimizer may generate candidate combinations but it MUST validate every final plan through the deterministic transaction engine before presentation.

Pruning is allowed only through safe bounds, for example:
- candidate cannot possibly create enough relief;
- action violates immutable policy;
- selected protected-player constraint is violated;
- future cap floor cannot be recovered even under maximum remaining relief.

Never prune based on an unexplained model score alone.

## Explainability / novice mode

Every cap concept should support a short plain-language explanation on demand:

- `Dead money`: cap charge that remains after the player/contract is gone under this league's rules.
- `Guaranteed exposure`: money/cap obligation that cannot be escaped through currently legal paths.
- `Cap liquidity`: how much room can realistically be created and at what cost.
- `Spendable cap`: room left after required/selected reserves and known obligations.
- `Safe bid`: a bid that fits now without violating selected future priorities.
- `Restructure cost`: future flexibility or obligations created in exchange for current relief.

Do not hide the detailed accounting from advanced users; novice explanations are an additional presentation layer.

## Validation and certification

Before recommendation-critical promotion, require synthetic and chronological validation for:

### Deterministic correctness
- identical scenario inputs produce identical fingerprints and outputs;
- baseline scenario exactly matches frozen source state;
- every legal plan replays through transaction engine;
- illegal combinations remain illegal after solver composition;
- future cap and dead-money deltas reconcile by year;
- rights cannot be double-consumed;
- missing policy causes explicit abstention;
- scenario assumptions never mutate authoritative snapshot.

### Decision quality
Track where historical data permit:
- compliance-plan regret;
- cap relief per CCF value lost;
- realized replacement decisions;
- FA / auction acquisition outcomes;
- extension/re-sign outcomes;
- surplus-value calibration;
- future flexibility preserved/lost;
- recommendation performance with market evidence enabled vs disabled;
- TIBER-off operation.

Use point-in-time evidence only. No post-decision leakage.

## Implementation slices

### Slice CI-01 — Cap Health
Read-only multi-year commitment view from snapshot + policy.

### Slice CI-02 — Liquidity
Generate certified single-action escape routes from transaction engine.

### Slice CI-03 — Compliance Rescue
Combine legal relief actions to satisfy cap constraints; deterministic certification required.

### Slice CI-04 — Player/Contract Value
Attach CCF value, roster marginal value, replacement frontier, and surplus layers without collapsing them.

### Slice CI-05 — Safe Spend
Compute legal and constraint-safe acquisition envelopes; CCF recommendation range optional only when sufficient value evidence exists.

### Slice CI-06 — Stress Tester
Scenario schema, explicit assumptions, baseline comparison, multi-action composition, objective lenses, and branch consequences.

### Slice CI-07 — Re-sign Budget + Decision Queue
Add protected-player plans and lifecycle-aware manager queue.

### Slice CI-08 — League-Wide Intelligence
Only after authoritative league-wide cap data and market evidence meet coverage gates.

## Completion gate for Cap Intelligence v1

Cap Intelligence v1 is not complete until a frozen synthetic league can demonstrate all of the following in one replayable decision packet:

1. show multi-year cap health;
2. identify legal liquidity sources;
3. detect a current or future cap violation;
4. generate at least two certified compliance plans;
5. compare a rostered player with a replacement alternative using CCF value layers;
6. calculate legal and constraint-safe bid envelopes;
7. run at least three named stress-test scenarios from the same base state;
8. show what each scenario prevents or preserves;
9. preserve explicit unavailable states when market/policy evidence is missing;
10. reproduce identical output from the same frozen fingerprints.

No single opaque `cap score` is required or desired.