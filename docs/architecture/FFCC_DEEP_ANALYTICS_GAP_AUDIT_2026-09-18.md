# FFCC Deep Analytics Gap Audit — 2026-09-18

**Status:** held research/prework map; no runtime activation  
**Scope:** QB/RB/WR/TE fantasy decision support and the CCF/Player Outcome path  
**Authority:** does not change recommendation authority, source authority, frozen certification scope, promotion gates, or final-holdout policy

## Purpose

This audit asks: which high-value football and fantasy interactions are still missing after accounting for existing TIBER-Fantasy, upstream TIBER, and legacy/heuristic analytics?

The goal is to avoid rebuilding analytics that already exist under another name and to prevent isolated smart features from double-counting the same latent football mechanism. The operating rule is **fewer systems, smarter systems**.

## Existing coverage that must not be duplicated

The repository already has meaningful coverage in these areas:

- rolling prior-game opportunity and Player Outcome Engine v0 work;
- exact scoring fingerprints, quantile/distribution heads, feature provenance, rolling validation, subgroup diagnostics, and lineup-regret evidence work;
- USR-0 point-in-time uncertainty contracts and scenario/conservation semantics;
- WR Route Opportunity Value v2 with route-family expected PPR/route, shrinkage, floor/ceiling, red-zone rate, and confidence;
- route participation, alignment, target share, air yards, TPRR/YPRR and role-bank infrastructure;
- legacy matchup logic for man/zone, one-high/two-high, slot/outside alignment and defensive EPA;
- personnel-grouping infrastructure;
- red-zone target/rush persistence plus richer red-zone consumer requirements;
- xFPTS v1/v2 and xFP/FPOE infrastructure;
- pace, neutral pass rate/PROE seam, coaching/scheme prework, schedule/SoS, weather and game-environment context;
- injury/workload provenance and observed snap reliability;
- market/ownership/VORP/league-context systems;
- role-delta and usage-stability heuristics;
- historical lineup feasibility/regret certification work.

These systems may need modernization or externalization, but a new analytics project must prove incremental value rather than rename the same signal.

## Status vocabulary

- **GOVERNED / ACTIVE:** a current contract or promoted path owns the concept.
- **PARTIAL / LEGACY:** useful evidence exists, but it is heuristic, incomplete, duplicated, stale, or not governed enough for CCF authority.
- **TRUE GAP:** no adequate governed implementation was found.
- **DATA-BLOCKED:** valuable but cannot be responsibly produced from currently governed inputs.
- **DECISION-LAYER GAP:** player evidence exists, but FFCC has not converted it into the relevant fantasy decision utility.

## Comprehensive gap matrix

