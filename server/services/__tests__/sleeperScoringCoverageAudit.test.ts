import { auditSleeperScoringCoverage } from '../sleeperScoringCoverageAudit';

describe('Sleeper scoring coverage audit', () => {
  it('certifies only the exact currently promoted Forecast xFPG PPR profile', () => {
    const audit = auditSleeperScoringCoverage({
      pass_yd: 0.04,
      pass_td: 4,
      pass_int: -1,
      rush_yd: 0.1,
      rush_td: 6,
      rec: 1,
      rec_yd: 0.1,
      rec_td: 6,
      bonus_pass_yd_300: 0,
    });

    expect(audit.status).toBe('GREEN');
    expect(audit.profileId).toBe('tiber_forecast_xfpg_ppr_v1');
    expect(audit.authority).toBe('TIBER-Forecast');
    expect(audit.recommendationAuthorityUnlocked).toBe(true);
    expect(audit.nonzeroKeyCount).toBe(8);
    expect(audit.coveredKeyCount).toBe(8);
    expect(audit.coveragePct).toBe(100);
    expect(audit.unsupportedKeys).toEqual([]);
    expect(audit.coefficientMismatches).toEqual([]);
    expect(audit.invalidKeys).toEqual([]);
  });

  it('fails a six-point passing-TD league rather than approximating it', () => {
    const audit = auditSleeperScoringCoverage({
      pass_yd: 0.04,
      pass_td: 6,
      pass_int: -1,
      rush_yd: 0.1,
      rush_td: 6,
      rec: 1,
      rec_yd: 0.1,
      rec_td: 6,
    });

    expect(audit.status).toBe('RED');
    expect(audit.recommendationAuthorityUnlocked).toBe(false);
    expect(audit.coveragePct).toBe(87.5);
    expect(audit.coefficientMismatches).toEqual(['pass_td']);
    expect(audit.entries.find((entry) => entry.key === 'pass_td')).toMatchObject({
      leagueCoefficient: 6,
      expectedCoefficient: 4,
      status: 'RED',
      reason: 'coefficient_mismatch',
    });
  });

  it('fails closed on bonuses and stat categories Forecast does not model', () => {
    const audit = auditSleeperScoringCoverage({
      pass_yd: 0.04,
      pass_td: 4,
      rush_yd: 0.1,
      rush_td: 6,
      rec: 1,
      rec_yd: 0.1,
      rec_td: 6,
      bonus_rec_te: 0.5,
      pass_2pt: 2,
      fum_lost: -2,
      def_td: 6,
    });

    expect(audit.status).toBe('RED');
    expect(audit.recommendationAuthorityUnlocked).toBe(false);
    expect(audit.unsupportedKeys).toEqual(['bonus_rec_te', 'def_td', 'fum_lost', 'pass_2pt']);
    expect(audit.coveredKeyCount).toBe(7);
    expect(audit.nonzeroKeyCount).toBe(11);
  });

  it('fails closed on malformed scoring values instead of coercing them to zero', () => {
    const audit = auditSleeperScoringCoverage({
      pass_yd: 'not-a-number',
      rec: 1,
    });

    expect(audit.status).toBe('RED');
    expect(audit.recommendationAuthorityUnlocked).toBe(false);
    expect(audit.invalidKeys).toEqual(['pass_yd']);
    expect(audit.entries.find((entry) => entry.key === 'pass_yd')).toMatchObject({
      leagueCoefficient: null,
      expectedCoefficient: 0.04,
      reason: 'invalid_value',
    });
  });

  it('returns green for an empty/non-contributing scoring map without inventing coverage rows', () => {
    const audit = auditSleeperScoringCoverage({ rec: 0, pass_td: 0 });

    expect(audit.status).toBe('GREEN');
    expect(audit.recommendationAuthorityUnlocked).toBe(true);
    expect(audit.nonzeroKeyCount).toBe(0);
    expect(audit.coveredKeyCount).toBe(0);
    expect(audit.coveragePct).toBe(100);
    expect(audit.entries).toEqual([]);
  });
});
