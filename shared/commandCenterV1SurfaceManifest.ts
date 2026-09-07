export type CommandCenterV1SurfaceStatus =
  | 'certified_read_only'
  | 'certified_fail_closed'
  | 'contract_ready_not_activated'
  | 'inspection_only'
  | 'blocked_legacy_authority'
  | 'not_activated';

export type CommandCenterV1ReleaseOutcome =
  | 'read_only_context'
  | 'inspection_only'
  | 'insufficient_evidence'
  | 'unsupported_domain';

export type CommandCenterV1SurfaceId =
  | 'home_what_changed'
  | 'weekly_decisions'
  | 'waivers'
  | 'trades'
  | 'player_intelligence'
  | 'league_portfolio'
  | 'draft';

export type CommandCenterV1SurfaceRecord = {
  id: CommandCenterV1SurfaceId;
  label: string;
  status: CommandCenterV1SurfaceStatus;
  userFacingState: 'available' | 'unavailable' | 'inspection_only';
  releaseOutcome: CommandCenterV1ReleaseOutcome;
  finalActionAuthority: 'human';
  canonicalRoute: string | null;
  reason: string;
  evidence: string[];
  prohibitedAuthority?: string[];
};

/**
 * Release-boundary manifest for Command Center v1.
 *
 * This intentionally records what the personal release has actually earned,
 * not what happens to exist somewhere in the repository. A legacy service is
 * never a certified workflow merely because a route can call it.
 *
 * `certified_fail_closed` is a real user-facing capability: the workflow has a
 * discoverable route and a typed release outcome, but it is required to abstain
 * rather than delegate to uncertified legacy authority when governed evidence
 * is unavailable. This is certification of failure behavior, not certification
 * of a recommendation model.
 */
