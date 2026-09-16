import { certifyScoringSettings } from '../../leagueContext/scoringCertification';
import type { UnifiedLeagueContextV1 } from '../../leagueContext/leagueContextV1';
import {
  CCF_WEEKLY_SOURCE_CAPABILITIES,
  type CCFWeeklySourceSpineAudit,
} from '../../modules/ccf/sources/weeklySourceSpine';
import type { CCFPlayerOutcome, CCFPosition } from '../../modules/ccf/outcomes/contract';
import type {
  CCFLineupOutcomeEnvelope,
  CCFLineupRosterPlayer,
} from '../../modules/ccf/lineup/lineupDecision';
import { evaluateCCFCompleteLineupRuntime } from '../ccfCompleteLineupRuntimeService';

const AS_OF = '2026-09-16T12:00:00.000Z';
const VALID_UNTIL = '2026-09-17T12:00:00.000Z';
const SOURCE_PLAN = 'source-plan-fingerprint';
const SCORING_SETTINGS = {
  pass_yd: 0.04,
  pass_td: 6,
  int: -1,
  rush_yd: 0.1,
  rush_td: 6,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  fum_lost: -2,
};

function leagueContext(rosterPositions: string[] = [
  'QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'BN', 'BN', 'IR',
]): UnifiedLeagueContextV1 {
  const scoring = certifyScoringSettings({
    platform: 'sleeper',
    leagueId: 'league-1',
    rawSettings: SCORING_SETTINGS,
    asOf: AS_OF,
    checkedAt: AS_OF,
    maxAgeMs: 60_000,
  });
  return {
    schemaVersion: 'unified-league-context.v1',
    identity: {
      platform: 'sleeper',
      leagueId: 'league-1',
      leagueName: 'Complete Lineup League',
      season: 2026,
    },
    builtAt: AS_OF,
    capabilities: ['platform_roster', 'platform_scoring'],
    scoring,
    rosterPositions,
    contractProfile: null,
    contractWorkbookSnapshot: null,
    devyRightsSource: null,
    devyRightsSnapshot: null,
    sources: [],
    issues: [],
    invariants: {
      noSilentScoringDefaults: true,
      noCrossLeagueContractRuleInheritance: true,
      collegeProspectsNeverBecomePlatformNflRosterPlayers: true,
      liveContractDecisionsRequireFreshWorkbookSnapshot: true,
      devyOwnershipDecisionsRequireFreshRightsSnapshot: true,
    },
  };
}

function sourceAudit(asOf = AS_OF): CCFWeeklySourceSpineAudit {
  return {
    contractVersion: 'ccf-weekly-source-spine-audit-v1',
    planId: 'native-weekly-v1',
    asOf,
    productionReady: true,
    discoveryCoverage: CCF_WEEKLY_SOURCE_CAPABILITIES.length,
    productionCoverage: CCF_WEEKLY_SOURCE_CAPABILITIES.length,
    requiredCapabilityCount: CCF_WEEKLY_SOURCE_CAPABILITIES.length,
    planFingerprint: SOURCE_PLAN,
    capabilities: CCF_WEEKLY_SOURCE_CAPABILITIES.map((capability) => ({
      capability,
      ready: true,
      sourceId: `source:${capability}`,
      sourceEligibilityReason: 'eligible',
      blockers: [],
    })),
    blockers: [],
  };
}

function player(
  playerId: string,
  position: CCFPosition,
  observedStarterSlotId: string | null,
  overrides: Partial<CCFLineupRosterPlayer> = {},
): CCFLineupRosterPlayer {
  return {
    playerId,
    position,
    identityStatus: 'canonical',
    availability: 'eligible',
    byeWeek: null,
    observedStarterSlotId,
    lockAt: null,
    ...overrides,
  };
}

function outcome(playerId: string, position: CCFPosition, meanFpts: number, scoringFingerprint: string): CCFPlayerOutcome {
  return {
    playerId,
    position,
    season: 2026,
    week: 2,
    scoringFormat: 'CUSTOM',
    scoringFingerprint,
    meanFpts,
    medianFpts: meanFpts,
    p10Fpts: meanFpts - 6,
    p25Fpts: meanFpts - 3,
    p75Fpts: meanFpts + 3,
    p90Fpts: meanFpts + 6,
    zeroOrNearZeroProbability: 0.02,
    boomProbability: 0.2,
    bustProbability: 0.15,
    volatility: 4,
    confidence: 0.8,
    coverage: 0.95,
    abstain: false,
    abstainReasons: [],
    mechanismContributions: [],
    criticalFeatureProvenance: [{
      feature: 'native_weekly_features',
      producerFamily: 'ccf_native_model',
      critical: true,
      evidenceKind: 'inferred',
      sourceRef: 'ccf:native-weekly',
      knownAt: AS_OF,
    }],
    modelVersion: 'ccf-weekly-v1',
    asOf: AS_OF,
    mode: 'CCF_NATIVE',
  };
}

