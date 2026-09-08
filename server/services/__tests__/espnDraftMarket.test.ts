import { parseEspnDraftMarketPayload } from '../espnDraftMarket';

describe('ESPN draft market truth contract', () => {
  test('uses real ownership ADP and never response index as a fallback', () => {
    const snapshot = parseEspnDraftMarketPayload({
      players: [
        {
          id: 101,
          player: {
            id: 101,
            active: true,
            fullName: 'Second In Payload',
            defaultPositionId: 3,
            proTeamId: 6,
            ownership: { averageDraftPosition: 42.7, percentOwned: 88.2 },
          },
        },
        {
          id: 102,
          player: {
            id: 102,
            active: true,
            fullName: 'First By Market',
            defaultPositionId: 3,
            proTeamId: 21,
            ownership: { averageDraftPosition: 12.4, percentOwned: 99.1 },
          },
        },
        {
          id: 103,
          player: {
            id: 103,
            active: true,
            fullName: 'No Market Evidence',
            defaultPositionId: 3,
            proTeamId: 2,
            ownership: { percentOwned: 4.2 },
          },
        },
      ],
    }, {
      season: 2026,
      scoring: 'PPR',
      fetchedAt: '2026-09-08T19:00:00.000Z',
      sourceEndpoint: 'https://example.test/kona',
    });

    expect(snapshot.rows.map((row) => row.playerName)).toEqual(['First By Market', 'Second In Payload']);
    expect(snapshot.rows.map((row) => row.averageDraftPosition)).toEqual([12.4, 42.7]);
    expect(snapshot.rows.map((row) => row.team)).toEqual(['PHI', 'DAL']);
    expect(snapshot.rows.find((row) => row.playerName === 'No Market Evidence')).toBeUndefined();
  });

  test('prefers an explicit ESPN draft rank while preserving ADP separately', () => {
    const snapshot = parseEspnDraftMarketPayload({
      players: [
        {
          id: 201,
          player: {
            active: true,
            fullName: 'Ranked Player',
            defaultPositionId: 2,
            proTeamId: 29,
            draftRanksByRankType: { PPR: { rank: 8 } },
            ownership: { averageDraftPosition: 14.6, auctionValueAverage: 31.2, percentOwned: 98.8 },
          },
        },
      ],
    }, {
      season: 2026,
      scoring: 'PPR',
      fetchedAt: '2026-09-08T19:00:00.000Z',
      sourceEndpoint: 'https://example.test/kona',
    });

    expect(snapshot.rows[0]).toMatchObject({
      espnPlayerId: '201',
      playerName: 'Ranked Player',
      team: 'CAR',
      position: 'RB',
      draftRank: 8,
      averageDraftPosition: 14.6,
      auctionValueAverage: 31.2,
      percentOwned: 98.8,
    });
  });

  test('keeps ESPN provider identity typed and does not invent canonical or Sleeper IDs', () => {
    const snapshot = parseEspnDraftMarketPayload({
      players: [{
        id: 999,
        player: {
          active: true,
          fullName: 'Provider Typed',
          defaultPositionId: 1,
          proTeamId: 34,
          ownership: { averageDraftPosition: 50 },
        },
      }],
    }, {
      season: 2026,
      scoring: 'PPR',
      fetchedAt: '2026-09-08T19:00:00.000Z',
      sourceEndpoint: 'https://example.test/kona',
    });

    expect(snapshot.identityStatus).toBe('provider_typed');
    expect(snapshot.rows[0].espnPlayerId).toBe('999');
    expect(JSON.stringify(snapshot.rows[0])).not.toMatch(/sleeper|canonical/i);
  });
});