| Analytic family | Current state | Missing deep layer | Default owner | Priority |
| --- | --- | --- | --- | --- |
| Route-family value | GOVERNED/PARTIAL | Existing WR Route Opportunity Value v2 stops before contextual opponent interaction | governed upstream producer + Forecast/CCF | foundation |
| **Route × coverage responsibility** | TRUE GAP / DATA-BLOCKED | route family × man/zone/shell/responsibility, release, leverage, safety help, defender skill, disguise | Data/tracking producer → Forecast/CCF | **P1** |
| **Receiver separation / route win context** | TRUE GAP / DATA-BLOCKED | separation independent of QB, route win rate, target-window quality, press/release performance | Data/tracking producer → Forecast/CCF | **P1** |
| **First-read / designed-target intent** | TRUE GAP | progression priority, first-read share, designed targets, clear-outs/decoys, screen intent | Data/charting producer → Forecast/CCF | **P1** |
| Target quality | PARTIAL | air-yard/EPA inputs do not fully separate throw quality, coverage difficulty, catch-point contest and receiver creation | Data → Forecast/CCF | P2 |
| **Teammate on/off redistribution** | TRUE GAP | conditional route/target/carry/high-value-touch redistribution when a teammate is absent or role-limited | Data → Role/Opportunity → Forecast/CCF | **P1** |
| Target competition | PARTIAL | legacy target-competition paths exist, but no governed conditional allocation model was found | Role/Opportunity | P1 |
| YAC quality | PARTIAL | xYAC is known in the metrics roadmap, but canonical YAC-over-expected opportunity/outcome decomposition is incomplete | Data → Forecast | P2 |
| Catch-point / contested opportunity | TRUE GAP / DATA-BLOCKED | contest difficulty, defender responsibility, catch probability context | tracking producer → Forecast | P3 |
| **Run concept classification** | TRUE GAP / DATA-BLOCKED | zone/duo/power/counter/etc., intended gap vs actual gap, read-option tags | Data/tracking producer → Teamstate/Forecast | **P1** |
| **Run blocking assignments** | TRUE GAP / DATA-BLOCKED | blocker-defender assignment, block type, double teams, penetration, block duration, disruption without tackle | Data/tracking producer → Forecast | **P1** |
| RB yards created vs blocking | TRUE GAP / DATA-BLOCKED | expected rushing outcome conditional on geometry/blocking and yards over expectation | Forecast | P1 |
| Box/front structure | PARTIAL/UNCLEAR | no governed player-level RB scheme-fit interaction with box count/front family was found | Data/Teamstate → Forecast | P2 |
| Contact balance | DATA-BLOCKED | yards after contact, forced missed tackles, tackle probability vs actual | tracking/charting producer | P2 |
| QB designed rush vs scramble | PARTIAL | richer red-zone contract anticipates splits, but a complete governed opportunity model is not active | Data → Role/Opportunity | P2 |
| **Pass protection × pressure** | PARTIAL / DATA-BLOCKED | time-to-pressure, quick-pressure probability, blocker/rusher matchup, chips, doubles, pressure-over-expectation | Data/tracking producer → Forecast | **P1** |
| QB clean-pocket/pressure response | PARTIAL | EPA/CPOE/sack context exists, but no fully governed pressure-state outcome distribution | Forecast | P2 |
| QB progression/read behavior | TRUE GAP / DATA-BLOCKED | read order, time-to-first-read, sack/throwaway/checkdown tradeoff | tracking/charting producer → Forecast | P2 |
| Motion | PARTIAL | personnel exists, but advanced motion type × player opportunity interaction is not governed | Data → Teamstate/Forecast | P2 |
| Formation / alignment interaction | PARTIAL | basic alignment/personnel exists; conditional player outcomes by formation/motion/route are incomplete | Data → Forecast | P2 |
| Play action / screens | PARTIAL | no governed player-level role/output interaction contract found | Data → Teamstate/Forecast | P2 |
| **Playcaller sequencing / tendency breakers** | TRUE GAP | conditional play calls by down-distance/personnel/motion/game state, scripted drives, opponent adaptation | Teamstate | P2 |
| Drive/possession quality | PARTIAL | pace/environment exists; expected drive volume, starting field position and possession distributions can go deeper | Teamstate/Forecast | P2 |
| Expected possessions remaining | TRUE GAP / DATA-BLOCKED | late-game opportunity volume under clock/score state | Teamstate/Forecast | P3 |
| Red-zone leverage | PARTIAL | inside-20 exists; inside-10/5, end-zone, team shares and rolling PIT trends are specified but not fully promoted | Data → Role/Opportunity | P1/P2 |
| Third-down / two-minute role | TRUE GAP | high-leverage route/carry participation more informative than raw snaps | Data → Role/Opportunity | P2 |
| Short-yardage / goal-line role | PARTIAL | richer red-zone contract covers pieces; explicit role-state ownership remains incomplete | Data → Role/Opportunity | P2 |
| **Latent role-state / change-point detection** | TRUE GAP | statistically detect real role changes/regime shifts before box-score consensus; distinguish noise vs new state | Role/Opportunity + USR | **P1** |
| Coaching/regime reset | PARTIAL | prework specifies regime-aware Bayesian updating/reset; upstream producer still required | Teamstate | P1 |
| Injury status truth | GOVERNED/PARTIAL | provenance/checkpoints exist | Data/USR | foundation |
| **Return-to-role / workload ramp** | TRUE GAP | post-injury snap/route/carry recovery curve, role limitation and re-aggravation uncertainty as opportunity state | Data/USR → Forecast | P1/P2 |
| Weather | GOVERNED/PARTIAL | bounded weather doctrine already exists; do not add generic weather bonuses | Data/Forecast | foundation |
| Surface/travel/rest/time-zone | PARTIAL/UNCLEAR | scheduling matrix may own pieces; broad player modifiers require incremental-value proof | Teamstate/Forecast | P3 |
| Officiating | TRUE GAP but LOW PRIORITY | penalty/pace style may matter, but likely weak/unstable for player prediction | research only | P4 |
| **Joint player outcome dependence** | TRUE GAP | teammate/opponent covariance, shared game environment, TD/target competition, QB-pass catcher dependence | Forecast/CCF | **P1** |
| Correlation diagnostics | PARTIAL | feature-correlation tooling exists; that is not a joint predictive distribution | Forecast/CCF | P1 |
| Tail-risk / quantiles | GOVERNED/PARTIAL | Player Outcome supports distribution heads; calibrate rather than add independent boom scores | Forecast/CCF | foundation |
| **Opponent-conditioned lineup win probability** | DECISION-LAYER GAP | maximize matchup win probability/utility from joint distributions, not only sum of means | CCF decision layer | **P1** |
| **Value of information / wait-vs-act** | DECISION-LAYER GAP | quantify waiting for questionable news vs locking alternatives, including kickoff constraints | CCF + USR | P1/P2 |
| Late swap / flex optionality | PARTIAL | kickoff-aware flex preservation is staged; expand only through decision utility | CCF lineup optimizer | P1 |
| Multi-week roster utility | TRUE GAP / DECISION-LAYER | bye/playoff interactions, bench insurance, contingent value, replacement scarcity | Strategy/CCF | P2 |
| Waiver bid utility | PARTIAL/LEGACY | ownership/VORP/waiver context exists; no unified probabilistic bid-vs-replacement model | Strategy | P2 |
| Trade portfolio utility | PARTIAL | trade engines exist but multi-horizon covariance/roster-complementarity is not governed | Strategy | P2/P3 |
| Market disagreement residuals | PARTIAL | Beat Vegas/market intelligence exists; regime-specific CCF-vs-market residual calibration can deepen | CCF challenger/validation | P2 |
| Model drift / concept drift | PARTIAL | rolling validation/subgroups exist; explicit football-regime drift alarms can deepen later | validation | P2 |
| Causal attribution / ablation | PARTIAL | coaching prework requires family-level ablation; extend this to all deep families | validation | **mandatory gate** |
| Scoring-format sensitivity | GOVERNED | exact scoring fingerprint exists; do not duplicate with format-specific heuristic scores | CCF | foundation |
| Spatial counterfactuals | RESEARCH / DATA-BLOCKED | ghost defenders, expected openness, expected YAC space, missed-read counterfactuals | research producer | P4 |
| Tracking speed/acceleration workload | DATA-BLOCKED | burst/decay/contextual athletic state; source access and injury confounding are substantial | research producer | P4 |
| IDP-specific microanalytics | OUTSIDE CURRENT CORE | primary governed scope remains QB/RB/WR/TE; do not widen current certification scope | future lane | held |

