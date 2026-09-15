import { assessLeagueDecisionReadiness, buildUnifiedLeagueContextV1 } from '../leagueContextV1';

const NOW = '2026-09-15T15:30:00.000Z';
const scoring = {
  pass_yd: 0.04,
  pass_td: 4,
  int: -2,
  rush_yd: 0.1,
  rush_td: 6,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  fum_lost: -2,
};

describe('league format isolation', () => {
  test.each([
    ['redraft', 'Sunday Redraft'],
    ['dynasty', 'Long-Term Dynasty'],
    ['keeper-shaped', 'Home Keeper League'],
  ])('%s league does not acquire unsupported supplemental capabilities', async (_label, leagueName) => {
    const context = await buildUnifiedLeagueContextV1({
      platform: 'sleeper',
      leagueId: `test-${leagueName}`,
      leagueName,
      season: 2026,
      rawScoringSettings: scoring,
      scoringAsOf: NOW,
      rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN'],
      builtAt: NOW,
    });

    expect(context.capabilities).toEqual(['platform_roster', 'platform_scoring']);
    expect(context.contractProfile).toBeNull();
    expect(context.devyRightsSource).toBeNull();
    expect(assessLeagueDecisionReadiness(context, { decisionType: 'lineup' }).ready).toBe(true);
  });

  test('requesting a contract decision in a non-contract league fails closed', async () => {
    const context = await buildUnifiedLeagueContextV1({
      platform: 'sleeper',
      leagueId: 'ordinary-dynasty',
      leagueName: 'Ordinary Dynasty',
      season: 2026,
      rawScoringSettings: scoring,
      scoringAsOf: NOW,
      builtAt: NOW,
    });

    const readiness = assessLeagueDecisionReadiness(context, { decisionType: 'contract' });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.join(' ')).toMatch(/without a resolved contract rule profile/i);
  });
});
