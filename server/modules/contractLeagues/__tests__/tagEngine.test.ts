import { simulateContractTag } from '../tagEngine';
import { makeBoundaryPolicy, makeBoundaryRights, makeBoundarySnapshot } from './decisionBoundaryFixtures';

function makePolicy(type: 'FRANCHISE' | 'TRANSITION' | 'RFA' | 'CUSTOM' = 'FRANCHISE') {
  const base = makeBoundaryPolicy();
  return {
    ...base,
    contracts: {
      ...base.contracts,
      tags: [{
        id: 'synthetic-tag',
        type,
        usesPerOffseason: 1,
        contractYears: 1,
        pricing: { kind: 'FIXED_AMOUNT' as const, amount: 20 },
        minimumGuaranteedShare: 0.5,
        taggedTeamCanBid: type === 'RFA' ? true : null,
        matchPremiumRate: type === 'RFA' ? 0.1 : null,
        repeatBySameTeamAllowed: false,
        noBidFallbackMinimumGuaranteedShare: type === 'RFA' ? 0.5 : null,
      }],
    },
  };
}

function makeSnapshot() {
  const base = makeBoundarySnapshot();
  return {
    ...base,
    teams: base.teams.map((team) => ({
      ...team,
      cap: [
        ...team.cap,
        { season: 2027, totalGuaranteed: 0, totalCapHit: 0, capAfterGuarantees: 500, capRemaining: 500 },
      ],
    })),
  };
}

function makeWitness() {
  return {
    schemaVersion: 'contract-tag-offer-witness.v1' as const,
    leagueKey: 'league-boundary',
    tagPolicyId: 'synthetic-tag',
    asOf: '2026-09-15T12:15:00.000Z',
    player: { sourcePlayerName: 'Synthetic Player', canonicalPlayerId: 'synthetic-player', position: 'WR' as const },
    eligibility: { confirmed: true, basisNotes: ['Synthetic eligibility.'] },
    terms: {
      startSeason: 2027,
      resolvedAnnualAav: 20,
      appliedRankBandCeiling: null,
      accreditedSeasons: [],
      marketBand: null,
      sourceNote: null,
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

function makeContext() {
  return {
    leagueKey: 'league-boundary',
    decisionAt: '2026-09-15T12:30:00.000Z',
    phase: 'REGULAR_SEASON' as const,
    teamKey: 'team-boundary',
    sourceTeamName: 'Synthetic Team',
    tagWindowStatus: 'OPEN' as const,
    rightsState: makeBoundaryRights(),
    offerWitness: makeWitness(),
  };
}

function makeAction() {
  return {
    player: { canonicalPlayerId: 'synthetic-player', sourcePlayerName: 'Synthetic Player' },
    tagPolicyId: 'synthetic-tag',
    proposedYears: [{ season: 2027, guaranteed: 10, optional: 10, capHit: 20 }],
  };
}

describe('contract tag engine', () => {
  test('simulates a legal franchise tag and prospective right consumption', () => {
    const result = simulateContractTag(makeSnapshot(), makePolicy(), makeContext(), makeAction());
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(true);
    expect(result.tagType).toBe('FRANCHISE');
    expect(result.annualAav).toBe(20);
    expect(result.seasonEffects[0].after.capRemaining).toBe(480);
    expect(result.rightEffect?.rightType).toBe('FRANCHISE_TAG');
    expect(result.rightEffect?.remainingAfter).toBe(0);
  });

  test('maps an RFA tender to the RFA scarce-right ledger', () => {
    const result = simulateContractTag(makeSnapshot(), makePolicy('RFA'), makeContext(), makeAction());
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.tagType).toBe('RFA');
    expect(result.rightEffect?.rightType).toBe('RFA');
  });

  test('marks a tag illegal when the offseason use is exhausted', () => {
    const context = makeContext();
    context.rightsState = {
      ...makeBoundaryRights(),
      usageEvents: [{
        eventId: 'tag-used', teamKey: 'team-boundary', rightType: 'FRANCHISE_TAG' as const, customRightId: null,
        season: 2026, occurredAt: '2026-09-01T10:00:00.000Z', sourcePlayerName: 'Other Player', canonicalPlayerId: null,
        quantity: 1, sourceNote: null,
      }],
    };
    const result = simulateContractTag(makeSnapshot(), makePolicy(), context, makeAction());
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('TAG_EXHAUSTED');
    expect(result.rightEffect).toBeNull();
  });

  test('abstains when tag offer evidence is from after the frozen decision', () => {
    const context = makeContext();
    context.offerWitness = { ...makeWitness(), asOf: '2026-09-16T12:15:00.000Z' };
    const result = simulateContractTag(makeSnapshot(), makePolicy(), context, makeAction());
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('TAG_OFFER_AS_OF_AFTER_DECISION');
  });

  test('abstains instead of inventing a missing future cap ledger', () => {
    const snapshot = makeSnapshot();
    snapshot.teams[0].cap = snapshot.teams[0].cap.filter((item) => item.season !== 2027);
    const result = simulateContractTag(snapshot, makePolicy(), makeContext(), makeAction());
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('CAP_LEDGER_SEASON_MISSING');
  });

  test('rejects a repeat tag on the same player when policy forbids it', () => {
    const context = makeContext();
    context.rightsState = {
      ...makeBoundaryRights(),
      usageEvents: [{
        eventId: 'old-player-tag', teamKey: 'team-boundary', rightType: 'FRANCHISE_TAG' as const, customRightId: null,
        season: 2025, occurredAt: '2025-08-01T10:00:00.000Z', sourcePlayerName: 'Synthetic Player', canonicalPlayerId: 'synthetic-player',
        quantity: 1, sourceNote: null,
      }],
    };
    const result = simulateContractTag(makeSnapshot(), makePolicy(), context, makeAction());
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('TAG_REPEAT_NOT_ALLOWED');
  });
});
