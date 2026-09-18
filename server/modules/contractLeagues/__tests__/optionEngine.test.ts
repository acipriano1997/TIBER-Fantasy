import { simulateContractOption } from '../optionEngine';
import { makeBoundaryPolicy, makeBoundarySnapshot } from './decisionBoundaryFixtures';

function makePolicy() {
  const base = makeBoundaryPolicy();
  return { ...base, cap: { ...base.cap, defaultCeiling: 500, salaryIncrement: 0.5 } };
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
        years: [
          ...team.contracts[0].years,
          { season: 2027, guaranteed: 0, optional: 12, capHit: 12 },
        ],
      }],
      cap: [
        ...team.cap,
        { season: 2027, totalGuaranteed: 0, totalCapHit: 12, capAfterGuarantees: 500, capRemaining: 488 },
      ],
    }],
  };
}

function makeWitness() {
  return {
    schemaVersion: 'contract-option-exercise-witness.v1' as const,
    leagueKey: 'league-boundary',
    optionId: 'synthetic-2027-option',
    asOf: '2026-09-15T12:15:00.000Z',
    player: { sourcePlayerName: 'Synthetic Player', canonicalPlayerId: 'synthetic-player' },
    eligibility: { confirmed: true, basisNotes: ['Synthetic option eligibility.'] },
    decisionWindow: { opensAt: '2026-09-01T00:00:00.000Z', closesAt: '2026-10-01T00:00:00.000Z' },
    outcomes: {
      exercise: { resultingYears: [{ season: 2027, guaranteed: 12, optional: 0, capHit: 12 }] },
      decline: { resultingYears: [{ season: 2027, guaranteed: 0, optional: 0, capHit: 0 }] },
    },
    provenance: {
      sourceKind: 'commissioner_table' as const,
      sourceDisplayName: 'Synthetic option table',
      sourceRef: null,
      sourceModifiedAt: '2026-09-15T12:05:00.000Z',
      importedAt: '2026-09-15T12:20:00.000Z',
      producerVersion: 'synthetic-option.v1',
    },
    validation: { status: 'VALID' as const, warnings: [], unresolved: [] },
  };
}

function makeContext() {
  return {
    leagueKey: 'league-boundary',
    decisionAt: '2026-09-15T12:30:00.000Z',
    phase: 'REGULAR_SEASON' as const,
    sourceTeamName: 'Synthetic Team',
    optionWindowStatus: 'OPEN' as const,
    witness: makeWitness(),
  };
}

function makeAction(decision: 'EXERCISE' | 'DECLINE' = 'EXERCISE') {
  return {
    player: { canonicalPlayerId: 'synthetic-player', sourcePlayerName: 'Synthetic Player' },
    optionId: 'synthetic-2027-option',
    decision,
  };
}

describe('contract option engine', () => {
  test('exercises an authoritative option by converting scheduled optional money to guaranteed money', () => {
    const snapshot = makeSnapshot();
    const result = simulateContractOption(snapshot, makePolicy(), makeContext(), makeAction());
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(true);
    expect(result.seasonEffects[0].delta).toEqual({ guaranteed: 12, optional: -12, capHit: 0 });
    expect(result.seasonEffects[0].afterLedger.totalGuaranteed).toBe(12);
    expect(result.seasonEffects[0].afterLedger.capRemaining).toBe(488);
    expect(snapshot.teams[0].contracts[0].years.find((year) => year.season === 2027)?.optional).toBe(12);
  });

  test('declines an option using the authoritative zeroed outcome rather than inventing release economics', () => {
    const result = simulateContractOption(makeSnapshot(), makePolicy(), makeContext(), makeAction('DECLINE'));
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(true);
    expect(result.seasonEffects[0].delta).toEqual({ guaranteed: 0, optional: -12, capHit: -12 });
    expect(result.seasonEffects[0].afterLedger.capRemaining).toBe(500);
  });

  test('marks the option illegal when eligibility is not confirmed', () => {
    const context = makeContext();
    context.witness = { ...makeWitness(), eligibility: { confirmed: false, basisNotes: ['Not confirmed.'] } };
    const result = simulateContractOption(makeSnapshot(), makePolicy(), context, makeAction());
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('OPTION_ELIGIBILITY_UNCONFIRMED');
  });

  test('abstains when the option witness arrives after the frozen decision time', () => {
    const context = makeContext();
    context.witness = { ...makeWitness(), asOf: '2026-09-16T12:15:00.000Z' };
    const result = simulateContractOption(makeSnapshot(), makePolicy(), context, makeAction());
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('OPTION_AS_OF_AFTER_DECISION');
  });

  test('abstains when the selected outcome is not authoritative', () => {
    const context = makeContext();
    context.witness = { ...makeWitness(), outcomes: { ...makeWitness().outcomes, decline: null } };
    const result = simulateContractOption(makeSnapshot(), makePolicy(), context, makeAction('DECLINE'));
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('OPTION_OUTCOME_UNAVAILABLE');
  });

  test('abstains when the affected season has no authoritative cap ledger', () => {
    const snapshot = makeSnapshot();
    snapshot.teams[0].cap = snapshot.teams[0].cap.filter((row) => row.season !== 2027);
    const result = simulateContractOption(snapshot, makePolicy(), makeContext(), makeAction());
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('CAP_LEDGER_SEASON_MISSING');
  });

  test('keeps an option proposal non-executable when the external window is closed', () => {
    const context = makeContext();
    context.optionWindowStatus = 'CLOSED';
    const result = simulateContractOption(makeSnapshot(), makePolicy(), context, makeAction());
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('OPTION_WINDOW_CLOSED');
  });
});
