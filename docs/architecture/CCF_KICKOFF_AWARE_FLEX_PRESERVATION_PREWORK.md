# CCF Kickoff-Aware Flex Preservation

**Status:** held prework / recommendation-policy design only. No runtime activation, source promotion, route cutover, lineup write, or recommendation-authority change is authorized by this document.

## Motivation

A legal lineup can have identical projected fantasy points while differing materially in how many future lineup moves remain available after NFL games begin. A common example is a Thursday-night WR occupying FLEX while another starting WR who plays Sunday occupies a WR-only slot. Once the Thursday player locks, the manager has unnecessarily frozen the broad FLEX slot and lost the ability to react to late injury, inactive, weather, role, or news information with an RB/WR/TE replacement.

CCF should therefore treat lineup slot placement as a decision problem with **future recourse value**, not as a cosmetic permutation after selecting starters.

The familiar rule "get TNF players out of FLEX" is a special case of a more general policy:

> **Among lineups with the same primary fantasy value, place earlier-locking players into the most position-restricted legal slots and preserve broader slots for later-locking players.**

This is a lineup-structure rule, not a projection adjustment. A Thursday player does not lose projected fantasy points because the game is Thursday.

## Decision hierarchy

CCF should use a lexicographic decision hierarchy for the balanced lineup posture:

1. **Primary objective: expected fantasy points.**
   - Never bench a meaningfully better player merely to preserve FLEX.
   - Do not subtract an arbitrary "Thursday penalty" from player projections.
2. **Secondary objective: kickoff-aware future lineup optionality.**
   - When the selected starters have equal expected points, choose the legal slot assignment that preserves the most useful later flexibility.
   - When two alternative starter sets are exactly equal in expected points, optionality may resolve the tie if one structure preserves strictly more future legal recourse.
3. **Future extension: explicit Expected Optionality Value (EOV).**
   - A small projected-points sacrifice may only become rational if a governed contingency model quantifies the expected value of later swaps (injury/inactive uncertainty, replacement quality, remaining player pool, information arrival, etc.).
   - Until that model is certified, kickoff flexibility must not silently override a real expected-points edge.

## Core rule

For every unlocked starting player and every legal slot the player can occupy:

- earlier lock time increases the cost of using a broad slot;
- broader slot eligibility increases the opportunity cost of freezing that slot early;
- later players should preferentially occupy FLEX/SUPERFLEX or other broad slots;
- same-window players are neutral to one another unless another governed optionality signal distinguishes them;
- already-locked starters remain frozen exactly where they locked.

### Canonical examples

- **WR Thursday + WR Sunday, WR and FLEX available:** Thursday WR -> WR; Sunday WR -> FLEX.
- **RB Sunday 1 PM + WR Sunday 4:25 PM, RB and FLEX available:** early RB -> RB; late WR -> FLEX if both player/slot assignments preserve the same primary EV.
- **QB Sunday 1 PM + QB Monday, QB and SUPERFLEX available:** early QB -> QB; Monday QB -> SUPERFLEX.
- **TE Thursday with only FLEX eligibility because the TE-only slot is occupied by a locked TE:** no forced move exists; keep the legal lineup.
- **Thursday player projects higher than the available Sunday replacement:** start the better player. Slot optimization changes *where* the starter is placed, not whether a better player is benched for cosmetic flexibility.

## Generalization beyond TNF

Do not hard-code weekday labels. Use authoritative player lock timestamps / game kickoff windows.

The ordering should naturally handle:

- Thursday -> Sunday early -> Sunday late -> SNF -> MNF;
- international/morning games;
- Saturday games;
- holiday slates;
- split Monday doubleheaders or any future staggered schedule;
- rescheduled games, provided the authoritative frozen roster/schedule state is refreshed before the decision and provenance rules are satisfied.

## Flexibility metric v0

The first admissible implementation should be deterministic and conservative.

For each slot, define **slot breadth** from the active league's exact eligible-position set. Example:

- RB slot: `{RB}` -> breadth 1
- WR slot: `{WR}` -> breadth 1
- FLEX: `{RB, WR, TE}` -> breadth 3
- SUPERFLEX: `{QB, RB, WR, TE}` -> breadth 4

For each unlocked candidate, derive an ordinal **lock-window rank** from the authoritative `lockAt` timestamps in the frozen decision packet. Earlier lock windows rank before later lock windows; players sharing the same timestamp/window share the same rank.

A secondary placement penalty can then be proportional to:

`earlyness_rank_remaining * (slot_breadth - 1)`

The complete-lineup solver should optimize lexicographically:

`(primary_expected_points_cost, secondary_flexibility_penalty)`

The comparison must preserve the primary objective exactly within the solver's existing numerical tolerance. The secondary cost must never be folded into fantasy points or represented as projected scoring.

## Why lexicographic optimization matters

Using an arbitrary epsilon such as `projected_points - 0.01 * flex_penalty` is not acceptable because it can change the selected starter when two players differ by a very small but real expected-points amount. CCF should instead compare objective components lexicographically:

- lower expected-points cost always wins first;
- flexibility is consulted only when the primary totals are equal within the declared tolerance.

This preserves the existing expected-points contract while eliminating arbitrary slot permutations.

## Structural tie semantics

