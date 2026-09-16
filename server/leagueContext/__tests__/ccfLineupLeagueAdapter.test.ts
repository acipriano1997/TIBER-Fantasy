import { bindUnifiedLeagueContextToCCFLineup } from '../ccfLineupLeagueAdapter';
import { certifyScoringSettings } from '../scoringCertification';
import type { UnifiedLeagueContextV1 } from '../leagueContextV1';

const AS_OF = '2026-09-16T11:30:00.000Z';
const SCORING = {
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

function context(
  rosterPositions: string[],
  scoringSettings: Record<string, number> | null = SCORING,
): UnifiedLeagueContextV1 {
  const scoring = certifyScoringSettings({
    platform: 'sleeper',
    leagueId: 'league-1',
    rawSettings: scoringSettings,
    asOf: AS_OF,
    checkedAt: AS_OF,
    maxAgeMs: 60_000,
  });
  return {
    schemaVersion: 'unified-league-context.v1',
    identity: {
      platform: 'sleeper',
      leagueId: 'league-1',
      leagueName: 'Integration League',
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
    issues: scoring.issues.map((message) => ({
      code: 'SCORING_NOT_CERTIFIED',
      severity: 'blocking' as const,
      message,
    })),
    invariants: {
      noSilentScoringDefaults: true,
      noCrossLeagueContractRuleInheritance: true,
      collegeProspectsNeverBecomePlatformNflRosterPlayers: true,
      liveContractDecisionsRequireFreshWorkbookSnapshot: true,
      devyOwnershipDecisionsRequireFreshRightsSnapshot: true,
    },
  };
}

describe('Unified League Context -> CCF lineup geometry binding', () => {
  it('maps exact ordered QB/RB/WR/TE/FLEX/SUPER_FLEX starter geometry and ignores reserve slots', () => {
    const binding = bindUnifiedLeagueContextToCCFLineup(context([
      'QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'BN', 'BN', 'IR', 'TAXI',
    ]));

    expect(binding.ready).toBe(true);
    expect(binding.scoringFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(binding.rosterSlotsFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(binding.slots.map((slot) => [slot.slotId, slot.eligiblePositions])).toEqual([
      ['QB:1', ['QB']],
      ['RB:1', ['RB']],
      ['RB:2', ['RB']],
      ['WR:1', ['WR']],
      ['WR:2', ['WR']],
      ['TE:1', ['TE']],
      ['FLEX:1', ['RB', 'WR', 'TE']],
      ['SUPER_FLEX:1', ['QB', 'RB', 'WR', 'TE']],
    ]);
    expect(binding.positionCoverage.ready).toBe(true);
    expect(binding.positionCoverage.requiredPositions).toEqual(['QB', 'RB', 'TE', 'WR']);
  });

  it.each(['K', 'DEF', 'DL', 'LB', 'DB', 'IDP'])(
    'fails closed instead of dropping unsupported active starter token %s',
    (slotToken) => {
      const binding = bindUnifiedLeagueContextToCCFLineup(context(['QB', 'RB', 'WR', 'TE', slotToken, 'BN']));
      expect(binding.ready).toBe(false);
      expect(binding.blockers).toContain(`Unsupported active starter slot token: ${slotToken}.`);
    },
  );

  it('fails closed on an unknown flex grammar rather than guessing its eligibility', () => {
    const binding = bindUnifiedLeagueContextToCCFLineup(context(['QB', 'MYSTERY_FLEX', 'BN']));
    expect(binding.ready).toBe(false);
    expect(binding.blockers).toContain('Unsupported active starter slot token: MYSTERY_FLEX.');
  });

  it('inherits the no-silent-default scoring gate from Unified League Context', () => {
    const binding = bindUnifiedLeagueContextToCCFLineup(context(['QB', 'RB', 'WR', 'TE'], null));
    expect(binding.ready).toBe(false);
    expect(binding.scoringFingerprint).toBeNull();
    expect(binding.blockers.some((blocker) => blocker.includes('League scoring is not certified'))).toBe(true);
    expect(binding.blockers).toContain('Certified active-league scoring fingerprint is unavailable.');
  });

  it('fingerprints the exact ordered active-league roster geometry deterministically', () => {
    const first = bindUnifiedLeagueContextToCCFLineup(context(['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN']));
    const replay = bindUnifiedLeagueContextToCCFLineup(context(['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN']));
    const changed = bindUnifiedLeagueContextToCCFLineup(context(['QB', 'RB', 'WR', 'FLEX', 'TE', 'BN']));

    expect(replay.rosterSlotsFingerprint).toBe(first.rosterSlotsFingerprint);
    expect(changed.rosterSlotsFingerprint).not.toBe(first.rosterSlotsFingerprint);
  });
});
