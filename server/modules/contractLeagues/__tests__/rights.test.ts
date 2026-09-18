import {
  contractLeagueRightsStateSchema,
  deriveContractRightAvailability,
  type ContractLeagueRightsState,
} from '../rights';

function makeState(): ContractLeagueRightsState {
  return contractLeagueRightsStateSchema.parse({
    schemaVersion: 'contract-league-rights-state.v1',
    leagueKey: 'synthetic-contract-league',
    asOf: '2034-09-15T12:00:00.000Z',
    usageEvents: [
      {
        eventId: 'use-1',
        teamKey: 'team-a',
        rightType: 'RESTRUCTURE',
        customRightId: null,
        season: 2031,
        occurredAt: '2031-04-01T12:00:00.000Z',
        sourcePlayerName: 'Synthetic Player A',
        canonicalPlayerId: 'tbr_p_synthetic_a',
        quantity: 1,
        sourceNote: null,
      },
      {
        eventId: 'use-2',
        teamKey: 'team-a',
        rightType: 'RESTRUCTURE',
        customRightId: null,
        season: 2033,
        occurredAt: '2033-04-01T12:00:00.000Z',
        sourcePlayerName: 'Synthetic Player B',
        canonicalPlayerId: 'tbr_p_synthetic_b',
        quantity: 1,
        sourceNote: null,
      },
      {
        eventId: 'amnesty-1',
        teamKey: 'team-a',
        rightType: 'AMNESTY',
        customRightId: null,
        season: 2032,
        occurredAt: null,
        sourcePlayerName: null,
        canonicalPlayerId: null,
        quantity: 1,
        sourceNote: null,
      },
      {
        eventId: 'other-team',
        teamKey: 'team-b',
        rightType: 'RESTRUCTURE',
        customRightId: null,
        season: 2034,
        occurredAt: null,
        sourcePlayerName: null,
        canonicalPlayerId: null,
        quantity: 1,
        sourceNote: null,
      },
    ],
    resetEvents: [],
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic Rights Fixture',
      sourceRef: null,
      sourceModifiedAt: null,
      importedAt: '2034-09-15T12:00:00.000Z',
      importerVersion: 'synthetic-rights-importer.v1',
    },
    validation: {
      status: 'VALID',
      warnings: [],
      unresolved: [],
    },
  });
}

describe('contract league rights state', () => {
  it('derives lifetime remaining rights from immutable usage events', () => {
    const availability = deriveContractRightAvailability(
      makeState(),
      { teamKey: 'team-a', rightType: 'AMNESTY' },
      { maxUses: 2, mode: 'LIFETIME', windowSeasons: null },
      2034,
    );

    expect(availability.used).toBe(1);
    expect(availability.remaining).toBe(1);
    expect(availability.contributingEventIds).toEqual(['amnesty-1']);
  });

  it('derives a rolling window without counting another team', () => {
    const availability = deriveContractRightAvailability(
      makeState(),
      { teamKey: 'team-a', rightType: 'RESTRUCTURE' },
      { maxUses: 3, mode: 'ROLLING', windowSeasons: 3 },
      2034,
    );

    expect(availability.windowStartSeason).toBe(2032);
    expect(availability.used).toBe(1);
    expect(availability.remaining).toBe(2);
    expect(availability.contributingEventIds).toEqual(['use-2']);
  });

  it('anchors a window at first use and starts a new window after expiration', () => {
    const state = makeState();
    state.usageEvents.push({
      eventId: 'use-3',
      teamKey: 'team-a',
      rightType: 'RESTRUCTURE',
      customRightId: null,
      season: 2036,
      occurredAt: null,
      sourcePlayerName: null,
      canonicalPlayerId: null,
      quantity: 1,
      sourceNote: null,
    });

    const availability = deriveContractRightAvailability(
      state,
      { teamKey: 'team-a', rightType: 'RESTRUCTURE' },
      { maxUses: 4, mode: 'ANCHORED_FROM_FIRST_USE', windowSeasons: 4 },
      2036,
    );

    expect(availability.windowStartSeason).toBe(2036);
    expect(availability.windowEndSeason).toBe(2039);
    expect(availability.used).toBe(1);
    expect(availability.contributingEventIds).toEqual(['use-3']);
  });

  it('honors an explicit reset without mutating historical usage', () => {
    const state = makeState();
    state.resetEvents.push({
      eventId: 'reset-1',
      teamKey: 'team-a',
      rightType: 'RESTRUCTURE',
      customRightId: null,
      effectiveSeason: 2033,
      occurredAt: '2033-01-01T00:00:00.000Z',
      reason: 'COMMISSIONER_CORRECTION',
      sourceNote: null,
    });

    const availability = deriveContractRightAvailability(
      state,
      { teamKey: 'team-a', rightType: 'RESTRUCTURE' },
      { maxUses: 3, mode: 'LIFETIME', windowSeasons: null },
      2034,
    );

    expect(availability.used).toBe(1);
    expect(availability.remaining).toBe(2);
    expect(availability.contributingEventIds).toEqual(['use-2']);
    expect(availability.resetEventId).toBe('reset-1');
  });

  it('requires an explicit identifier for custom rights', () => {
    const state = makeState();
    state.usageEvents.push({
      eventId: 'custom-bad',
      teamKey: 'team-a',
      rightType: 'CUSTOM',
      customRightId: null,
      season: 2034,
      occurredAt: null,
      sourcePlayerName: null,
      canonicalPlayerId: null,
      quantity: 1,
      sourceNote: null,
    });

    expect(contractLeagueRightsStateSchema.safeParse(state).success).toBe(false);
  });

  it('rejects duplicate event IDs across usage and reset history', () => {
    const state = makeState();
    state.resetEvents.push({
      eventId: 'use-1',
      teamKey: 'team-a',
      rightType: 'AMNESTY',
      customRightId: null,
      effectiveSeason: 2034,
      occurredAt: null,
      reason: 'OTHER',
      sourceNote: null,
    });

    expect(contractLeagueRightsStateSchema.safeParse(state).success).toBe(false);
  });
});