The existing lineup core deliberately avoids player-ID tie breaking. Kickoff-aware flexibility should refine that behavior, not weaken it.

A lineup should **not** be reported as a structural tie merely because two equal-EV slot permutations exist when one strictly preserves more future flexibility. The better optionality structure is a meaningful football-management distinction.

A `structural_tie` should remain only when an alternative complete lineup is equal on:

1. primary expected fantasy points; and
2. the governed kickoff-aware flexibility objective.

If future EOV exists, equality must extend through that governed objective as well.

## Data and provenance requirements

Kickoff-aware slotting is recommendation-critical. Therefore its timing inputs must obey the same point-in-time/source discipline as the rest of CCF.

Required evidence:

- exact player -> NFL game binding;
- authoritative scheduled lock/kickoff time (`lockAt` or equivalent governed field);
- frozen `asOf` no later than the recommendation;
- correction handling for reschedules;
- explicit lock state independent from timestamp inference;
- frozen roster-state fingerprint that changes when recommendation-relevant lock timing changes.

The optimizer must **not** infer whether a player is currently locked solely by comparing wall-clock time to kickoff. Existing explicit `locked | unlocked | unknown` semantics remain authoritative. Kickoff timestamps are used for future-option ordering; lock truth remains explicit.

If the timing input needed to distinguish legal slot permutations is unavailable or unqualified, CCF should not invent the ordering. It should surface degraded/unknown optionality rather than pretend an arbitrary slot permutation is equally intentional.

## Integration target

The correct ownership seam is the CCF complete legal-lineup decision core (`server/modules/ccf/lineup/**`), not the frozen legacy Start/Sit path.

Expected implementation touchpoints when activated:

- `lineupDecision.ts`
  - replace scalar min-cost comparison with a lexicographic expected-points + flexibility cost;
  - retain exact expected-points output unchanged;
  - refine structural-tie detection to include flexibility equality;
  - expose a warning/receipt note indicating that equal-EV slots were kickoff-optimized.
- `rosterStateSnapshot.ts`
  - continue fingerprinting `lockAt`; verify any future richer kickoff evidence is also content-addressed.
- lineup/runtime composition
  - require timing evidence to originate from the qualified schedule/activation spine rather than provider-specific ad hoc logic.
- certification tests
  - add adversarial slot-order tests and deterministic replay coverage.

## Required regression matrix

Minimum tests before activation:

1. Thursday WR moves from FLEX to WR while Sunday WR moves into FLEX at identical starter EV.
2. Sunday early RB moves to RB while Sunday late WR remains FLEX when both structures score identically.
3. Sunday early QB moves to QB while Monday QB occupies SUPERFLEX.
4. Same-window players do not receive fabricated ordering preference.
5. Locked FLEX player is never moved after lock.
6. Player ineligible for the narrow slot remains in FLEX; optimizer does not manufacture an illegal swap.
7. Higher-EV starter remains selected even when a lower-EV alternative offers more flexibility.
8. Equal-EV alternative starter sets are resolved by flexibility only when the secondary objective is strictly better.
9. Equal EV + equal flexibility remains `structural_tie` rather than falling back to player ID.
10. Missing/invalid timing evidence cannot silently create a kickoff preference.
11. Roster snapshot fingerprint changes when recommendation-relevant `lockAt` changes.
12. Rescheduled game timestamp produces a new frozen decision input/fingerprint and deterministic recomputation.
13. FLEX/SUPERFLEX coexistence preserves the broadest useful later slot according to exact league eligibility.
14. Nonstandard league slot eligibility is honored from Unified League Context rather than hard-coded ESPN/Sleeper assumptions.

## Future Expected Optionality Value (EOV)

The simple lock-order rule captures free optionality without changing starter EV. A later model can quantify when flexibility itself has measurable expected fantasy value.

Potential ingredients:

- probability a questionable/doubtful player becomes inactive before later kickoff;
- probability of meaningful role/news updates between lock windows;
- quality and positional eligibility of still-unlocked bench replacements;
- waiver/free-agent replaceability where platform rules permit;
- late-swap breadth after each kickoff frontier;
- correlated teammate/injury contingencies;
- weather-information arrival for late outdoor games;
- platform-specific lock semantics;
- playoff/underdog posture only through explicitly governed decision objectives.

EOV must be calibrated/backtested chronologically. It cannot be a vibes-based fixed bonus for FLEX or a blanket penalty for Thursday players.

## UI/explanation behavior

When the optimizer recommends a slot-only move, explain the management reason plainly, for example:

> Move Amon-Ra St. Brown from FLEX to WR before Thursday kickoff and place the Sunday WR in FLEX. Projected points are unchanged; this preserves RB/WR/TE replacement flexibility for the later games.

Do not present the move as a player-ranking change.

## Hard boundaries

This design does **not**:

- change a player's fantasy projection because the game is Thursday;
- authorize a lower-EV lineup solely for generic flexibility;
- infer lock state from time alone;
- create provider-specific slot rules;
- weaken CCF-first authority or point-in-time provenance;
- activate lineup writes;
- promote a schedule/provider source;
- alter the frozen legacy Start/Sit scorer.

## Promotion condition

Runtime activation is admissible only after the schedule/lock timing evidence consumed by the lineup packet is qualified under CCF source/provenance rules and the complete-lineup core passes the regression matrix above on an exact certified head.
