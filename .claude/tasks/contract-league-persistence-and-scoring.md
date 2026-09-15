# Contract League Persistence, Rules, Scoring, and GM Intelligence

## Status

Prepared 2026-09-15 from live user requests. PR #37 owns the bounded foundation work. Repository Issues are disabled on the user fork, so this task file is the durable scoped follow-on record.

This revision incorporates a second-pass audit of the user's private league sources plus current contract-dynasty/front-office product patterns. It intentionally expands the follow-on scope without widening the already-tested `contract-league-snapshot.v1` boundary inside PR #37.

## Goal

Make private contract/salary-cap leagues first-class FFCC league contexts with durable, provenance-aware contract state, exact league scoring, configurable league-policy/rules, and a CCF-first GM decision layer that can safely answer:

1. Is this move legal right now?
2. What does it cost in every affected season?
3. What football value am I receiving or giving up under this league's scoring?
4. How does the move change roster strength, cap flexibility, risk, and future optionality?
5. What action should the user take, why, and what rule/evidence caused that recommendation?

The desired user experience is a Contract League War Room, not merely a cap table.

## Non-goals

- Do not commit private workbook contents, Drive IDs/URLs, team rosters, contract values, or league-specific private rule values.
- Do not guess platform league IDs, player identities, scoring settings, calendar-year mappings, contract rights, or rule parameters.
- Do not broaden the legacy `server/modules/startSit` recommendation engine; it is classified `EXTRACT`.
- Do not merge or deploy from this task without the repository's normal review/authority gates.
- Do not make contract economics alter the underlying football outcome distribution.
- Do not hard-code League Tycoon, RSO, DynastIQ, Dynasty Desk, MFL, Fantrax, Ottoneu, Spotrac, or NFL rules as FFCC defaults. They are design references only.
- Do not force every contract league into an NFL-CBA simulation. League constitutions remain authoritative for their own economics.

## Read first

- `AGENTS.md`
- `ARCHITECTURE.md`
- `CURRENT_PHASE.md`
- `.claude/AGENTS.md`
- `.claude/conventions.md`
- `CODEBASE_MAP.md`
- `server/modules/startSit/MODULE.md`
- `server/modules/contractLeagues/MODULE.md`

## Design references and the specific lesson to retain

The goal is to learn mechanisms, not copy products.

- **DynastIQ**: multi-year cap projections, roster/cap audits, hypothetical-cut War Room, and cap-aware trade simulation. Retain the scenario-planning and audit ergonomics.
- **League Tycoon**: salary + term bidding, cap holdback/rollover concepts, rookie contracts/options, tags/RFA, practice-squad and IR cap treatment, dead-money previews, and rule transparency. Retain configurable rule primitives and pre-transaction consequence previews.
- **Reality Sports Online (RSO)**: guaranteed money, cap acceleration, multi-year auction negotiation, extension pricing, rookie scale/options, tags, and player-agent style market valuation. Retain explicit guarantees/options and league-market-aware pricing.
- **Dynasty Desk**: contract waterfall, live cap sheets, cap-validated transactions, RFA flow, league calendar, alerts, and full contract history. Retain deadline/action visibility and complete transaction history.
- **MyFantasyLeague / Fantrax**: unusual league configuration and salary-cap edge cases. Retain broad configurability and fail-closed behavior rather than assuming one canonical format.
- **Ottoneu**: important-dates dashboard, cap loans/retained salary, salary escalators, arbitration/RFA-style market pressure, and roster-reserve accounting. Retain the idea that cap transfers and lifecycle windows are explicit assets/state.
- **Spotrac / OverTheCap-style calculators**: transaction-by-transaction before/after cap consequences, including cut/trade/restructure/extension alternatives. Retain scenario comparison and reversible what-if modeling.

## Observed source requirements

The user's private source workbooks demonstrate that the normalized economic state must support at minimum:

- multi-year contract seasons;
- guaranteed and optional money as distinct components;
- annual cap hit, AAV, and total contract value;
- contract structure/distribution metadata;
- re-sign, restructure, option, amnesty, and related eligibility metadata where authoritative;
- dead cap;
- normal IR and season-ending IR semantics;
- team totals for guaranteed money, cap hit, cap after guarantees, and cap remaining;
- negative future cap remaining as valid evidence;
- source layouts where some tabs may use ordinal year labels rather than calendar years.

