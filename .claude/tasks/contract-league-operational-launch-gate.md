# Contract League Operational Launch Gate

## Purpose

Define the minimum evidence required before FFCC may treat a private contract league as operational rather than merely modeled. This gate is deliberately fail-closed: a league may still be inspected when a source is incomplete, but scoring-dependent or contract-dependent decisions must abstain until their required evidence is valid.

## Non-negotiable boundaries

- Private workbook contents, identifiers, credentials, league names, rule values, and roster data are runtime/private state and do not belong in public repository fixtures or defaults.
- Canonical football outcome distributions remain separate from league scoring and contract economics.
- Platform state, contract-workbook state, league policy, rights state, and market/pricing witnesses retain independent authority/provenance.
- No generic PPR, contract rule, market price, or transaction consequence may be silently substituted for unavailable league-specific evidence.
- Hypothetical engines are read-only. A simulation never mutates authoritative league state.
- Merge/deploy/production activation follows the repository's normal human-authority gate.

## Gate 0 — branch and regression integrity

Required before review can advance:

- feature branch contains current `main` history (`behind_by = 0`);
- PR is conflict-free / mergeable;
- governed Weekly Decision runtime remains present and CCF-Forecast remains weekly tail authority;
- Command Center certification includes both weekly-runtime and contract-league regressions;
- contract-league production TypeScript target passes;
- browser/resilience and mobile/PWA gates remain green where applicable;
- no private-source material appears in public diffs/tests/docs.

## Gate 1 — persistence migration

Required before real contract snapshots can be stored:

- Drizzle generates a checked-in migration for `contract_league_snapshots` from the declared schema;
- migration-drift CI reports no uncommitted generated changes;
- migration applies cleanly in a disposable/authorized database environment;
- append-only create/read/idempotency/supersession smoke tests pass against a real PostgreSQL database;
- historical snapshots remain readable after a newer snapshot is inserted;
- `PARTIAL`/`REJECTED` state cannot become decision authority through the default read path.

Database credentials and real private data must never be committed to satisfy this gate.

## Gate 2 — authorized private-source acquisition

Required separately for each private league:

- an authorized runtime integration/export path can read the source workbook without embedding credentials or Drive identifiers in public source;
- source acquisition records an observed as-of/modified timestamp and opaque private source reference;
- workbook parsing uses the governed three-row importer (or an explicitly versioned successor);
- ordinal season labels have explicit authoritative calendar mappings;
- source totals reconcile to imported contract + dead-cap totals or the snapshot remains non-`VALID`;
- unresolved player identity remains unresolved rather than fuzzy-matched;
- repeated identical imports are idempotent and materially changed imports create append-only lineage.

## Gate 3 — league rules, scoring, and rights

Required independently for every decision family:

- scoring and lineup settings are exact and certified for lineup/waiver/trade decisions;
- contract-policy profile has explicit provenance, version/effective date, and `VALID` status for the rule being exercised;
- scarce-right state is current and league-bound when a move consumes a right;
- source conflicts remain blocking for the affected rule until explicitly resolved;
- missing rule families do not inherit values from another league/platform;
- pricing/tag/re-sign/option/auction witnesses satisfy known-at timing before use.

A league can be operational for one decision family while another family remains unavailable.

## Gate 4 — decision orchestration

Required before contract advice is presented as executable decision support:

- Unified League Context includes the correct scoring identity and fresh economic snapshot;
- Canonical Decision Packet freezes policy version/fingerprint, economic snapshot fingerprint, scoring identity, action, legality output, cap consequences, materially missing evidence, and exact as-of time;
- deterministic transaction engine owns legality/cap math; CCF consumes those consequences rather than reimplementing them;
- football value, contract value, and flexibility value remain separately explainable;
- challenger models may critique but cannot mutate frozen league state;
- unavailable critical evidence produces abstention, not a recommendation with hidden defaults.

## Gate 5 — operator usability

Required before calling the feature fully usable by a novice contract manager:

- current and future cap trajectory is visible;
- cap space is distinguished from spendable cap/reserves;
- expiring obligations, dead cap, guaranteed exposure, and scarce rights are visible;
- keep/cut/trade/restructure/re-sign/tag/option/free-agent scenarios show before/delta/after consequences when supported;
- rule citations and plain-language explanations accompany legality/abstention;
- upcoming lifecycle/deadline risks are surfaced without creating a duplicate watcher stack;
- War Room presentation never implies unsupported precision when market history or rules are insufficient.

## Gate 6 — private-league launch certification

A private league is `OPERATIONAL` only when all decision families claimed by the product have passed their applicable gates on one frozen certification packet.

The launch record must include:

- code head SHA;
- database migration/schema version;
- economic snapshot id/fingerprint/as-of;
- scoring profile fingerprint/as-of;
- policy fingerprint/effective date;
- rights-state fingerprint/as-of when applicable;
- importer/source version;
- regression/CI results;
- explicit list of supported decision families;
- explicit list of unavailable/abstaining decision families;
- privacy audit result;
- human authority reference for any consequential merge/deploy/activation.

## Current sequencing

1. Keep PR rebased/reconciled with `main` and certify the exact head.
2. Eliminate Drizzle migration drift and certify the real database path.
3. Establish authorized private workbook acquisition without publishing source identifiers/data.
4. Materialize and validate each private league's scoring, policy, season mapping, and rights state.
5. Persist first real snapshots and freeze launch packets.
6. Wire contract context through Canonical Decision Packet / CCF orchestration for supported decisions.
7. Finish novice-facing War Room presentation.
8. Only then classify each league and decision family as operational.
