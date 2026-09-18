import { resolveTagOfferWitness } from '../tagOfferWitness';
import { makeBoundaryPolicy } from './decisionBoundaryFixtures';

function makePolicy() {
  const base = makeBoundaryPolicy();
  return {
    ...base,
    contracts: {
      ...base.contracts,
      tags: [{
        id: 'synthetic-tag',
        type: 'FRANCHISE' as const,
        usesPerOffseason: 1,
        contractYears: 1,
        pricing: {
          kind: 'POSITION_RANK_MARKET_BAND_PREMIUM' as const,
          lookbackSeasons: 3,
          premiumRate: 0.15,
          rankBands: [5, 10, 15, 20],
          fullSeasonMinGames: 14,
          partialSeasonMinGames: 5,
          partialSeasonMethod: 'PPG_TO_FULL_SEASON_RANK' as const,
          minAccreditedSeasons: 1,
        },
        minimumGuaranteedShare: 0.5,
        taggedTeamCanBid: null,
        matchPremiumRate: null,
        repeatBySameTeamAllowed: false,
        noBidFallbackMinimumGuaranteedShare: null,
      }],
    },
  };
}

function makeWitness() {
  return {
    schemaVersion: 'contract-tag-offer-witness.v1' as const,
    leagueKey: 'league-boundary',
    tagPolicyId: 'synthetic-tag',
    asOf: '2026-09-15T12:15:00.000Z',
    player: {
      sourcePlayerName: 'Synthetic Player',
      canonicalPlayerId: 'synthetic-player',
      position: 'WR' as const,
    },
    eligibility: {
      confirmed: true,
      basisNotes: ['Synthetic eligibility witness.'],
    },
    terms: {
      startSeason: 2027,
      resolvedAnnualAav: 23,
      appliedRankBandCeiling: 10,
      accreditedSeasons: [
        { season: 2025, gamesPlayed: 17, rankMethod: 'TOTAL_POINTS_RANK' as const, resolvedPositionRank: 8 },
        { season: 2024, gamesPlayed: 8, rankMethod: 'PPG_TO_FULL_SEASON_RANK' as const, resolvedPositionRank: 11 },
      ],
      marketBand: {
        baseAav: 20,
        premiumRate: 0.15,
        finalAav: 23,
      },
      sourceNote: 'Synthetic tag pricing evidence.',
    },
    provenance: {
      sourceKind: 'commissioner_table' as const,
      sourceDisplayName: 'Synthetic tag table',
      sourceRef: null,
      sourceModifiedAt: '2026-09-15T12:05:00.000Z',
      importedAt: '2026-09-15T12:20:00.000Z',
      producerVersion: 'synthetic-tag.v1',
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

describe('tag offer witness boundary', () => {
  test('accepts a known-at policy-compatible premium-band witness deterministically', () => {
    const witness = makeWitness();
    const result = resolveTagOfferWitness(witness, makePolicy(), context);
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.annualAav).toBe(23);
    expect(result.startSeason).toBe(2027);
    expect(result.eligible).toBe(true);
    expect(result.tagPolicy.id).toBe('synthetic-tag');
    expect(result.fingerprint).toMatch(/^sha256:/);
    expect(resolveTagOfferWitness(witness, makePolicy(), context)).toEqual(result);
  });

  test('rejects evidence imported after the frozen decision time', () => {
    const witness = makeWitness();
    witness.provenance.importedAt = '2026-09-15T12:31:00.000Z';
    const result = resolveTagOfferWitness(witness, makePolicy(), context);
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('TAG_OFFER_IMPORTED_AFTER_DECISION');
  });

  test('rejects premium arithmetic that does not reproduce league policy', () => {
    const witness = makeWitness();
    witness.terms.marketBand!.finalAav = 24;
    witness.terms.resolvedAnnualAav = 24;
    const result = resolveTagOfferWitness(witness, makePolicy(), context);
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('TAG_PRICE_ARITHMETIC_MISMATCH');
  });

  test('rejects a tag policy identity mismatch', () => {
    const witness = makeWitness();
    witness.tagPolicyId = 'missing-tag';
    const result = resolveTagOfferWitness(witness, makePolicy(), context);
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('TAG_POLICY_UNRESOLVED');
  });

  test('rejects the wrong rank method for a partial accredited season', () => {
    const witness = makeWitness();
    witness.terms.accreditedSeasons[1].rankMethod = 'TOTAL_POINTS_RANK';
    const result = resolveTagOfferWitness(witness, makePolicy(), context);
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('TAG_PARTIAL_SEASON_METHOD_MISMATCH');
  });

  test('preserves eligibility as a separate witnessed fact', () => {
    const witness = makeWitness();
    witness.eligibility.confirmed = false;
    const result = resolveTagOfferWitness(witness, makePolicy(), context);
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.eligible).toBe(false);
  });
});
