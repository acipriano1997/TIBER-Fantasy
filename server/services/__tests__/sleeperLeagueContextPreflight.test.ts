const mockGet = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({ get: mockGet }),
  },
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import { sleeperSyncService } from '../sleeperSyncService';

describe('Sleeper live league-context production preflight', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('materializes live league, roster, matchup, scoring, and provenance truth', async () => {
    mockGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/league/123') {
        return {
          status: 200,
          data: {
            league_id: '123',
            settings: { leg: 1, reserve_slots: 2 },
            scoring_settings: { pass_td: 6, rec: 1 },
            roster_positions: ['QB', 'RB', 'WR', 'FLEX', 'BN'],
          },
        };
      }
      if (endpoint === '/league/123/rosters') {
        return { status: 200, data: [{ roster_id: 1, owner_id: 'u1' }] };
      }
      if (endpoint === '/league/123/matchups/1') {
        return { status: 200, data: [{ roster_id: 1, matchup_id: 1 }] };
      }
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    });

    const context = await sleeperSyncService.materializeLeagueContext('123');

    expect(context.league_id).toBe('123');
    expect(context.week).toBe(1);
    expect(context.leagues).toHaveLength(1);
    expect(context.rosters).toEqual([{ roster_id: 1, owner_id: 'u1' }]);
    expect(context.matchups).toEqual([{ roster_id: 1, matchup_id: 1 }]);
    expect(context.scoring_settings).toEqual({ pass_td: 6, rec: 1 });
    expect(context.roster_positions).toEqual(['QB', 'RB', 'WR', 'FLEX', 'BN']);
    expect(context.settings).toEqual({ leg: 1, reserve_slots: 2 });
    expect(context.provenance.source).toBe('sleeper');
    expect(context.provenance.mode).toBe('live');
    expect(context.provenance.complete).toBe(true);
    expect(context.provenance.endpoints.matchups).toBe('/league/123/matchups/1');
  });

  it('returns typed LEAGUE_NOT_FOUND rather than partial or synthetic context', async () => {
    mockGet.mockResolvedValue({ status: 404, data: null });

    await expect(sleeperSyncService.materializeLeagueContext('missing')).rejects.toMatchObject({
      code: 'LEAGUE_NOT_FOUND',
      status: 404,
    });
  });

  it('fails closed with PARTIAL_UPSTREAM when a required live resource is missing', async () => {
    mockGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/league/123') {
        return {
          status: 200,
          data: {
            league_id: '123',
            settings: { leg: 1 },
            scoring_settings: { rec: 1 },
            roster_positions: ['QB', 'RB'],
          },
        };
      }
      if (endpoint === '/league/123/rosters') {
        return { status: 503, data: null };
      }
      if (endpoint === '/league/123/matchups/1') {
        return { status: 200, data: [] };
      }
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    });

    try {
      await sleeperSyncService.materializeLeagueContext('123');
      throw new Error('Expected PARTIAL_UPSTREAM');
    } catch (error: any) {
      expect(error.code).toBe('PARTIAL_UPSTREAM');
      expect(error.status).toBe(206);
      expect(error.details.missing).toEqual(['rosters']);
      expect(error.details.context.rosters).toBeNull();
      expect(error.details.context.matchups).toEqual([]);
      expect(error.details.context.provenance.complete).toBe(false);
      expect(JSON.stringify(error.details.context)).not.toContain('synthetic');
      expect(JSON.stringify(error.details.context)).not.toContain('fallback');
    }
  });

  it('uses live NFL state only when league settings do not provide a usable week', async () => {
    mockGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/league/123') {
        return {
          status: 200,
          data: {
            league_id: '123',
            settings: {},
            scoring_settings: {},
            roster_positions: [],
          },
        };
      }
      if (endpoint === '/state/nfl') {
        return { status: 200, data: { week: 2, season: '2026' } };
      }
      if (endpoint === '/league/123/rosters') return { status: 200, data: [] };
      if (endpoint === '/league/123/matchups/2') return { status: 200, data: [] };
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    });

    const context = await sleeperSyncService.materializeLeagueContext('123');
    expect(context.week).toBe(2);
    expect(context.provenance.endpoints.matchups).toBe('/league/123/matchups/2');
  });
});
