# Contract Leagues

## Purpose

Define the normalized application boundary for user-specific salary-cap / contract-league state without making TIBER-Fantasy the authority for canonical NFL player identity, private workbook truth, or league-constitution truth.

Contract support keeps five responsibilities separate:

1. replayable current economic/competitive state;
2. versioned league policy independent from state;
3. immutable scarce-right history;
4. deterministic hypothetical transaction consequences under frozen known-at evidence;
5. exact league-scoring translation before lineup/recommendation logic.

CCF remains the owner of football/fantasy distributions, uncertainty, decision ranking, and final recommendation authority.

## Privacy and source boundary

Private league workbooks, platform exports, constitutions, calculators, and commissioner tables are source inputs. They must be normalized before public application boundaries and preserve provenance, unresolved values, exact season mapping, money components, dead cap, special roster state, and negative cap remaining where authoritative sources contain it.

Do not commit private roster/contract data, source URLs or IDs, league names, private policy values, or live rate tables as public defaults or repository fixtures. The contract-rule registry is empty by default and receives authorized private/runtime profile injection. Repository tests use synthetic profiles only.

## Ownership

- Canonical NFL player identity: governed identity layer / TIBER-Data.
- CCF: football/fantasy value, uncertainty, roster marginal value, and recommendation authority.
- Platform adapters: platform league identity/settings and platform roster state.
- Private workbooks: supplemental contract economics/state not represented by the platform.
- Constitutions/calculators/commissioner sources: league-specific policy and price evidence where authoritative.
- TIBER-Fantasy: normalized snapshot, persistence boundary, policy representation, scarce-right ledger, exact scoring/lineup translation, and deterministic transaction-consequence engines.

## State vs policy

`contract-league-snapshot.v1` answers **what is true now**: contract schedules, guarantees/options/cap hits, dead cap, team cap ledger, roster/economic state, scoring/lineup context, provenance, and unresolved evidence.

`contract-league-policy.v1` answers **what transformations are legal and how they change state**: cap enforcement, contract terms/structures, cut treatment, retained salary, restructure/re-sign/tag rights, roster-state treatment, auction/bid rules, and lifecycle windows.

State and policy must remain separately versioned and provenance-aware.

## Persistence boundary

Validated snapshots use append-only persistence through:

- `shared/contractLeagueSchema.ts`;
- `server/modules/contractLeagues/persistence.ts`;
- `server/modules/contractLeagues/persistenceContract.ts`.

An explicit internal `leagueKey` is supplied by the caller and never guessed. `(leagueKey, fingerprint)` provides idempotency; materially new state creates a superseding immutable row. `VALID` snapshots are eligible for the default decision path, while `PARTIAL` remains auditable but cannot silently drive recommendations. Database activation still requires generated Drizzle migration + database certification.

## Private workbook importer

`importers/threeRowWorkbook.ts` handles the audited private-workbook family without embedding private source contents. It understands guaranteed/optional/cap-hit rows, reserve labels, dead-cap side tables, authoritative cap totals, negative cap remaining, and explicit calendar headers.

Ordinal headers require explicit calendar mapping. Canonical identity requires governed bindings. Reconciliation mismatches remain unresolved evidence rather than being auto-corrected.

## Scoring and lineup decisions

The decision chain remains:

```text
football outcome distribution
-> explicit league scoring translation
-> legal lineup-slot optimization
-> CCF recommendation / explanation
```

Missing scoring never falls back to generic PPR. `lineupOptimizer.ts` supports exact slot eligibility including FLEX/SUPERFLEX, expected/P10/P50/P90 objectives, player uncertainty, and joint lineup distributions only when scenarios align.

## Policy and scarce rights

`policy.ts` defines `contract-league-policy.v1`. `rights.ts` defines `contract-league-rights-state.v1` as immutable usage/reset events with derived availability; there is no mutable `usesLeft` truth.

CUT policy explicitly controls guaranteed/optional disposition, dead-cap schedule/acceleration, and guaranteed-ledger treatment. Missing financial treatment is unavailable rather than inferred from NFL conventions.

## Deterministic transaction foundation

`transactionEngine.ts` defines `contract-transaction-engine.v1.1`. The bounded certified surface includes:

- KEEP/no-op replay;
- CUT/release with explicit dead-cap policy;
- player TRADE between explicitly bound teams;
- bounded retained guaranteed salary where cap-hit decomposition is authoritative;
- AMNESTY when policy + rights state authorize it;
- IR / season-ending-IR placement after external eligibility verification.

Outputs include legality, violations, before/delta/after cap effects, roster effects, scarce-right consumption, cooldown/approval follow-ups, and deterministic fingerprints. Source state is never mutated.

## RESTRUCTURE

