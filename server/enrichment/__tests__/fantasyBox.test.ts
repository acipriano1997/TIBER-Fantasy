import {
  enrichFantasy,
  pprScoring,
  scoreFantasyStatLine,
  type FantasyScoringSettings,
} from '../fantasyBox';

describe('fantasy scoring translation', () => {
  it('preserves the existing PPR enrichment result', () => {
    const enriched = enrichFantasy({
      position: 'WR',
      receptions: 6,
      receiving_yards: 70,
      receiving_tds: 1,
    });

    expect(enriched.fantasy_points_ppr).toBe(19);
    expect(enriched.fantasy_points_half_ppr).toBe(16);
    expect(enriched.fantasy_points_standard).toBe(13);
  });

  it('applies a TE reception premium without changing the football stat line', () => {
    const tePremium: FantasyScoringSettings = {
      ...pprScoring,
      teReceptionBonus: 0.75,
    };
    const statLine = {
      position: 'TE',
      receptions: 6,
      receiving_yards: 70,
      receiving_tds: 1,
    };

    expect(scoreFantasyStatLine(statLine, pprScoring)).toBe(19);
    expect(scoreFantasyStatLine(statLine, tePremium)).toBe(23.5);
  });

  it('does not apply the TE premium to a non-TE with the same stat line', () => {
    const tePremium: FantasyScoringSettings = {
      ...pprScoring,
      teReceptionBonus: 0.75,
    };

    expect(scoreFantasyStatLine({
      position: 'WR',
      receptions: 6,
      receiving_yards: 70,
      receiving_tds: 1,
    }, tePremium)).toBe(19);
  });
});
