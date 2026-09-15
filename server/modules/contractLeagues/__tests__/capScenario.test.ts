import { finalizeCapScenario, validateCapScenario } from '../capScenario';

function baseScenario() {
  return {
    schemaVersion: 'contract-cap-scenario.v1' as const,
    scenarioId: 'scenario-1',
    leagueKey: 'league-boundary',
    baseSnapshotFingerprint: 'sha256:snapshot',
    policyVersion: 'policy-v1',
    rightsStateFingerprint: 'sha256:rights',
    decisionAsOf: '2026-09-15T12:30:00.000Z',
    ccfEvidenceFingerprint: null,
    assumptions: [{
      type: 'RESERVE_BUDGET' as const,
      category: 'IN_SEASON',
      amount: 20,
      season: 2026,
    }],
    proposedActions: [],
    constraints: [{
      type: 'MINIMUM_CAP_ROOM' as const,
      season: 2026,
      amount: 50,
    }],
    objective: 'PROTECT_FUTURE_FLEXIBILITY' as const,
    origin: { createdBy: 'USER' as const, label: 'Keep room available' },
  };
}

describe('contract cap scenario manifest', () => {
  it('fingerprints identical frozen scenarios deterministically', () => {
    const first = finalizeCapScenario(baseScenario());
    const second = finalizeCapScenario(baseScenario());

    expect(first.scenarioFingerprint).toBe(second.scenarioFingerprint);
    expect(first.scenarioFingerprint).toMatch(/^sha256:/);
  });

  it('changes the fingerprint when an explicit assumption changes', () => {
    const first = finalizeCapScenario(baseScenario());
    const changed = baseScenario();
    changed.assumptions[0].amount = 25;
    const second = finalizeCapScenario(changed);

    expect(first.scenarioFingerprint).not.toBe(second.scenarioFingerprint);
  });

  it('fails closed on a player assumption without an identity witness', () => {
    const input = baseScenario();
    input.assumptions = [{
      type: 'RETAIN_PLAYER',
      player: { canonicalPlayerId: null, sourcePlayerName: null },
      throughSeason: 2027,
    } as never];

    expect(validateCapScenario(input).success).toBe(false);
  });
});
