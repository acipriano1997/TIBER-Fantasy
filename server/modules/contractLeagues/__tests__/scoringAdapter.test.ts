import { scoreFantasyStatLine } from '../../../enrichment/fantasyBox';
import { resolveLeagueScoring } from '../scoringAdapter';

describe('contract league scoring adapter', () => {
  it('converts yards-per-point fields into scoring rates', () => {
    const resolved = resolveLeagueScoring({
      passYardsPerPoint: 25,
      passTd: 4,
      interceptionThrown: -2,
      rushYardsPerPoint: 10,
      rushTd: 6,
      reception: 1,
      receivingYardsPerPoint: 10,
      receivingTd: 6,
      teReceptionBonus: 0.75,
      fumbleLost: -2,
      twoPointConversion: 2,
    });

    expect(resolved.status).toBe('READY');
    if (resolved.status !== 'READY') return;

    expect(resolved.scoring.passingYard).toBe(0.04);
    expect(resolved.scoring.receivingYard).toBe(0.1);
    expect(scoreFantasyStatLine({
      position: 'TE',
      receptions: 6,
      receiving_yards: 70,
      receiving_tds: 1,
    }, resolved.scoring)).toBe(23.5);
  });

  it('returns unavailable instead of substituting generic PPR', () => {
    const resolved = resolveLeagueScoring({
      passYardsPerPoint: 25,
      passTd: 4,
      interceptionThrown: -2,
      rushYardsPerPoint: 10,
      rushTd: 6,
      reception: 1,
      receivingYardsPerPoint: 10,
      receivingTd: 6,
      teReceptionBonus: null,
      fumbleLost: -2,
      twoPointConversion: 2,
    });

    expect(resolved).toEqual({
      status: 'UNAVAILABLE',
      missingFields: ['teReceptionBonus'],
    });
  });
});