`restructureEngine.ts` and `restructureDecisionBoundary.ts` model policy-defined optional/guaranteed conversion, rounding, minimum guarantee/allocation rules, phase eligibility, scarce-right consumption, whole-team compliance, and future cap consequences. Non-nominal reserve accounting or missing authoritative evidence causes abstention.

## RE-SIGN

`reSignPricingWitness.ts` validates externally resolved authoritative re-sign prices; it does not manufacture market/rank evidence. `reSignActivationPolicy.ts` keeps activation semantics separately versioned. `reSignEngine.ts` currently models `AFTER_CURRENT_CONTRACT` extensions with exact price, structure, term, future cap, eligibility, and scarce-right checks.

`REPLACES_REMAINING_CONTRACT` remains fail-closed until explicit replacement economics are modeled.

## TAG / RFA tendering

`tagOfferWitness.ts` validates authoritative tag/tender pricing and known-at evidence. `tagEngine.ts` models FRANCHISE, TRANSITION, RFA, and CUSTOM tag/tender applications with uses-per-offseason, repeat-player policy, term/start rules, guarantee shares, cap increments, future cap ledgers, cap compliance, and scarce-right effects.

Current RFA support covers tender/application and rights accounting. External offer-sheet matching, final match decisions, and any match-premium settlement remain separate follow-on mechanics and must not be inferred.

## Contract OPTIONS

`optionExerciseWitness.ts` owns authoritative exercise/decline outcomes and decision-window evidence. `optionEngine.ts` applies those witnessed resulting contract years to deterministic cap deltas.

This is intentionally witness-driven: FFCC does not assume that all leagues interpret “optional money” or option exercise/decline the same way.

## FREE AGENCY / AUCTION

`freeAgentAuctionState.ts` represents authoritative nomination/open/settled/cancelled auction state and provenance.

`freeAgencyEngine.ts` separates:

- **bid legality** — term/structure/distribution, increments, cap basis, roster limits, cap compliance, and auction close time;
- **settlement** — roster/cap acquisition only after an authoritative `SETTLED` witness identifies the winning team and terms.

FFCC does not decide whether an open bid beats another bid unless an authoritative auction rule/state producer resolves that fact.

`auctionClock.ts` projects reset/no-reset close times from explicit `bidWindowHours` + `resetsOnNewBid` policy without mutating authoritative state.

## Known-at / anti-leakage

Decision paths reject evidence imported, observed, or source-modified after the frozen decision timestamp and reject cross-league state. Missing source/policy/lifecycle evidence produces explicit abstention.

```text
source/provenance eligibility + exact as-of time
-> deterministic legality/economic kernel
-> CCF contract-aware recommendation layer
```

## Scenario safety

War Room / what-if simulations are read-only branches. They must never mutate authoritative state, must expose rule violations and assumptions, show current/future cap effects, preserve scarce-right consumption, carry deterministic fingerprints, and abstain when required evidence is unavailable.

## Certification

Command Center Certification includes a dedicated ES2022 contract production typecheck (`tsconfig.contract-leagues.json`) plus the complete `server/modules/contractLeagues/__tests__` suite. Synthetic fixtures only are permitted.

Exact certified code head as of 2026-09-15: `59a8922d9f506e0404f59b3096596c876cc2a7fe`.

That head passed:

- Core Build #549;
- Command Center Browser & Resilience #491;
- Command Center Gate 4 iPhone PWA #110;
- Command Center Certification #539, including Gate 0 regressions, contract production typecheck, full contract regression suite, and application build.

## Current state

Implemented on the contract-league foundation branch:

- normalized snapshot + append-only persistence contract;
- private-workbook importer boundary;
- exact league scoring + legal lineup optimizer;
- generic versioned policy + immutable rights ledger;
- KEEP, CUT/dead cap, bounded TRADE/retention, AMNESTY, and reserve-placement consequences;
- known-at transaction boundary;
- RESTRUCTURE;
- RE-SIGN after current contract;
- FRANCHISE / TRANSITION / RFA / CUSTOM tender/tag application;
- witness-driven option exercise/decline;
- free-agent bid legality + authoritative settled acquisition;
- auction clock reset/no-reset projection;
- privacy-safe runtime-injected contract profile registry;
- dedicated contract typecheck and full synthetic regression CI.

Still gated / intentionally incomplete:

- generated database migration + database certification;
- authorized private runtime workbook acquisition/sync and profile materialization;
- unresolved private source conflicts;
- replacement-of-remaining-years re-sign semantics;
- full RFA/transition external offer-sheet matching/final match settlement;
- nomination-per-day history/enforcement and league-specific nomination queues;
- `fullyOptionalMaxPricing` enforcement where defined;
- specialized dead-cap transfer/cap-space trade mechanics beyond the bounded trade kernel;
- league-local market/surplus calibration;
- Contract League War Room UI and complete Canonical Decision Packet / CCF orchestration.

The durable follow-on scope remains in `.claude/tasks/contract-league-persistence-and-scoring.md`.