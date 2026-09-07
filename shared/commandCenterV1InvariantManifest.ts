export type CommandCenterV1InvariantId =
  | 'scoped_user_identity'
  | 'league_ownership_identity'
  | 'external_league_identity'
  | 'external_roster_identity'
  | 'external_owner_identity'
  | 'observed_roster_geometry'
  | 'observed_starter_truth'
  | 'forge_freshness_and_coverage'
  | 'weekly_context_identity'
  | 'weekly_scoring_identity'
  | 'weekly_roster_lineup_identity'
  | 'weekly_legality_and_lock_state'
  | 'weekly_canonical_player_identity'
  | 'weekly_as_of_boundary'
  | 'weekly_tail_completeness'
  | 'weekly_authoritative_lineage'
  | 'weekly_ledger_integrity_and_replay';

export type CommandCenterV1InvariantFailureMode =
  | 'typed_error'
  | 'typed_abstention'
  | 'read_only_degradation'
  | 'tamper_rejection';

export type CommandCenterV1InvariantRecord = {
  id: CommandCenterV1InvariantId;
  stage: 'management_context' | 'weekly_decision' | 'frozen_replay';
  failureMode: CommandCenterV1InvariantFailureMode;
  authority: 'hard_release_boundary';
  description: string;
  evidence: string[];
};

/**
 * Canonical invariant inventory for the personal v1 release.
 *
 * The catalog is intentionally small enough to execute as one certification
 * suite. Every entry has a mutation/failure proof in
 * commandCenterV1InvariantReplay.test.ts; ordinary feature existence is not
 * accepted as invariant evidence.
 */