The authoritative constitution audit also proves that contract leagues may contain policy that cannot be inferred from a roster workbook, including configurable examples of:

- contract-length and contract-slot limits;
- guarantee/option structure requirements;
- front-loaded/even distribution rules and rounding/increment rules;
- seasonal roster-size changes;
- different active/IR/season-ending-IR cap treatment;
- retirements and special cap treatment;
- amnesty rights;
- rolling restructure/re-sign limits;
- franchise/transition/RFA-like rights;
- rookie-scale contracts and option years;
- nomination limits, bid timers, and bid-reset behavior;
- maximum bid/contract constraints;
- cap-compliance windows that differ in-season vs offseason;
- reacquisition/cooldown rules after cuts or amnesty;
- retained salary and transferable dead-cap mechanics in trades;
- future-pick limits and other trade-legality constraints;
- deadline/calendar state that changes which actions are legal.

One league has authoritative scoring/lineup rules. The second league's exact scoring rules remain unresolved and must not be inferred from the roster workbook.

## Core architecture

Contract support should use four separate truth layers:

```text
A. football truth
   CCF football outcome distributions / uncertainty

B. league competitive rules
   scoring + lineup eligibility + roster eligibility

C. league economic state
   contracts + cap ledger + rights + dead money + market state

D. league policy / lifecycle
   what moves are legal, when, and how consequences are calculated
```

Decision flow:

```text
football outcome distribution
-> exact league scoring translation
-> legal lineup-slot optimization
-> fantasy outcome distribution

validated contract/economic snapshot
+ versioned league-policy profile
+ decision timestamp / lifecycle window
-> legal move generator
-> deterministic cap/contract consequence engine

fantasy outcome distribution
+ economic consequences
+ roster / contender-rebuilder context
-> CCF contract-league decision layer
-> recommendation / explanation / abstention
```

The rule-policy layer must be separate from the source snapshot. A snapshot says what the current state *is*. Policy says what transformations are *allowed* and how they change state. This separation keeps `contract-league-snapshot.v1` stable and replayable.

## Phase A — normalized boundary (PR #37)

Already bounded in PR #37:

- `contract-league-snapshot.v1`;
- explicit provenance and validation state;
- unresolved identity allowed, never guessed;
- guaranteed / optional / cap-hit money;
- team cap ledgers, including valid negative future cap;
- explicit scoring + lineup fields;
- generic fantasy-scoring translator;
- fail-closed adapter from snapshot scoring to translator;
- synthetic regression tests.

Do not churn this schema merely to encode policy. Add a separately versioned policy boundary in a follow-on.

## Phase B — append-only persistence

Prefer an append-only/versioned snapshot persistence boundary before designing highly normalized contract tables. Persistence must record at least:

- internal league key;
- schema version;
- source kind and private source reference token/opaque key;
- source modified/as-of timestamp;
- importer version;
- deterministic fingerprint;
- validation status/warnings/unresolved fields;
- normalized snapshot payload;
- imported/created timestamp;
- explicit supersession lineage.

Do not overwrite prior imports. A newer import supersedes through explicit lineage so old Canonical Decision Packets remain replayable.

## Phase C — private-source importer

Build source-specific importers outside public fixtures. Each importer must:

1. read source content through an authorized private integration/export path;
2. preserve source labels for auditability;
3. map calendar seasons explicitly;
4. reject or mark `PARTIAL` for ordinal year headers without an authoritative mapping;
5. separate guaranteed, optional, and cap-hit values;
6. reconcile derived team totals against source cap totals;
7. preserve negative cap remaining;
8. preserve contract structure / distribution labels when present;
9. preserve special roster/economic state without inventing semantics;
10. leave unmatched players unresolved for governed identity resolution;
11. emit `contract-league-snapshot.v1` only after validation.

Private importers must not leak source contents into public fixtures, logs, PR descriptions, tests, or generated examples.

## Phase D — platform / league binding

Where the contract league also exists on Sleeper/ESPN/Yahoo/MFL/Fantrax or another verified platform:

- platform remains authoritative for platform league identity, scoring settings, lineup slots, NFL roster state, starters/bench/IR, transactions, and matchups where available;
- private workbook supplements contract economics and contract-only states;
- constitution/rules source is authoritative for league policy when platform configuration cannot represent the custom rule;
- conflicting evidence must be surfaced, not silently overwritten;
- every field should carry source/freshness/authority metadata sufficient for replay and explanation.

