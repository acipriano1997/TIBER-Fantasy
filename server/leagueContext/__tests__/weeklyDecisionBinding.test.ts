import {
  buildUnifiedLeagueContextV1,
} from '../leagueContextV1';
import {
  inspectWeeklyDecisionLeagueBinding,
  leagueScoringProfileRef,
} from '../weeklyDecisionBinding';
import type { WeeklyDecisionContext } from '../../../shared/weeklyDecisionContract';

const NOW = '2026-09-15T19:30:00.000Z';
const scoring = {
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

function weekly(overrides: Partial<WeeklyDecisionContext> = {}): WeeklyDecisionContext {
  const candidate = (playerId: string): WeeklyDecisionContext['candidateA'] => ({
    playerId,
    playerName: playerId,
    position: 'WR',
    identityStatus: 'canonical',
    observedStarter: playerId === 'a',
    tailOutlook: null,
  });
  return {
    decisionId: 'decision-1',
    season: 2026,
    week: 2,
    evidenceCutoffAt: NOW,
    validUntil: null,
    leagueRef: 'league-6pt',
    teamRef: 'team-1',
    scoringProfileRef: 'placeholder',
    scoringProfileHash: 'placeholder',
    rosterSnapshotRef: 'roster-1',
    rosterSnapshotHash: 'roster-hash',
    lineupAHash: 'a-hash',
    lineupBHash: 'b-hash',
    samePositionLegalSwap: true,
    locked: false,
    operatorPosture: 'balanced',
    candidateA: candidate('a'),
    candidateB: candidate('b'),
    ...overrides,
  };
}

describe('weekly decision league-context binding', () => {
  test('accepts only the certified active-league scoring ref and fingerprint', async () => {
    const context = await buildUnifiedLeagueContextV1({
      platform: 'sleeper',
      leagueId: 'league-6pt',
      leagueName: 'Six Point League',
      season: 2026,
      rawScoringSettings: scoring,
      scoringAsOf: NOW,
      builtAt: NOW,
    });
    const ref = leagueScoringProfileRef(context);
    expect(context.scoring.settings.pass_td).toBe(6);
    expect(ref).not.toBeNull();

    const bound = inspectWeeklyDecisionLeagueBinding(context, weekly({
      scoringProfileRef: ref!,
      scoringProfileHash: context.scoring.fingerprint!,
    }));
    expect(bound.ready).toBe(true);
    expect(bound.blockers).toEqual([]);
  });

  test('rejects a scoring hash copied from another league', async () => {
    const context = await buildUnifiedLeagueContextV1({
      platform: 'sleeper',
      leagueId: 'league-6pt',
      leagueName: 'Six Point League',
      season: 2026,
      rawScoringSettings: scoring,
      scoringAsOf: NOW,
      builtAt: NOW,
    });
    const bound = inspectWeeklyDecisionLeagueBinding(context, weekly({
      scoringProfileRef: leagueScoringProfileRef(context)!,
      scoringProfileHash: 'wrong-league-hash',
    }));
    expect(bound.ready).toBe(false);
    expect(bound.blockers.join(' ')).toMatch(/scoringProfileHash/i);
  });

  test('rejects a weekly packet whose league identity differs from active context', async () => {
    const context = await buildUnifiedLeagueContextV1({
      platform: 'sleeper',
      leagueId: 'league-6pt',
      leagueName: 'Six Point League',
      season: 2026,
      rawScoringSettings: scoring,
      scoringAsOf: NOW,
      builtAt: NOW,
    });
    const bound = inspectWeeklyDecisionLeagueBinding(context, weekly({
      leagueRef: 'other-league',
      scoringProfileRef: leagueScoringProfileRef(context)!,
      scoringProfileHash: context.scoring.fingerprint!,
    }));
    expect(bound.ready).toBe(false);
    expect(bound.blockers.join(' ')).toMatch(/leagueRef/i);
  });
});
