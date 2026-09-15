import {
  getDevyRightsSource,
  getLeagueSourceLink,
  normalizeManagerHandle,
} from '../leagueSourceRegistry';

describe('devy supplemental league source registry', () => {
  it('normalizes Sleeper and sheet manager handles to the same identity key', () => {
    expect(normalizeManagerHandle('@cippy97')).toBe('cippy97');
    expect(normalizeManagerHandle('Cippy97')).toBe('cippy97');
  });

  it('resolves Devy and Big Boobs to the canonical Google Sheet source', async () => {
    const link = await getLeagueSourceLink('sleeper', '1383497639848341504');
    expect(link?.league.name).toBe('Devy and Big Boobs');
    expect(link?.league.platformUsername).toBe('Cippy97');

    const source = await getDevyRightsSource('1383497639848341504');
    expect(source?.spreadsheetId).toBe('1xzg7FHcBTSJoXq6JiIApBsJ3upXLjG5a3KK77mml6qc');
    expect(source?.sheetName).toBe('Sheet1');
    expect(normalizeManagerHandle(source?.ownerSelector.value ?? '')).toBe('cippy97');
    expect(source?.joinPolicy.mode).toBe('supplement');
    expect(source?.joinPolicy.neverTreatDevyProspectsAsSleeperNflRosterPlayers).toBe(true);
  });
});