## Phase E — versioned league-policy profile

Introduce a separate `contract-league-policy` boundary. It must be explicit, versioned, provenance-aware, and fail closed when a required rule is unresolved.

Minimum policy families:

### Cap policy

- hard vs soft cap semantics;
- which money counts toward which cap test (guaranteed, total cap hit, dead cap, etc.);
- current vs future-year enforcement;
- offseason over-cap allowances and compliance deadline;
- cap holdback / rookie reserve / in-season reserve if applicable;
- rollover rules if applicable;
- salary floor if applicable;
- max individual contract/bid constraints;
- salary increments and rounding rules;
- slot-specific cap treatment for active roster, bench, IR, season-ending IR, taxi/practice squad, or league-specific reserves.

### Contract policy

- legal contract lengths by acquisition type;
- limited long-contract slots if applicable;
- guarantee/option structure rules;
- legal distribution patterns;
- rookie contract scale, rookie options, and pick-dependent structures;
- extension / re-sign eligibility, pricing basis, contract length, and usage limits;
- restructure eligibility, conversion formula, timing, and rolling limits;
- amnesty rights and consumption state;
- retirement treatment;
- franchise, transition, RFA, or league-specific tag rights and matching/compensation behavior;
- contract expiration and rollover lifecycle.

### Transaction policy

- cut/release cap consequences;
- dead-cap acceleration / schedule;
- trade transfer of contract obligations;
- retained salary / cap loans;
- tradable dead cap;
- tradable cap space if applicable;
- reacquisition restrictions or cooldown periods after release/amnesty;
- future draft-pick horizon;
- conditional-pick legality;
- roster-count legality before/after a transaction;
- minimum-position or viable-lineup requirements;
- review/approval/veto timing where it affects transaction finality.

### Auction / free-agency policy

- nomination limits;
- bid windows and reset behavior;
- salary + contract-length bid representation;
- cap validation at bid time vs award time;
- offer comparison/tiebreak logic;
- contract-structure restrictions by bid type;
- RFA/tag matching windows;
- max offer / max term rules;
- offseason vs in-season differences;
- waiver and free-agent cooldowns.

### Lifecycle / calendar policy

- league year rollover;
- rookie draft window;
- contract decision deadlines;
- trade deadline / reopen date;
- free-agency open/close windows;
- tag / RFA / extension / restructure windows;
- keeper/cap-compliance deadline;
- roster-limit changes by phase;
- playoff-specific legality if different;
- effective-date/version history for rule amendments.

Policy values must be imported from authoritative rules/platform settings or entered explicitly by the user/commissioner. Never infer a league rule because another platform uses it.

## Phase F — scoring-aware legal lineup optimizer

The current legacy Start/Sit engine is not an exact league optimizer. Build the new optimizer at the current FFCC/CCF decision boundary rather than adding new recommendation logic to the `EXTRACT` module.

Required behavior:

- input: frozen football outcome distributions, exact league scoring, exact lineup-slot eligibility, roster candidates, injury/readiness state, and decision timestamp;
- translate each player's football distribution into a fantasy-point distribution under that league's scoring;
- solve the legal lineup assignment deterministically;
- support QB/RB/WR/TE/FLEX/SUPERFLEX at minimum;
- support position-specific bonuses and league-specific negative scoring;
- preserve uncertainty/tail-risk outputs rather than optimizing a single mean only;
- abstain with explicit `SCORING_UNAVAILABLE`, `LINEUP_RULES_UNAVAILABLE`, or equivalent when critical inputs are missing;
- never default silently to generic PPR.

Regression matrix should include:

- standard;
- half PPR;
- full PPR;
- 4-point vs 6-point passing TD;
- TE premium;
- Superflex;
- different FLEX counts/eligibility;
- turnovers/negative scoring;
- identical football stat line producing different fantasy outcomes across league profiles.

## Phase G — deterministic transaction consequence engine

Build a pure, side-effect-free simulation layer that takes a frozen economic snapshot + policy + proposed action and returns:

- legality result;
- violated rule codes when illegal;
- current-year cap before/after;
- every affected future-year cap before/after;
- guaranteed/optional obligation changes;
- dead-cap creation/transfer;
- roster-slot effects;
- contract-right usage/consumption;
- expiring-contract and option-state changes;
- pick/cap/contract assets transferred;
- next relevant deadline or required follow-up action;
- deterministic state fingerprint for replay.

Minimum simulated actions:

- KEEP;
- CUT / RELEASE;
- TRADE;
- TRADE_WITH_RETAINED_SALARY / CAP_LOAN where legal;
- TRADE_DEAD_CAP where legal;
- EXTEND / RE-SIGN;
- RESTRUCTURE;
- EXERCISE / DECLINE OPTION;
- FRANCHISE / TRANSITION / RFA-TYPE DESIGNATION where legal;
- MATCH / DECLINE tagged/RFA offer where legal;
- AMNESTY where legal;
- IR / SEASON_ENDING_IR / TAXI-PRACTICE-SQUAD placement where legal;
- FREE_AGENT / WAIVER / AUCTION BID;
- LET_EXPIRE.

This engine owns cap math and legality. CCF consumes its outputs but must not recreate those rules independently.

## Phase H — market and contract valuation

Create a league-local market model using actual historical league behavior when sufficient data exists.

Candidate evidence:

- completed free-agent contracts;
- winning and losing auction bids when available;
- position-specific salary distributions;
- years/guarantee/option structure;
- rookie contract scale;
- tag/re-sign/extension prices;
- trade consideration involving salary retention/dead cap;
- cap scarcity by team and season;
- number/quality of upcoming free agents;
- league scoring positional demand;
- roster/start requirements;
- CCF fantasy outcome distributions.

Derived metrics should include explicit uncertainty and availability state:

- league-market salary estimate;
- contract surplus value by season;
- risk-adjusted surplus value;
- cap efficiency / value per cap dollar;
- years of useful control;
- option value;
- guarantee exposure;
- dead-cap exposure;
- cut/trade flexibility;
- replacement-cost spread;
- position-market scarcity;
- expiration concentration;
- future cap concentration;
- roster liquidation difficulty;
- rookie-contract leverage;
- cap-space percentile / purchasing power.

Do not fabricate a market estimate in young leagues with insufficient transactions. Use a clearly labeled prior/range or `UNAVAILABLE` state until enough league-local evidence exists.

## Phase I — Contract League War Room

Build a novice-friendly management surface that separates accounting from decisions.

### Top-level team summary

- current cap;
- **spendable cap** (cap minus required reserves/known obligations);
- future-year cap trajectory;
- dead cap;
- guaranteed exposure;
- rookie / transaction reserve where applicable;
- expiring salary;
- next decision deadline;
- roster strength / contender-rebuilder posture from CCF, not from cap alone.

### Player buckets

- bargains / positive surplus;
- fair contracts;
- overpays / negative surplus;
- extension/re-sign candidates;
- restructure candidates;
- tag/RFA candidates;
- cut/trade candidates;
- expiring assets;
- fragile contracts;
- high-upside rookie/control assets.

### Scenario cards

For each legal action show:

- what happens now;
- cap impact by year;
- dead-cap/guarantee impact;
- projected lineup/roster effect;
- CCF win-probability / playoff / championship delta where available;
- flexibility delta;
- main downside / tail risk;
- rule citation/explanation;
- confidence and materially missing evidence.

War Room simulations never mutate authoritative state until a real platform/workbook transaction is observed/imported.

## Phase J — cap-aware trade / waiver / roster decisions

Contract context must be available to existing FFCC decision products:

### Trades

- value the player and the attached contract separately, then jointly;
- evaluate retained salary / dead cap / cap loans where legal;
- enforce current/future cap and roster constraints;
- show post-trade cap trajectory for both sides when enough data is available;
- value draft picks partly through cost-controlled contract opportunity;
- identify trades that improve football value but create unacceptable cap fragility;
- identify negative-contract assets and salary-dump value.

### Waivers / free agency / auctions

- calculate legal maximum bid;
- preserve required reserve / spendable-cap distinction;
- estimate market-clearing range with uncertainty when evidence exists;
- account for term/guarantee/option risk, not only annual salary;
- track competitors' available cap and roster needs as market context where public/authorized.

### Cuts / contract decisions