## Corrections to earlier assumptions

### xFPTS is not absent
The repository already contains xFPTS v1/v2 services and training infrastructure. The gap is not "build expected fantasy points." The future canonical path must be point-in-time, trained/validated, exact-scoring-aware and free from legacy hand-weight leakage.

### Coverage analytics are not absent
Legacy matchup code already uses man/zone, one-high/two-high and alignment splits. The true gap is route-level and responsibility-level interaction with empirical calibration and no universal hand-coded matchup bonus.

### Role change is not absent
WR advanced metrics contain role-delta and usage-stability heuristics. The true gap is formal latent-state/change-point inference tied to USR uncertainty semantics and coaching/injury regime changes.

### Personnel is not absent
Personnel grouping is already implemented. The gap is causal/conditional player opportunity by personnel, formation, motion and play design.

## Highest-value next research lanes

1. **Receiving Interaction Layer** — route family × coverage responsibility × alignment/release × receiver separation × offensive intent.
2. **Rushing/Trench Interaction Layer** — run concept × intended gap × blocking execution × defensive front × runner outcome above expectation.
3. **Conditional Opportunity Redistribution** — teammate on/off, injury/absence, personnel and role-state transitions; opportunity must conserve at team level.
4. **Latent Role-State Detection** — Bayesian/change-point detection over routes, snaps, first-read/design share, rush share and high-value touches, with explicit regime resets.
5. **Joint Outcome + Decision Utility** — joint player distributions/covariance feeding matchup win probability, late-swap/flex optionality and value-of-information decisions.

