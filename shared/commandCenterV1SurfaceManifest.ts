export type CommandCenterV1SurfaceStatus =
  | 'certified_read_only'
  | 'contract_ready_not_activated'
  | 'inspection_only'
  | 'blocked_legacy_authority'
  | 'not_activated';

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
 */
export const COMMAND_CENTER_V1_SURFACES: Readonly<Record<CommandCenterV1SurfaceId, CommandCenterV1SurfaceRecord>> = {
  home_what_changed: {
    id: 'home_what_changed',
    label: 'Home / What Changed',
    status: 'not_activated',
    userFacingState: 'unavailable',
    finalActionAuthority: 'human',
    canonicalRoute: null,
    reason: 'No release-certified owner change feed is currently bound to the frozen league/team context.',
    evidence: [],
  },
  weekly_decisions: {
    id: 'weekly_decisions',
    label: 'Weekly Decisions',
    status: 'contract_ready_not_activated',
    userFacingState: 'unavailable',
    finalActionAuthority: 'human',
    canonicalRoute: null,
    reason: 'The governed typed decision contract exists, but no user-facing adapter may recommend until exact legal lineup state and compatible calibrated weekly tail evidence are supplied.',
    evidence: [
      'shared/weeklyDecisionContract.ts',
      'server/services/__tests__/weeklyDecisionContract.test.ts',
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
    status: 'blocked_legacy_authority',
    userFacingState: 'unavailable',
    finalActionAuthority: 'human',
    canonicalRoute: null,
    reason: 'Existing waiver verdict logic uses hand-set RAG/upside boosts and numeric confidence without the governed league/roster/evidence contract required for v1.',
    evidence: ['server/voice/deciders/waiver.ts'],
    prohibitedAuthority: ['server/voice/deciders/waiver.ts', 'server/analytics.ts legacy waiver recommendations'],
  },
  trades: {
    id: 'trades',
    label: 'Trades',
    status: 'blocked_legacy_authority',
    userFacingState: 'unavailable',
    finalActionAuthority: 'human',
    canonicalRoute: null,
    reason: 'Existing canonical transport still delegates verdict authority to transitional prometheusScore/tier/starter/age heuristics; transport shape is not decision certification.',
    evidence: [
      'server/api/v1/mappers/toTradeAnalysisResponse.ts',
      'server/services/trade/tradeLogic.ts',
    ],
    prohibitedAuthority: ['server/services/trade/tradeLogic.ts'],
  },
  player_intelligence: {
    id: 'player_intelligence',
    label: 'Player Intelligence',
    status: 'inspection_only',
    userFacingState: 'inspection_only',
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
    return status === 'certified_read_only' || status === 'inspection_only';
  });
}
