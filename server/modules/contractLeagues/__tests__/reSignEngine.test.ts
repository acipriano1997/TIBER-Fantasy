import { simulateContractReSign } from '../reSignEngine';
import { makeBoundaryPolicy, makeBoundaryRights, makeBoundarySnapshot } from './decisionBoundaryFixtures';

function makePolicy() {
  const base = makeBoundaryPolicy();
  return {
    ...base,
    cap: { ...base.cap, defaultCeiling: 500, salaryIncrement: 0.5 },
    contracts: {
      ...base.contracts,
      structures: [{
        id: 'resign-mid',
        displayName: 'Re-sign Mid',
        guaranteedShare: 0.5,
        optionalShare: 0.5,
        allowedDistributions: ['EVEN' as const],
      }],
      reSign: {
        enabled: true,
        allowance: { maxUses: 8, mode: 'ANCHORED_FROM_FIRST_USE' as const, windowSeasons: 5 },
        allowedPhases: ['OFFSEASON' as const],
        minYears: 2,
        maxYears: 4,
        allowedStructureIds: ['resign-mid'],
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

function makeSnapshot() {
  const base = makeBoundarySnapshot();
  const team = base.teams[0];
  return {
    ...base,
    teams: [{
      ...team,
      contracts: [{
        ...team.contracts[0],
        metadata: { ...team.contracts[0].metadata, reSignEligible: true },
      }],
      cap: [
        ...team.cap,
        { season: 2027, totalGuaranteed: 0, totalCapHit: 0, capAfterGuarantees: 500, capRemaining: 500 },
        { season: 2028, totalGuaranteed: 0, totalCapHit: 0, capAfterGuarantees: 500, capRemaining: 500 },
        { season: 2029, totalGuaranteed: 0, totalCapHit: 0, capAfterGuarantees: 500, capRemaining: 500 },
        { season: 2030, totalGuaranteed: 0, totalCapHit: 0, capAfterGuarantees: 500, capRemaining: 500 },
      ],
    }],
  };
}

function makePricingWitness() {
  return {
    schemaVersion: 'contract-re-sign-pricing-witness.v1' as const,
    leagueKey: 'league-boundary',
    asOf: '2026-09-15T12:15:00.000Z',
    player: {
      sourcePlayerName: 'Synthetic Player',
      canonicalPlayerId: 'synthetic-player',
      position: 'WR' as const,
    },
    eligibility: { confirmed: true, basisNotes: ['Synthetic eligibility.'] },
    pricing: {
      formulaKind: 'POSITION_RANK_MARKET_BAND_PREMIUM' as const,
      resolvedAnnualAav: 23,
      appliedRankBandCeiling: 10,
      accreditedSeasons: [
        { season: 2025, gamesPlayed: 17, rankMethod: 'TOTAL_POINTS_RANK' as const, resolvedPositionRank: 8 },
      ],
      marketBand: { baseAav: 20, premiumRate: 0.15, finalAav: 23 },
      sourceNote: null,
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

function makeActivationPolicy() {
  return {
    schemaVersion: 'contract-re-sign-activation-policy.v1' as const,
    leagueKey: 'league-boundary',
    effective: { season: 2026, effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveUntil: null },
    mode: 'AFTER_CURRENT_CONTRACT' as const,
    provenance: {
      sourceKind: 'commissioner_entry' as const,
      sourceDisplayName: 'Synthetic activation rule',
      sourceRef: null,
      sourceModifiedAt: '2026-09-15T12:00:00.000Z',
      importedAt: '2026-09-15T12:10:00.000Z',
      policyVersion: 'synthetic-activation.v1',
    },
    validation: { status: 'VALID' as const, warnings: [], unresolved: [] },
  };
}

function makeContext() {
  return {
    leagueKey: 'league-boundary',
    decisionAt: '2026-09-15T12:30:00.000Z',
    phase: 'OFFSEASON' as const,
    teamKey: 'team-boundary',
    sourceTeamName: 'Synthetic Team',
    reSignWindowStatus: 'OPEN' as const,
    rightsState: makeBoundaryRights(),
    pricingWitness: makePricingWitness(),
    activationPolicy: makeActivationPolicy(),
  };
}

function makeAction() {
  return {
    player: { canonicalPlayerId: 'synthetic-player', sourcePlayerName: 'Synthetic Player' },
    structureId: 'resign-mid',
    distribution: 'EVEN' as const,
    proposedYears: [
      { season: 2027, guaranteed: 11.5, optional: 11.5, capHit: 23 },
      { season: 2028, guaranteed: 11.5, optional: 11.5, capHit: 23 },
    ],
  };
}

describe('contract re-sign engine', () => {
  test('simulates a legal after-expiry extension and prospective scarce-right consumption', () => {
    const snapshot = makeSnapshot();
    const result = simulateContractReSign(snapshot, makePolicy(), makeContext(), makeAction());
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(true);
    expect(result.annualAav).toBe(23);
    expect(result.termYears).toBe(2);
    expect(result.seasonEffects.map((item) => item.after.capRemaining)).toEqual([477, 477]);
    expect(result.rightEffect?.remainingAfter).toBe(7);
    expect(snapshot.teams[0].cap[1].capRemaining).toBe(500);
  });

  test('abstains when activation timing is not authoritative', () => {
    const context = makeContext();
    context.activationPolicy = null;
    const result = simulateContractReSign(makeSnapshot(), makePolicy(), context, makeAction());
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('RE_SIGN_ACTIVATION_POLICY_UNAVAILABLE');
  });

  test('abstains instead of inventing replacement-of-remaining-years economics', () => {
    const context = makeContext();
    context.activationPolicy = { ...makeActivationPolicy(), mode: 'REPLACES_REMAINING_CONTRACT' as const };
    const result = simulateContractReSign(makeSnapshot(), makePolicy(), context, makeAction());
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('RE_SIGN_REPLACEMENT_ACTIVATION_UNMODELED');
  });

  test('marks a proposal illegal when the witnessed AAV does not match the offered contract', () => {
    const action = makeAction();
    action.proposedYears[1].guaranteed = 12;
    action.proposedYears[1].optional = 12;
    action.proposedYears[1].capHit = 24;
    const result = simulateContractReSign(makeSnapshot(), makePolicy(), makeContext(), action);
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('RE_SIGN_PRICE_MISMATCH');
  });

  test('marks a proposal illegal when the re-sign right is exhausted', () => {
    const context = makeContext();
    context.rightsState = {
      ...makeBoundaryRights(),
      usageEvents: Array.from({ length: 8 }, (_, index) => ({
        eventId: `resign-${index + 1}`,
        teamKey: 'team-boundary',
        rightType: 'RE_SIGN' as const,
        customRightId: null,
        season: 2026,
        occurredAt: `2026-09-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
        sourcePlayerName: `Synthetic ${index + 1}`,
        canonicalPlayerId: null,
        quantity: 1,
        sourceNote: null,
      })),
    };
    const result = simulateContractReSign(makeSnapshot(), makePolicy(), context, makeAction());
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('RE_SIGN_EXHAUSTED');
    expect(result.rightEffect).toBeNull();
  });

  test('abstains when a proposed extension season lacks authoritative cap-ledger coverage', () => {
    const snapshot = makeSnapshot();
    snapshot.teams[0].cap = snapshot.teams[0].cap.filter((item) => item.season !== 2028);
    const result = simulateContractReSign(snapshot, makePolicy(), makeContext(), makeAction());
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('CAP_LEDGER_SEASON_MISSING');
  });

  test('does not convert a valid price witness into eligibility when eligibility is unconfirmed', () => {
    const context = makeContext();
    context.pricingWitness = {
      ...makePricingWitness(),
      eligibility: { confirmed: false, basisNotes: ['Not yet confirmed.'] },
    };
    const result = simulateContractReSign(makeSnapshot(), makePolicy(), context, makeAction());
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('RE_SIGN_ELIGIBILITY_UNCONFIRMED');
  });
});