function envelope(playerId: string, position: CCFPosition, meanFpts: number, scoringFingerprint: string): CCFLineupOutcomeEnvelope {
  return {
    playerId,
    outcome: outcome(playerId, position, meanFpts, scoringFingerprint),
    calibrationVersion: 'cal-v1',
    predictiveValidationReceiptFingerprint: 'validation-fingerprint',
    sourcePlanFingerprint: SOURCE_PLAN,
    validUntil: VALID_UNTIL,
  };
}

function runtimeInput() {
  const context = leagueContext();
  const scoringFingerprint = context.scoring.fingerprint!;
  const roster: CCFLineupRosterPlayer[] = [
    player('qb-a', 'QB', 'QB:1'),
    player('qb-b', 'QB', 'SUPER_FLEX:1'),
    player('rb-a', 'RB', 'RB:1'),
    player('rb-b', 'RB', 'FLEX:1'),
    player('wr-a', 'WR', 'WR:1'),
    player('wr-b', 'WR', null),
    player('te-a', 'TE', 'TE:1'),
  ];
  const values: Array<[string, CCFPosition, number]> = [
    ['qb-a', 'QB', 24],
    ['qb-b', 'QB', 21],
    ['rb-a', 'RB', 16],
    ['rb-b', 'RB', 15],
    ['wr-a', 'WR', 17],
    ['wr-b', 'WR', 14],
    ['te-a', 'TE', 12],
  ];
  return {
    decisionId: 'complete-lineup-1',
    teamRef: 'team-1',
    week: 2,
    asOf: AS_OF,
    posture: 'balanced' as const,
    leagueContext: context,
    rosterSnapshotFingerprint: 'roster-snapshot-fingerprint',
    roster,
    outcomes: values.map(([id, position, mean]) => envelope(id, position, mean, scoringFingerprint)),
    weeklySourceSpineAudit: sourceAudit(),
  };
}

describe('CCF complete-lineup runtime composition', () => {
  it('uses certified league scoring and full FLEX/Superflex geometry in one frozen decision', () => {
    const result = evaluateCCFCompleteLineupRuntime(runtimeInput());
    expect(result.state).toBe('evaluated');
    expect(result.leagueBinding.ready).toBe(true);
    expect(result.decision?.status).toBe('comparison_available');
    expect(result.decisionInput?.scoringFingerprint).toBe(result.leagueBinding.scoringFingerprint);
    expect(result.decisionInput?.slots).toHaveLength(6);
    expect(result.decision?.assignments).toHaveLength(6);
    expect(result.decision?.assignments?.find((row) => row.slotType === 'SUPER_FLEX')?.playerId).toBe('qb-b');
    expect(result.decision?.finalActionAuthority).toBe('human');
  });

  it('binds an elapsed observed starter lock into the exact active-league slot', () => {
    const input = runtimeInput();
    const wrA = input.roster.find((row) => row.playerId === 'wr-a')!;
    wrA.lockAt = '2026-09-16T11:00:00.000Z';
    const wrB = input.outcomes.find((row) => row.playerId === 'wr-b')!.outcome;
    Object.assign(wrB, { meanFpts: 50, medianFpts: 50, p10Fpts: 44, p25Fpts: 47, p75Fpts: 53, p90Fpts: 56 });

    const result = evaluateCCFCompleteLineupRuntime(input);
    expect(result.state).toBe('evaluated');
    expect(result.decision?.assignments?.find((row) => row.slotId === 'WR:1')).toMatchObject({
      playerId: 'wr-a',
      locked: true,
    });
  });

  it('blocks unsupported active-league positions before constructing a decision packet', () => {
    const input = runtimeInput();
    input.leagueContext = leagueContext(['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'BN']);
    const result = evaluateCCFCompleteLineupRuntime(input);
    expect(result.state).toBe('blocked');
    expect(result.decisionInput).toBeNull();
    expect(result.leagueBinding.blockers).toContain('Unsupported active starter slot token: K.');
    expect(result.missingInputs).toContain('certified_ccf_lineup_league_binding');
  });

  it('fails closed when native outcomes were built for a different scoring fingerprint', () => {
    const input = runtimeInput();
    input.outcomes[0].outcome.scoringFingerprint = 'wrong-scoring-fingerprint';
    const result = evaluateCCFCompleteLineupRuntime(input);
    expect(result.state).toBe('evaluated');
    expect(result.decision?.status).toBe('insufficient_evidence');
    expect(result.decision?.missingInputs).toContain('qb-a:outcome_scoring_fingerprint_mismatch');
  });

  it('fails closed when the source-spine audit was not evaluated at the exact decision as-of', () => {
    const input = runtimeInput();
    input.weeklySourceSpineAudit = sourceAudit('2026-09-16T11:59:59.000Z');
    const result = evaluateCCFCompleteLineupRuntime(input);
    expect(result.state).toBe('evaluated');
    expect(result.decision?.status).toBe('insufficient_evidence');
    expect(result.decision?.missingInputs).toContain('same_as_of_weekly_source_spine');
  });
});
