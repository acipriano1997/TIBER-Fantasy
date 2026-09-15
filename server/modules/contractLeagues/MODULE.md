# Contract Leagues

## Purpose

Define the normalized application boundary for user-specific salary-cap / contract-league state without making TIBER-Fantasy the authority for canonical NFL player identity, source-workbook truth, or league-constitution truth.

Contract support has separate responsibilities:

1. represent a replayable snapshot of current economic/competitive state;
2. represent league policy independently from current state;
3. preserve scarce-right history as immutable events;
4. evaluate hypothetical moves deterministically under frozen, known-at evidence;
5. translate football outcomes through exact league scoring before lineup/recommendation logic.

Do not collapse those responsibilities into one schema or score.

## Source boundary

Private league workbooks or platform exports are **source inputs**. Source-specific parsing must occur before `contract-league-snapshot.v1` and must preserve:

- source league/team/player labels for auditability;
- exact season mapping;
- guaranteed, optional, and cap-hit money separately;
- dead cap and special roster states;
- negative cap remaining when the source says a team is over cap;
- unresolved player identity rather than guessed canonical IDs;
- source provenance and import timestamps;
- validation warnings and unresolved fields.

Do not commit private roster/contract data, Drive file IDs, private source URLs, or private league-rule values to this public repository.

## Ownership

- Canonical NFL player IDs remain owned by the governed identity layer / TIBER-Data.
- CCF owns football outcome distributions, fantasy decision modeling, uncertainty, and recommendation authority.
- Platform adapters own platform league identity/settings and NFL roster state when available.
- Private workbooks may supplement contract economics and contract-specific states that the platform does not represent.
- League constitutions/rules sources own custom league-policy truth when platform settings are insufficient.
- TIBER-Fantasy owns the user-facing normalized snapshot boundary, application persistence, versioned contract-league policy representation, scarce-right ledger, legal lineup translation, and deterministic transaction-consequence layer.

## State vs policy

A snapshot answers **what is true now**:

- contract schedule;
- guarantees/options/cap hit;
- dead cap;
- team cap ledger;
- roster/economic state;
- scoring/lineup context;
- provenance and unresolved fields.

A policy profile answers **what transformations are legal and how they change state**:

- cap enforcement and compliance windows;
- contract lengths/structures and acquisition-specific rules;
- cut/dead-cap consequences;
- retained salary / cap loans / transferable dead cap where allowed;
- extension, re-sign, restructure, option, amnesty, tag/RFA rights;
- rookie contract rules;
- roster-slot cap treatment;
- auction/bid legality;
- trade/pick/roster constraints;
- lifecycle deadlines and rule-effective dates.

`contract-league-snapshot.v1` remains stable rather than absorbing policy merely because a private league or external platform exposes a new rule. Policy is separately versioned and provenance-aware.

## Persistence boundary

Validated contract snapshots have an append-only application persistence boundary:

- table: `contract_league_snapshots` in modular `shared/contractLeagueSchema.ts`;
- service: `server/modules/contractLeagues/persistence.ts`;
- canonicalization/fingerprint contract: `server/modules/contractLeagues/persistenceContract.ts`;
- identity: an explicit internal `leagueKey` supplied by the caller, never guessed from workbook labels;
- idempotency: `(leagueKey, fingerprint)` uniquely identifies the same normalized decision-relevant state;
- lineage: materially new state inserts a new row and records `supersedesSnapshotId`; there is no application update path;
- replay: every persisted row retains the validated normalized payload and validation/provenance metadata;
- authority: `VALID` snapshots are eligible for the default decision read path, while `PARTIAL` snapshots remain replayable/auditable but cannot silently become recommendation authority;
- rejection: a `REJECTED` snapshot cannot be persisted as decision state;
- privacy: persisted source references are opaque private tokens. Public workbook URLs/IDs and private contents do not belong in repository fixtures or logs.

The fingerprint excludes volatile import/provenance timestamps and source display/locator changes, and normalizes non-semantic source ordering. Re-importing unchanged logical state therefore resolves to the existing immutable row instead of creating false history.

Drizzle Kit includes both `shared/schema.ts` and `shared/contractLeagueSchema.ts`. Database activation still requires the normal generated-Drizzle migration and database certification path; no hand-written raw SQL migration is authorized by this module.

## Private workbook importer

`importers/threeRowWorkbook.ts` implements the audited workbook-family boundary used by the two private contract leagues without embedding either league's private contents.

It understands:

- one roster/team sheet at a time;
- guaranteed, optional, and cap-hit player rows;
- ordinary IR and season-ending IR labels;
- dead-cap side tables;
- authoritative Total Guaranteed / Total Cap Hit / Cap after Guarantees / Cap Remaining rows;
- negative cap remaining;
- explicit calendar-year headers.

It fails closed on ordinal season headers unless an explicit per-sheet calendar map is supplied, and requires governed canonical-player bindings rather than fuzzy name matching. Cap reconciliation mismatches remain explicit unresolved evidence instead of being auto-corrected.

## Scoring and lineup decisions

Football outcome distributions and league scoring are separate layers:

```text
football outcome distribution
-> explicit league scoring translation
-> legal lineup-slot optimization
-> recommendation / explanation
```

A scoring profile must be explicit. Decision code must not silently substitute generic PPR when league scoring is missing or unresolved.

