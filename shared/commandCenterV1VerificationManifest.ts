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

/**
 * Gate 2 is intentionally stricter than feature availability. A capability is
 * only `certified` when the active v1 path has executable evidence for it.
 * Partial coverage never promotes the overall gate.
 */
export const COMMAND_CENTER_V1_VERIFICATION: Readonly<
  Record<CommandCenterV1VerificationCapabilityId, CommandCenterV1VerificationCapability>
> = {
  immutable_decision_receipts: {
    id: 'immutable_decision_receipts',
    label: 'Immutable decision receipts',
    status: 'certified',
    scope: 'Weekly Decisions v1',
    reason: 'Weekly Decisions can be frozen with full context, result, source lineage, as-of metadata, and canonical SHA-256 integrity hashes.',
    evidence: [
      'server/services/weeklyDecisionLedger.ts',
      'server/services/__tests__/weeklyDecisionLedger.test.ts',
    ],
  },
  frozen_as_of_replay: {
    id: 'frozen_as_of_replay',
    label: 'Frozen as-of replay',
    status: 'certified',
    scope: 'Weekly Decisions v1',
    reason: 'Replay verifies frozen hashes first, then re-evaluates only the captured context; live data and wall-clock access are explicitly disallowed.',
    evidence: [
      'server/services/weeklyDecisionLedger.ts',
      'server/services/__tests__/weeklyDecisionLedger.test.ts',
    ],
  },
  deterministic_invariants: {
    id: 'deterministic_invariants',
    label: 'Deterministic invariants',
    status: 'partial',
    scope: 'Gate 0 league truth + Weekly Decisions contract',
    reason: 'Roster identity, observed starters, context receipts, legality, lock state, scoring identity, canonical identity, and evidence compatibility are guarded, but Gate 2 has not yet unified every active release invariant under one replay suite.',
    evidence: [
      'server/services/leagueDashboardTruthBoundary.ts',
      'shared/weeklyDecisionContract.ts',
    ],
  },
  independent_challenger: {
    id: 'independent_challenger',
    label: 'Independent challenger',
    status: 'not_started',
    scope: 'Weekly Decisions v1',
    reason: 'A deliberately simpler and methodologically different challenger has not yet been attached to the frozen weekly replay path.',
    evidence: [],
  },
  golden_traces: {
    id: 'golden_traces',
    label: 'Golden traces',
    status: 'partial',
    scope: 'Active v1 surfaces',
    reason: 'Focused contract fixtures exist, but Gate 2 still needs explicit frozen golden trace artifacts covering admitted and fail-closed outcomes.',
    evidence: [
      'server/services/__tests__/weeklyDecisionContract.test.ts',
      'server/services/__tests__/leagueDashboardTruthBoundary.test.ts',
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
    status: 'partial',
    scope: 'Gate 0 + Gate 1 + weekly ledger integrity',
    reason: 'Current tests attack context bleed, stale/sparse evidence, unsupported authority, and receipt mutation; correlated-model agreement and source-laundering cases still need explicit Gate 2 coverage.',
    evidence: [
      'server/services/__tests__/leagueDashboardTruthBoundary.test.ts',
      'server/services/__tests__/commandCenterV1SurfaceManifest.test.ts',
      'server/services/__tests__/weeklyDecisionLedger.test.ts',
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
