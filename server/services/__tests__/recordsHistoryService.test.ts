import {
  createScoringFingerprint,
  deriveAchievements,
  deriveLeagueRecords,
  deriveManagerCareers,
  deriveRivalries,
  HistoricalManager,
  HistoricalSeason,
} from '../recordsHistoryService';

const managers: HistoricalManager[] = [
  { userId: 'manager-a', displayName: 'Alpha', username: 'alpha', avatar: null, seasons: ['2024', '2025'] },
  { userId: 'manager-b', displayName: 'Bravo', username: 'bravo', avatar: null, seasons: ['2024', '2025'] },
];

function makeSeason(input: {
  season: string;
  era: string;
  rosterA: number;
  rosterB: number;
  aPoints: number;
  bPoints: number;
  aWins: number;
  bWins: number;
  championRosterId: number;
}): HistoricalSeason {
  const aWon = input.aPoints > input.bPoints;
  return {
    leagueId: `league-${input.season}`,
    previousLeagueId: input.season === '2025' ? 'league-2024' : null,
    season: input.season,
    name: 'Test League',
    status: 'complete',
    scoringFingerprint: input.era,
    scoringEraId: `era-${input.era}`,
    scoringSettings: { rec: input.era === 'ppr' ? 1 : 0.5 },
    rosterPositions: ['QB', 'RB', 'WR', 'FLEX', 'BN'],
    playoffWeekStart: 15,
    users: managers.map((manager) => ({ ...manager, seasons: [input.season] })),
    rosterOwners: [
      { rosterId: input.rosterA, managerId: 'manager-a', wins: input.aWins, losses: 14 - input.aWins, ties: 0, pointsFor: 1400 + input.aPoints, pointsAgainst: 1300 + input.bPoints },
      { rosterId: input.rosterB, managerId: 'manager-b', wins: input.bWins, losses: 14 - input.bWins, ties: 0, pointsFor: 1300 + input.bPoints, pointsAgainst: 1400 + input.aPoints },
    ],
    matchups: [
      {
        leagueId: `league-${input.season}`,
        season: input.season,
        week: 1,
        matchupId: 1,
        isPlayoff: false,
        rosterId: input.rosterA,
        managerId: 'manager-a',
        points: input.aPoints,
        opponentRosterId: input.rosterB,
        opponentManagerId: 'manager-b',
        opponentPoints: input.bPoints,
        won: aWon,
        tied: input.aPoints === input.bPoints,
      },
      {
        leagueId: `league-${input.season}`,
        season: input.season,
        week: 1,
        matchupId: 1,
        isPlayoff: false,
        rosterId: input.rosterB,
        managerId: 'manager-b',
        points: input.bPoints,
        opponentRosterId: input.rosterA,
        opponentManagerId: 'manager-a',
        opponentPoints: input.aPoints,
        won: !aWon,
        tied: input.aPoints === input.bPoints,
      },
    ],
    playoffRosterIds: [input.rosterA, input.rosterB],
    championRosterId: input.championRosterId,
    runnerUpRosterId: input.championRosterId === input.rosterA ? input.rosterB : input.rosterA,
    regularSeasonChampionRosterId: input.aWins > input.bWins ? input.rosterA : input.rosterB,
    pointsLeaderRosterId: input.aPoints > input.bPoints ? input.rosterA : input.rosterB,
    coverage: { complete: true, requestedWeeks: 17, loadedWeeks: 17, playoffBracketLoaded: true },
  };
}

const seasons: HistoricalSeason[] = [
  makeSeason({ season: '2024', era: 'half', rosterA: 1, rosterB: 2, aPoints: 120, bPoints: 110, aWins: 10, bWins: 4, championRosterId: 1 }),
  // Owners swap roster IDs in 2025. Manager history must follow owner_id, not franchise slot.
  makeSeason({ season: '2025', era: 'ppr', rosterA: 2, rosterB: 1, aPoints: 150, bPoints: 151.5, aWins: 8, bWins: 6, championRosterId: 1 }),
];

describe('recordsHistoryService', () => {
  test('scoring fingerprints are deterministic and sensitive to material scoring changes', () => {
    const first = createScoringFingerprint({ scoring_settings: { pass_td: 4, rec: 1 }, roster_positions: ['QB', 'RB', 'WR'], settings: { playoff_teams: 6 } });
    const reordered = createScoringFingerprint({ scoring_settings: { rec: 1, pass_td: 4 }, roster_positions: ['QB', 'RB', 'WR'], settings: { playoff_teams: 6 } });
    const changed = createScoringFingerprint({ scoring_settings: { pass_td: 4, rec: 0.5 }, roster_positions: ['QB', 'RB', 'WR'], settings: { playoff_teams: 6 } });
    expect(first).toBe(reordered);
    expect(first).not.toBe(changed);
  });

  test('career accomplishments follow stable manager IDs across roster ownership changes', () => {
    const careers = deriveManagerCareers(seasons, managers);
    const alpha = careers.find((career) => career.managerId === 'manager-a');
    const bravo = careers.find((career) => career.managerId === 'manager-b');
    expect(alpha).toMatchObject({ seasons: 2, championships: 1, finals: 2, wins: 18 });
    expect(bravo).toMatchObject({ seasons: 2, championships: 1, finals: 2, wins: 10 });
  });

  test('weekly scoring records remain scoped to their scoring era', () => {
    const records = deriveLeagueRecords(seasons, managers);
    const halfHigh = records.find((record) => record.recordId === 'highest_weekly_score' && record.scoringEraId === 'era-half');
    const pprHigh = records.find((record) => record.recordId === 'highest_weekly_score' && record.scoringEraId === 'era-ppr');
    expect(halfHigh?.value).toBe(120);
    expect(pprHigh?.value).toBe(151.5);
    expect(records.find((record) => record.recordId === 'career_championships')?.value).toBe(1);
  });

  test('rivalries aggregate head-to-head history by manager rather than roster slot', () => {
    const rivalries = deriveRivalries(seasons, managers);
    expect(rivalries).toHaveLength(1);
    expect(rivalries[0]).toMatchObject({ games: 2, managerAWins: 1, managerBWins: 1, ties: 0 });
    expect(rivalries[0].managerAPoints).toBe(270);
    expect(rivalries[0].managerBPoints).toBe(261.5);
  });

  test('achievements are factual grants with league-relative rarity metadata', () => {
    const careers = deriveManagerCareers(seasons, managers);
    const achievements = deriveAchievements(seasons, managers, careers);
    const champions = achievements.filter((achievement) => achievement.achievementId === 'champion');
    expect(champions).toHaveLength(2);
    expect(new Set(champions.map((achievement) => achievement.managerId))).toEqual(new Set(['manager-a', 'manager-b']));
    expect(champions.every((achievement) => achievement.eligibleManagers === 2)).toBe(true);
  });
});