`lineupOptimizer.ts` now provides the contract-league legal lineup primitive. It respects explicit position/slot eligibility including FLEX/SUPERFLEX, supports expected/floor/median/ceiling objectives, preserves candidate uncertainty, and emits a lineup-level joint distribution only when scenario IDs/probabilities are aligned. The legacy Start/Sit path remains classified `EXTRACT`; do not broaden it with parallel recommendation logic.

## Policy and scarce rights

`policy.ts` defines `contract-league-policy.v1`. It can represent generic cap, roster, contract-structure, rookie-scale, restructure, re-sign, amnesty, tag, cut/release, trade, free-agency, and lifecycle semantics without hard-coding either private league's rule values.

CUT policy is explicit. Guaranteed and optional money each choose one of three dispositions: clear on release, become dead cap on the original schedule, or accelerate into the current season. Policy also states whether resulting dead cap belongs in the league's guaranteed-money ledger. A missing cut treatment remains `null` and therefore unavailable; no NFL-style default is implied.

`rights.ts` defines `contract-league-rights-state.v1`. Scarce rights such as amnesty/re-sign/restructure/tag usage are immutable usage/reset events. Remaining availability is derived from those events plus the applicable policy allowance; there is no mutable magic `usesLeft` counter.

Private league policy values and right histories belong in authorized runtime/private data, not repository fixtures.

## Deterministic transaction consequences

`transactionEngine.ts` defines the pure `contract-transaction-engine.v1.1` kernel. It consumes validated state/policy plus exact lifecycle context and produces read-only economic/roster deltas. It applies deltas to the authoritative imported ledger instead of rebuilding league cap truth from generic assumptions.

The current bounded action surface includes:

- KEEP/no-op replay;
- CUT / release when policy explicitly supplies guaranteed/optional dead-cap treatment;
- player TRADE between explicitly bound teams;
- policy-limited retained guaranteed salary where the affected cap hit is safely decomposable;
- AMNESTY when policy and immutable rights state fully authorize its financial treatment;
- IR / season-ending-IR placement when external eligibility has already been verified.

CUT simulation supports clear-on-release, scheduled dead cap, current-season acceleration, roster removal, reserve-slot clearing, reacquisition/nomination cooldowns, and the league-specific choice of whether dead cap contributes to the guaranteed ledger. It requires authoritative cap-ledger coverage for every affected current/future season and requires cap hit to decompose to guaranteed + optional money; otherwise it abstains rather than inventing release math.

The kernel exposes legality, violations, current/future before/delta/after cap views, roster effects, scarce-right consumption, follow-up approval/cooldown requirements, and a deterministic fingerprint. It never mutates the imported snapshot.

## Known-at / anti-leakage boundary

`transactionDecisionBoundary.ts` wraps the pure kernel for decision-time eligibility. It rejects evidence that was imported or source-modified after the frozen decision timestamp, rejects future rights `asOf` state, and rejects scarce-right state belonging to a different internal league key.

This separation is deliberate:

```text
source/provenance eligibility + exact as-of time
-> known-at decision boundary
-> deterministic legality/economic kernel
-> CCF contract-aware recommendation layer
```

Historical replay therefore cannot silently consume evidence that only became available later.

## Scenario safety

War Room / what-if simulations are read-only hypothetical state. They must:

- never mutate authoritative imported/platform state;
- expose rule violations rather than auto-correcting them;
- show current and future cap deltas;
- preserve scarce-right consumption in the simulated branch;
- carry a deterministic fingerprint so a scenario can be replayed;
- abstain when required policy/source/lifecycle evidence is unavailable.

## Certification

Command Center Certification has a dedicated contract-league production typecheck (`tsconfig.contract-leagues.json`, ES2022 runtime target) and runs the complete `server/modules/contractLeagues/__tests__` suite. This is separate from the repository's recorded legacy typecheck debt rather than weakening either gate.

Synthetic fixtures only are permitted for contract-league repository tests. The CUT/dead-cap matrix covers missing policy, clear-on-release, scheduled dead cap, accelerated dead cap, guaranteed-ledger treatment, missing future cap-ledger coverage, and unreconcilable contract cap-hit decomposition.

## Current state

Implemented on the contract-league foundation branch:

- normalized `contract-league-snapshot.v1` boundary;
- fail-closed exact league-scoring adapter;
- append-only/idempotent snapshot persistence contract and service;
- `VALID`-only default decision retrieval;
- audited three-row private-workbook importer boundary;
- `contract-league-policy.v1` generic policy representation;
- immutable scarce-right event ledger and availability derivation;
- exact scoring-aware legal lineup optimizer;
- deterministic transaction kernel for KEEP, CUT/dead-cap treatment, trade/retention, amnesty, and verified reserve placement;
- known-at/anti-leakage transaction wrapper;
- dedicated production typecheck and complete contract regression CI gate;
- synthetic regression coverage only; no private league state/rules are committed.

Still gated follow-on work:

- generated migration + database certification for the persistence table;
- authorized runtime acquisition of the two private workbook sources;
- verified platform league/team/player binding and source-authority conflict handling;
- private versioned policy/right profiles for each league (including authoritative cut treatment; one league still lacks an authoritative rules/scoring source in the audited inputs);
- restructure, re-sign, tags/options, free-agent/auction, dead-cap transfer, and remaining transaction transformations;
- league-local contract-market/surplus valuation;
- Contract League War Room presentation and CCF/Canonical Decision Packet integration.

The durable follow-on scope lives in `.claude/tasks/contract-league-persistence-and-scoring.md`.