export const COMMAND_CENTER_V1_SURFACES: Readonly<Record<CommandCenterV1SurfaceId, CommandCenterV1SurfaceRecord>> = {
  home_what_changed: {
    id: 'home_what_changed',
    label: 'Home / What Changed',
    status: 'certified_fail_closed',
    userFacingState: 'available',
    releaseOutcome: 'insufficient_evidence',
    finalActionAuthority: 'human',
    canonicalRoute: '/command-center',
    reason: 'No release-certified owner change feed is currently bound to the frozen league/team context, so v1 explicitly withholds a synthetic change summary.',
    evidence: [
      'client/src/pages/CommandCenterV1.tsx',
      'server/services/__tests__/commandCenterV1SurfaceManifest.test.ts',
    ],
  },
  weekly_decisions: {
    id: 'weekly_decisions',
    label: 'Weekly Decisions',
    status: 'certified_fail_closed',
    userFacingState: 'available',
    releaseOutcome: 'insufficient_evidence',
    finalActionAuthority: 'human',
    canonicalRoute: '/command-center/weekly',
    reason: 'The governed typed decision contract is the only admitted lineup authority. Until exact legal lineup state and compatible calibrated weekly tail evidence are supplied, the release surface returns insufficient_evidence.',
    evidence: [
      'shared/weeklyDecisionContract.ts',
      'client/src/pages/CommandCenterV1.tsx',
      'server/services/__tests__/weeklyDecisionContract.test.ts',
      'server/services/__tests__/commandCenterV1SurfaceManifest.test.ts',
    ],
    prohibitedAuthority: [
      'server/services/playerComparisonService.ts',
      'server/voice/deciders/startSit.ts',
      'rankings-only player-vs-player substitution',
    ],
  },
  waivers: {
    id: 'waivers',
    label: 'Waivers',
    status: 'certified_fail_closed',
    userFacingState: 'available',
    releaseOutcome: 'unsupported_domain',
    finalActionAuthority: 'human',
    canonicalRoute: '/command-center/waivers',
    reason: 'Existing waiver verdict logic uses hand-set RAG/upside boosts and numeric confidence without the governed league/roster/evidence contract required for v1, so the release surface explicitly returns unsupported_domain.',
    evidence: [
      'client/src/pages/CommandCenterV1.tsx',
      'server/voice/deciders/waiver.ts',
      'server/services/__tests__/commandCenterV1SurfaceManifest.test.ts',
    ],
    prohibitedAuthority: ['server/voice/deciders/waiver.ts', 'server/analytics.ts legacy waiver recommendations'],
  },
  trades: {
    id: 'trades',
    label: 'Trades',
    status: 'certified_fail_closed',
    userFacingState: 'available',
    releaseOutcome: 'unsupported_domain',
    finalActionAuthority: 'human',
    canonicalRoute: '/command-center/trades',
    reason: 'Existing canonical transport still delegates verdict authority to transitional prometheusScore/tier/starter/age heuristics; v1 keeps that authority quarantined and explicitly returns unsupported_domain.',
    evidence: [
      'client/src/pages/CommandCenterV1.tsx',
      'server/api/v1/mappers/toTradeAnalysisResponse.ts',
      'server/services/trade/tradeLogic.ts',
      'server/services/__tests__/commandCenterV1SurfaceManifest.test.ts',
    ],
    prohibitedAuthority: ['server/services/trade/tradeLogic.ts'],
  },
  player_intelligence: {
    id: 'player_intelligence',
    label: 'Player Intelligence',
    status: 'inspection_only',
    userFacingState: 'inspection_only',
    releaseOutcome: 'inspection_only',
    finalActionAuthority: 'human',
    canonicalRoute: '/player/:playerId',
    reason: 'Player research is available for inspection, but it is not promoted as lineup/trade/waiver advice authority in v1.',
    evidence: ['client/src/pages/PlayerPage.tsx'],
  },
  league_portfolio: {
    id: 'league_portfolio',
    label: 'League / Roster Context',
    status: 'certified_read_only',
    userFacingState: 'available',
    releaseOutcome: 'read_only_context',
    finalActionAuthority: 'human',
    canonicalRoute: '/management',
    reason: 'Gate 0 certifies browser-scoped user isolation, Sleeper roster-id authority, observed starter state, context receipts, and fail-closed sparse/stale aggregate behavior.',
    evidence: [
      'server/middleware/personalUserScope.ts',
      'server/services/leagueDashboardTruthBoundary.ts',
      'server/services/__tests__/leagueDashboardTruthBoundary.test.ts',
    ],
  },
  draft: {
    id: 'draft',
    label: 'Draft Review',
    status: 'certified_read_only',
    userFacingState: 'available',
    releaseOutcome: 'read_only_context',
    finalActionAuthority: 'human',
    canonicalRoute: '/draft-review',
    reason: 'Draft Review has a read-only containment profile and explicit fail-closed runtime boundary; v1 regression-certifies this surface without expanding it.',
    evidence: [
      'server/routes/draftReviewRoutes.ts',
      'server/runtimeProfile.ts',
      'client/src/pages/TiberDraftReview.tsx',
    ],
  },
} as const;

export const COMMAND_CENTER_V1_REQUIRED_SURFACE_IDS: readonly CommandCenterV1SurfaceId[] = [
  'home_what_changed',
  'weekly_decisions',
  'waivers',
  'trades',
  'player_intelligence',
  'league_portfolio',
  'draft',
] as const;

export function getCommandCenterV1Surface(id: CommandCenterV1SurfaceId): CommandCenterV1SurfaceRecord {
  return COMMAND_CENTER_V1_SURFACES[id];
}

export function isCommandCenterV1Gate1Complete(): boolean {
  return COMMAND_CENTER_V1_REQUIRED_SURFACE_IDS.every((id) => {
    const status = COMMAND_CENTER_V1_SURFACES[id].status;
    return status === 'certified_read_only' || status === 'certified_fail_closed' || status === 'inspection_only';
  });
}