These are research/prework priorities, not authorization to widen the current Player Outcome/rolling-validation certification scope.

## Anti-double-counting doctrine

Every new feature must map to a latent mechanism family before model training or decision use. Correlated observations within one family are evidence for a mechanism, not independent fantasy bonuses.

Minimum families:

- TEAM_PLAY_VOLUME
- PASS_RUN_TENDENCY
- PLAYER_PARTICIPATION
- OFFENSIVE_INTENT
- TARGET_ALLOCATION
- RUSH_ALLOCATION
- HIGH_VALUE_OPPORTUNITY
- ROUTE_COVERAGE_INTERACTION
- RUN_SCHEME_BLOCKING
- PASS_PROTECTION_PRESSURE
- PLAYER_EXECUTION
- ROLE_STATE
- INJURY_AVAILABILITY
- GAME_ENVIRONMENT
- MARKET_CHALLENGER
- JOINT_DEPENDENCE
- DECISION_OPTIONALITY

Examples:

- neutral pass rate + PROE + early-down pass rate belong to one PASS_RUN_TENDENCY family;
- routes + snap share + route participation are mostly PLAYER_PARTICIPATION;
- target share + first-read share + designed-target share require allocation/intent separation;
- red-zone targets, end-zone targets and inside-10 shares belong to HIGH_VALUE_OPPORTUNITY;
- man/zone rate alone is not an additive player bonus when route × coverage interaction already consumes it.

## Promotion gates

No family may influence production CCF recommendations until all applicable gates pass:

1. canonical ownership;
2. point-in-time provenance (known_at <= decision cutoff);
3. explicit unavailable/partial/observed coverage semantics;
4. exact identity binding and versioned source;
5. leakage-safe historical freeze;
6. latent-family mapping and anti-double-counting;
7. sample/reliability policy with shrinkage or abstention;
8. regime reset semantics;
9. repeatable family-level ablation over native baseline;
10. probability/distribution calibration where applicable;
11. subgroup safety by position/archetype/scoring/regime;
12. negative controls;
13. TIBER-off replay;
14. no final-holdout peeking;
15. separate explicit promotion after prework/research.

## Source availability and blockers

Many P1 interactions require richer tracking or charting than nflverse PBP can provide reliably. Do not fabricate them from air yards, alignment, box-score or nearest-defender proxies.

Potential evidence classes must be qualified separately:

- NFL tracking-derived classifications and responsibility models;
- licensed/manual route, coverage, first-read and separation charting;
- canonical nflverse PBP/participation fields where semantics are sufficient;
- team/coach regime reports produced upstream;
- injury/workload observations with decision-time snapshots.

If a source cannot be archived with stable provenance and point-in-time semantics, it may remain a research challenger but cannot silently become native CCF truth.

## External benchmark evidence reviewed

This audit was compared against the current public analytics frontier, including NFL Next Gen Stats work on coverage responsibility, advanced motion, chip blocks, pressure probability, Route Classification 2.0, run-scheme classification and run-blocking assignments; the 2026 NFL Big Data Bowl player-movement/ghost-defender work; and Fantasy Points Data Suite 2.0 surfaces for teammate on/off splits, coverage, formation, personnel, motion, pressure, routes, alignment, first-read share and receiver separation.

External analytics are benchmarks/challengers, not recommendation authority.

## Execution decision

Do now:

- preserve this audit as the canonical "do not duplicate / true gap" map;
- create a held-prework evidence contract for the gap families and point-in-time eligibility;
- keep all new families inert and outside runtime imports;
- require future scoped work to name producer ownership, evidence source, latent family and promotion gate.

Do not do now:

- widen the frozen Player Outcome / rolling-validation certification scope;
- alter CCF recommendation authority;
- add hand-coded route/coverage/run-scheme multipliers;
- fabricate tracking-only fields from nflverse proxies;
- open the final holdout;
- create a new permanent in-repo model brain for each analytic family.

## Revisit trigger

Promote an individual research lane from held prework only when the current frozen certification lane permits a new scoped candidate, its upstream producer/source is qualified, a leakage-safe historical slice exists, an ablation-ready baseline and preregistered validation protocol are frozen, and the analytic demonstrates repeatable incremental decision value.