- compare keep vs cut vs trade vs restructure vs expiry;
- surface dead-cap acceleration and future savings;
- distinguish sunk current-year charges from avoidable future obligations;
- include replacement cost and lineup impact.

Contract economics remain decision context, not a football-performance feature.

## Phase K — audit, alerts, and beginner guidance

A novice contract-league user should not need to memorize the constitution.

Required UX behaviors:

- explain each recommendation in plain language;
- distinguish `CAP SPACE` from `SPENDABLE CAP`;
- warn before a move consumes a scarce right (tag, restructure, re-sign, amnesty, etc.);
- flag upcoming expirations and decision windows;
- flag future cap crunches before they become current problems;
- flag clustered expirations / too many long commitments;
- identify unused optionality and expiring rights;
- explain why the same player can be a good football asset but bad contract asset;
- show glossary/tooltips for league-specific terms;
- provide a transaction checklist: legal -> affordable -> football value -> contract value -> future flexibility -> tail risk.

Alerts should be event/deadline driven and deduplicated through existing FFCC continuous-intelligence infrastructure rather than creating an independent watcher stack.

## Phase L — Canonical Decision Packet integration

Contract-league decisions must extend the frozen packet with the minimum economic/rule context needed for replay:

- league-policy version/fingerprint;
- economic snapshot version/fingerprint;
- cap by relevant season;
- player's contract schedule and rights;
- proposed transaction/action;
- legality result and rule codes;
- deterministic consequence output;
- market valuation inputs/availability;
- scoring/lineup context;
- materially missing data;
- exact as-of timestamp/timezone.

External challengers may critique the decision but cannot mutate the frozen contract state or policy during blind analysis.

## Phase M — verification / regression matrix

At minimum certify:

### State and import

- guaranteed + optional + cap-hit reconciliation;
- negative future cap preserved;
- unresolved year/player identity fails closed;
- old snapshots remain replayable after new imports;
- source conflicts remain visible.

### Policy

- in-season and offseason cap rules can differ;
- active vs IR vs special reserve can have different cap treatment;
- contract lengths/structures can differ by acquisition type;
- scarce rights decrement correctly and cannot be reused illegally;
- effective-date rule changes do not rewrite historical decisions;
- unknown policy inputs cause abstention, not defaults.

### Transactions

- keep/cut/trade/restructure/extend/tag/amnesty/option actions;
- retained salary / cap loans / dead-cap transfer where enabled;
- illegal future-cap or roster states are rejected according to policy;
- cooldown/reacquisition rules;
- bid timers/windows and max-offer constraints;
- deterministic before/after fingerprints.

### Decisions

- identical football value + different contract = different recommendation when economics materially differ;
- identical contract + different league scoring = different fantasy/roster value when scoring materially differs;
- cheap control can create positive surplus without inflating underlying football projection;
- expensive elite player can remain a strong start while being a weak contract asset;
- missing market history does not fabricate precision.

## Priority order

1. Certify/merge PR #37 only through normal authority gates.
2. Append-only persistence.
3. Private importer for both leagues.
4. Verified platform binding and exact scoring/lineup state.
5. Versioned league-policy profile.
6. Scoring-aware legal lineup optimizer.
7. Deterministic transaction consequence engine.
8. Contract League War Room MVP: cap trajectory + spendable cap + keep/cut/trade/extend/restructure scenarios.
9. Contract-surplus / market model once enough league-local evidence exists.
10. Integrate contract context into trade, waiver, rookie/pick, and roster-construction decisions.
11. Alerts, calendars, beginner guidance, and deeper market intelligence.

## Done criteria

- Both private leagues can be imported and persisted without publishing source data.
- Every persisted snapshot has source/version/as-of/fingerprint lineage.
- Every policy profile has source/version/effective-date/fingerprint lineage.
- Source cap totals reconcile or the import remains visibly partial/rejected.
- Ambiguous year labels and unresolved identities fail closed.
- Exact scoring + legal lineup rules feed the new lineup optimizer.
- The same football outcome can score differently across league profiles as expected.
- Missing scoring never silently becomes PPR.
- Unknown contract rules never silently adopt another platform's defaults.
- Legal-move simulation deterministically reproduces cap/contract consequences by season.
- CCF recommendations can distinguish football value, contract value, and flexibility value.
- Contract decisions are replayable from frozen as-of evidence.
- War Room explanations are understandable to a novice without requiring manual cap math.
