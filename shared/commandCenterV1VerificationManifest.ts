export type CommandCenterV1VerificationStatus = 'certified' | 'partial' | 'not_started';

export type CommandCenterV1VerificationCapabilityId =
  | 'immutable_decision_receipts'
  | 'frozen_as_of_replay'
  | 'deterministic_invariants'
  | 'independent_challenger'
  | 'golden_traces'
  | 'postgame_process_evaluation'
  | 'adversarial_red_team';

export type CommandCenterV1VerificationCapability = {
  id: CommandCenterV1VerificationCapabilityId;
  label: string;
  status: CommandCenterV1VerificationStatus;
  scope: string;
  reason: string;
  evidence: string[];
};

export const COMMAND_CENTER_V1_VERIFICATION: Readonly<
  Record<CommandCenterV1VerificationCapabilityId, CommandCenterV1VerificationCapability>
> = {
  immutable_decision_receipts: {
    id: 'immutable_decision_receipts',
    label: 'Immutable decision receipts',
    status: 'certified',
    scope: 'Weekly Decisions v1 application/runtime boundary',
    reason: 'Weekly Decisions produce tamper-evident content-addressed receipts and persist them through an insert/read-only repository into a Postgres append-only table. Database ALWAYS triggers reject UPDATE, DELETE, and TRUNCATE, and Gate 2 CI proves those mutation paths fail against real Postgres. Schema-administrator DDL remains an explicitly out-of-band operational authority, not an application mutation path.',
    evidence: [
      'server/services/weeklyDecisionLedger.ts',
      'server/services/weeklyDecisionLedgerRepository.ts',
      'migrations/0016_weekly_decision_ledger_append_only.sql',
      'server/services/__tests__/weeklyDecisionLedger.test.ts',
      'server/services/__tests__/weeklyDecisionLedgerPersistence.integration.test.ts',
    ],
  },
  frozen_as_of_replay: {
    id: 'frozen_as_of_replay',
    label: 'Frozen as-of replay',
    status: 'certified',
    scope: 'Weekly Decisions v1',
    reason: 'Replay verifies frozen hashes first, then re-evaluates only the captured context; live data and wall-clock access are explicitly disallowed and malformed persisted payloads fail closed.',
    evidence: [
      'server/services/weeklyDecisionLedger.ts',
      'server/services/__tests__/weeklyDecisionLedger.test.ts',
    ],
  },
  deterministic_invariants: {
    id: 'deterministic_invariants',
    label: 'Deterministic invariants',
    status: 'certified',
    scope: 'Gate 0 Management truth + Weekly Decisions + frozen replay',
    reason: 'A single canonical invariant catalog now binds every active personal-v1 truth boundary to an executable proof. The suite covers scoped user/league identity, external league/roster/owner identity, observed roster and starter geometry, FORGE freshness/coverage degradation, weekly context/scoring/roster/lineup identity, legality/locks, canonical player identity, as-of validity, tail completeness, authoritative lineage, and ledger tamper/deterministic replay. Malformed Sleeper owner/starter/membership state fails closed rather than being normalized.',
    evidence: [
      'shared/commandCenterV1InvariantManifest.ts',
      'server/services/__tests__/commandCenterV1InvariantReplay.test.ts',
      'server/services/leagueDashboardTruthBoundary.ts',
      'shared/weeklyDecisionContract.ts',
      'server/services/weeklyDecisionLedger.ts',
    ],
  },
  independent_challenger: {
    id: 'independent_challenger',
    label: 'Independent challenger',
    status: 'certified',
    scope: 'Weekly Decisions v1 audit boundary',
    reason: 'A deliberately simpler incumbent-preservation challenger evaluates only verified unlocked starter/bench geometry. It consumes no Forecast quantiles, FORGE, rankings, ADP, calibration output, or source receipts. Agreement/disagreement is audit evidence only and is explicitly forbidden from increasing confidence or taking final action authority from the human.',
    evidence: [
      'shared/weeklyDecisionChallenger.ts',
      'server/services/__tests__/weeklyDecisionChallenger.test.ts',
      'server/services/__tests__/golden/weeklyDecisionGate2GoldenTraces.ts',
      'server/services/__tests__/weeklyDecisionGoldenTraces.test.ts',
    ],
  },
  golden_traces: {
    id: 'golden_traces',
    label: 'Golden traces',
    status: 'certified',
    scope: 'Weekly Decisions v1',
    reason: 'A frozen trace pack covers admitted keep, admitted swap, missing-tail abstention, locked-slot abstention, and source-laundering rejection. Every trace must reproduce champion semantics, challenger relation, and exact frozen ledger replay behavior.',
    evidence: [
      'server/services/__tests__/golden/weeklyDecisionGate2GoldenTraces.ts',
      'server/services/__tests__/weeklyDecisionGoldenTraces.test.ts',
      'server/services/weeklyDecisionLedger.ts',
    ],
  },
  postgame_process_evaluation: {
    id: 'postgame_process_evaluation',
    label: 'Postgame process evaluation',
    status: 'not_started',
    scope: 'Weekly Decisions v1',
    reason: 'No release-certified evaluator yet grades calibration/process quality against realized outcomes while preserving the original as-of evidence packet.',
    evidence: [],
  },
  adversarial_red_team: {
    id: 'adversarial_red_team',
    label: 'Adversarial red team',
    status: 'certified',
    scope: 'Gate 0 + Gate 1 + Weekly Decisions v1 verification boundary',
    reason: 'Executable attacks cover context bleed, stale/sparse evidence, unsupported legacy authority, receipt mutation, malformed persisted receipts, as-of drift, invalid hashes, direct ledger mutation, source laundering, model/version clock mismatch, invalid publication/freshness/coverage, malformed Sleeper owner/roster/starter geometry, and correlated-agreement risk. The challenger is structurally no-model and agreement can never promote confidence.',
    evidence: [
      'server/services/__tests__/leagueDashboardTruthBoundary.test.ts',
      'server/services/__tests__/commandCenterV1InvariantReplay.test.ts',
      'server/services/__tests__/commandCenterV1SurfaceManifest.test.ts',
      'server/services/__tests__/weeklyDecisionLedger.test.ts',
      'server/services/__tests__/weeklyDecisionLedgerPersistence.integration.test.ts',
      'server/services/__tests__/weeklyDecisionSourceLineage.test.ts',
      'server/services/__tests__/weeklyDecisionChallenger.test.ts',
      'server/services/__tests__/weeklyDecisionGoldenTraces.test.ts',
    ],
  },
} as const;

export const COMMAND_CENTER_V1_GATE2_REQUIRED_CAPABILITIES: readonly CommandCenterV1VerificationCapabilityId[] = [
  'immutable_decision_receipts',
  'frozen_as_of_replay',
  'deterministic_invariants',
  'independent_challenger',
  'golden_traces',
  'postgame_process_evaluation',
  'adversarial_red_team',
] as const;

export function isCommandCenterV1Gate2Complete(): boolean {
  return COMMAND_CENTER_V1_GATE2_REQUIRED_CAPABILITIES.every(
    (id) => COMMAND_CENTER_V1_VERIFICATION[id].status === 'certified',
  );
}