export const COMMAND_CENTER_V1_INVARIANTS: Readonly<Record<CommandCenterV1InvariantId, CommandCenterV1InvariantRecord>> = {
  scoped_user_identity: {
    id: 'scoped_user_identity',
    stage: 'management_context',
    failureMode: 'typed_error',
    authority: 'hard_release_boundary',
    description: 'Management data cannot be evaluated under the legacy shared default user or another user’s league context.',
    evidence: ['server/services/leagueDashboardTruthBoundary.ts'],
  },
  league_ownership_identity: {
    id: 'league_ownership_identity',
    stage: 'management_context',
    failureMode: 'typed_error',
    authority: 'hard_release_boundary',
    description: 'The internal league must belong to the active scoped personal user.',
    evidence: ['server/services/leagueDashboardTruthBoundary.ts'],
  },
  external_league_identity: {
    id: 'external_league_identity',
    stage: 'management_context',
    failureMode: 'typed_error',
    authority: 'hard_release_boundary',
    description: 'A persisted Sleeper league id is required before live roster state can be consulted.',
    evidence: ['server/services/leagueDashboardTruthBoundary.ts'],
  },
  external_roster_identity: {
    id: 'external_roster_identity',
    stage: 'management_context',
    failureMode: 'typed_error',
    authority: 'hard_release_boundary',
    description: 'Persisted externalRosterId is the canonical team-to-Sleeper-roster join and must resolve uniquely.',
    evidence: ['server/services/leagueDashboardTruthBoundary.ts'],
  },
  external_owner_identity: {
    id: 'external_owner_identity',
    stage: 'management_context',
    failureMode: 'typed_error',
    authority: 'hard_release_boundary',
    description: 'Persisted external owner identity must match the Sleeper primary owner or an observed co-owner for the bound roster.',
    evidence: ['server/services/leagueDashboardTruthBoundary.ts'],
  },
  observed_roster_geometry: {
    id: 'observed_roster_geometry',
    stage: 'management_context',
    failureMode: 'typed_error',
    authority: 'hard_release_boundary',
    description: 'Observed roster membership must be unique and reconstructable, and starters must be members of the same observed roster.',
    evidence: ['server/services/leagueDashboardTruthBoundary.ts'],
  },
  observed_starter_truth: {
    id: 'observed_starter_truth',
    stage: 'management_context',
    failureMode: 'typed_error',
    authority: 'hard_release_boundary',
    description: 'Displayed starter state is sourced from Sleeper observed starters, never a modeled FORGE lineup.',
    evidence: ['server/services/leagueDashboardTruthBoundary.ts'],
  },
  forge_freshness_and_coverage: {
    id: 'forge_freshness_and_coverage',
    stage: 'management_context',
    failureMode: 'read_only_degradation',
    authority: 'hard_release_boundary',
    description: 'Sparse or stale player-specific FORGE evidence suppresses aggregate authority rather than fabricating a team grade.',
    evidence: [
      'server/services/leagueDashboardTruthBoundary.ts',
      'server/modules/management/forgeTeamDirectionFreshnessPolicy.ts',
    ],
  },
  weekly_context_identity: {
    id: 'weekly_context_identity',
    stage: 'weekly_decision',
    failureMode: 'typed_abstention',
    authority: 'hard_release_boundary',
    description: 'Decision id, season, week, league, and team identity are mandatory.',
    evidence: ['shared/weeklyDecisionContract.ts'],
  },
  weekly_scoring_identity: {
    id: 'weekly_scoring_identity',
    stage: 'weekly_decision',
    failureMode: 'typed_abstention',
    authority: 'hard_release_boundary',
    description: 'Tail evidence must match the exact frozen scoring profile.',
    evidence: ['shared/weeklyDecisionContract.ts'],
  },
  weekly_roster_lineup_identity: {
    id: 'weekly_roster_lineup_identity',
    stage: 'weekly_decision',
    failureMode: 'typed_abstention',
    authority: 'hard_release_boundary',
    description: 'Roster snapshot and both legal lineup variants must carry immutable refs/hashes.',
    evidence: ['shared/weeklyDecisionContract.ts'],
  },
  weekly_legality_and_lock_state: {
    id: 'weekly_legality_and_lock_state',
    stage: 'weekly_decision',
    failureMode: 'typed_abstention',
    authority: 'hard_release_boundary',
    description: 'v1 only admits an unlocked proven same-position observed starter-to-bench swap.',
    evidence: ['shared/weeklyDecisionContract.ts'],
  },
  weekly_canonical_player_identity: {
    id: 'weekly_canonical_player_identity',
    stage: 'weekly_decision',
    failureMode: 'typed_abstention',
    authority: 'hard_release_boundary',
    description: 'Unresolved player identity cannot enter weekly decision authority.',
    evidence: ['shared/weeklyDecisionContract.ts'],
  },
  weekly_as_of_boundary: {
    id: 'weekly_as_of_boundary',
    stage: 'weekly_decision',
    failureMode: 'typed_abstention',
    authority: 'hard_release_boundary',
    description: 'Evidence cutoff and validity timestamps must be canonical and consistent with admitted source receipts.',
    evidence: ['shared/weeklyDecisionContract.ts'],
  },
  weekly_tail_completeness: {
    id: 'weekly_tail_completeness',
    stage: 'weekly_decision',
    failureMode: 'typed_abstention',
    authority: 'hard_release_boundary',
    description: 'Both candidates require complete compatible calibrated weekly quantiles before comparison.',
    evidence: ['shared/weeklyDecisionContract.ts'],
  },
  weekly_authoritative_lineage: {
    id: 'weekly_authoritative_lineage',
    stage: 'weekly_decision',
    failureMode: 'typed_abstention',
    authority: 'hard_release_boundary',
    description: 'Weekly tail authority must be traceable to a promoted, fresh, supported TIBER-Forecast receipt bound to the same clocks/model.',
    evidence: ['shared/weeklyDecisionContract.ts'],
  },
  weekly_ledger_integrity_and_replay: {
    id: 'weekly_ledger_integrity_and_replay',
    stage: 'frozen_replay',
    failureMode: 'tamper_rejection',
    authority: 'hard_release_boundary',
    description: 'Any frozen context/result/lineage mutation prevents replay; intact snapshots reproduce the recorded decision exactly.',
    evidence: ['server/services/weeklyDecisionLedger.ts'],
  },
} as const;

export const COMMAND_CENTER_V1_INVARIANT_IDS = Object.freeze(
  Object.keys(COMMAND_CENTER_V1_INVARIANTS) as CommandCenterV1InvariantId[],
);
