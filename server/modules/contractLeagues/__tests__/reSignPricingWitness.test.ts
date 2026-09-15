import { resolveReSignPricingWitness } from '../reSignPricingWitness';
import { makeBoundaryPolicy } from './decisionBoundaryFixtures';

function makeReSignPolicy() {
  const base = makeBoundaryPolicy();
  return {
    ...base,
    contracts: {
      ...base.contracts,
      reSign: {
        enabled: true,
        allowance: { maxUses: 8, mode: 'ANCHORED_FROM_FIRST_USE' as const, windowSeasons: 5 },
        allowedPhases: ['OFFSEASON' as const],
        minYears: 2,
        maxYears: 4,
        allowedStructureIds: ['synthetic'],
        pricing: {
          kind: 'POSITION_RANK_MARKET_BAND_PREMIUM' as const,
          lookbackSeasons: 3,
          premiumRate: 0.15,
          rankBands: [5, 10, 15, 20, 25, 30, 40, 50],
          fullSeasonMinGames: 14,
          partialSeasonMinGames: 5,
          partialSeasonMethod: 'PPG_TO_FULL_SEASON_RANK' as const,
          minAccreditedSeasons: 1,
        },
      },
    },
  };
}

function makeWitness() {
  return {
    schemaVersion: 'contract-re-sign-pricing-witness.v1' as const,
    leagueKey: 'league-boundary',
    asOf: '2026-09-15T12:15:00.000Z',
    player: {
      sourcePlayerName: 'Synthetic Player',
      canonicalPlayerId: 'synthetic-player',
      position: 'WR' as const,
    },
    eligibility: {
      confirmed: true,
      basisNotes: ['Synthetic eligibility witness for regression coverage.'],
    },
    pricing: {
      formulaKind: 'POSITION_RANK_MARKET_BAND_PREMIUM' as const,
      resolvedAnnualAav: 23,
      appliedRankBandCeiling: 10,
      accreditedSeasons: [
        { season: 2025, gamesPlayed: 17, rankMethod: 'TOTAL_POINTS_RANK' as const, resolvedPositionRank: 8 },
        { season: 2024, gamesPlayed: 8, rankMethod: 'PPG_TO_FULL_SEASON_RANK' as const, resolvedPositionRank: 11 },
        { season: 2023, gamesPlayed: 16, rankMethod: 'TOTAL_POINTS_RANK' as const, resolvedPositionRank: 9 },
      ],
      marketBand: {
        baseAav: 20,
        premiumRate: 0.15,
        finalAav: 23,
      },
      sourceNote: 'Synthetic market band.',
    },
    provenance: {
      sourceKind: 'commissioner_table' as const,
      sourceDisplayName: 'Synthetic re-sign table',
      sourceRef: null,
      sourceModifiedAt: '2026-09-15T12:05:00.000Z',
      importedAt: '2026-09-15T12:20:00.000Z',
      producerVersion: 'synthetic-pricing.v1',
    },
    validation: { status: 'VALID' as const, warnings: [], unresolved: [] },
  };
}

const context = {
  leagueKey: 'league-boundary',
  decisionAt: '2026-09-15T12:30:00.000Z',
  sourcePlayerName: 'Synthetic Player',
  canonicalPlayerId: 'synthetic-player',
  position: 'WR' as const,
};

describe('re-sign pricing witness boundary', () => {
  test('accepts a policy-compatible known-at premium-band witness', () => {
    const witness = makeWitness();
    const result = resolveReSignPricingWitness(witness, makeReSignPolicy(), context);
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.annualAav).toBe(23);
    expect(result.eligible).toBe(true);
    expect(result.appliedRankBandCeiling).toBe(10);
    expect(result.fingerprint).toMatch(/^sha256:/);
    expect(resolveReSignPricingWitness(witness, makeReSignPolicy(), context)).toEqual(result);
  });

  test('rejects pricing evidence imported after the frozen decision time', () => {
    const witness = makeWitness();
    witness.provenance.importedAt = '2026-09-15T12:31:00.000Z';
    const result = resolveReSignPricingWitness(witness, makeReSignPolicy(), context);
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('RE_SIGN_PRICE_IMPORTED_AFTER_DECISION');
  });

  test('rejects a formula kind that does not match league policy', () => {
    const witness = makeWitness();
    witness.pricing.formulaKind = 'FIXED_AMOUNT';
    const result = resolveReSignPricingWitness(witness, makeReSignPolicy(), context);
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('RE_SIGN_PRICE_FORMULA_MISMATCH');
  });

  test('rejects arithmetic that does not reproduce the policy premium', () => {
    const witness = makeWitness();
    witness.pricing.marketBand!.finalAav = 24;
    witness.pricing.resolvedAnnualAav = 24;
    const result = resolveReSignPricingWitness(witness, makeReSignPolicy(), context);
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('RE_SIGN_MARKET_PRICE_ARITHMETIC_MISMATCH');
  });

  test('rejects the wrong rank method for a partial accredited season', () => {
    const witness = makeWitness();
    witness.pricing.accreditedSeasons[1].rankMethod = 'TOTAL_POINTS_RANK';
    const result = resolveReSignPricingWitness(witness, makeReSignPolicy(), context);
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('RE_SIGN_PARTIAL_SEASON_METHOD_MISMATCH');
  });

  test('rejects a season below the minimum games needed for accreditation', () => {
    const witness = makeWitness();
    witness.pricing.accreditedSeasons[1].gamesPlayed = 4;
    const result = resolveReSignPricingWitness(witness, makeReSignPolicy(), context);
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('RE_SIGN_UNACCREDITED_SEASON_INCLUDED');
  });

  test('preserves eligibility as a separate witnessed fact instead of inventing it', () => {
    const witness = makeWitness();
    witness.eligibility.confirmed = false;
    witness.eligibility.basisNotes = ['Authoritative source has not confirmed eligibility.'];
    const result = resolveReSignPricingWitness(witness, makeReSignPolicy(), context);
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.eligible).toBe(false);
  });
});
