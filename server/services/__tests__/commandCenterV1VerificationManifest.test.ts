import {
  COMMAND_CENTER_V1_GATE2_REQUIRED_CAPABILITIES,
  COMMAND_CENTER_V1_VERIFICATION,
  isCommandCenterV1Gate2Complete,
} from '../../../shared/commandCenterV1VerificationManifest';

describe('Command Center v1 Gate 2 verification manifest', () => {
  test('enumerates each required verification capability exactly once', () => {
    expect(new Set(COMMAND_CENTER_V1_GATE2_REQUIRED_CAPABILITIES).size).toBe(
      COMMAND_CENTER_V1_GATE2_REQUIRED_CAPABILITIES.length,
    );
    expect(Object.keys(COMMAND_CENTER_V1_VERIFICATION).sort()).toEqual(
      [...COMMAND_CENTER_V1_GATE2_REQUIRED_CAPABILITIES].sort(),
    );
  });

  test('records the capabilities already proven with executable evidence', () => {
    const receipts = COMMAND_CENTER_V1_VERIFICATION.immutable_decision_receipts;
    expect(receipts.status).toBe('certified');
    expect(receipts.scope).toContain('application/runtime boundary');
    expect(receipts.reason).toContain('UPDATE, DELETE, and TRUNCATE');
    expect(receipts.evidence).toContain('migrations/0016_weekly_decision_ledger_append_only.sql');

    expect(COMMAND_CENTER_V1_VERIFICATION.frozen_as_of_replay.status).toBe('certified');
    expect(COMMAND_CENTER_V1_VERIFICATION.deterministic_invariants.status).toBe('certified');
    expect(COMMAND_CENTER_V1_VERIFICATION.independent_challenger.status).toBe('certified');
    expect(COMMAND_CENTER_V1_VERIFICATION.golden_traces.status).toBe('certified');
    expect(COMMAND_CENTER_V1_VERIFICATION.adversarial_red_team.status).toBe('certified');
  });

  test('binds deterministic invariant certification to the canonical catalog and executable replay suite', () => {
    const invariants = COMMAND_CENTER_V1_VERIFICATION.deterministic_invariants;
    expect(invariants.status).toBe('certified');
    expect(invariants.evidence).toContain('shared/commandCenterV1InvariantManifest.ts');
    expect(invariants.evidence).toContain('server/services/__tests__/commandCenterV1InvariantReplay.test.ts');
    expect(invariants.reason).toContain('Malformed Sleeper owner/starter/membership state fails closed');
  });

  test('keeps the challenger methodologically different and confidence-neutral in the release ledger', () => {
    const challenger = COMMAND_CENTER_V1_VERIFICATION.independent_challenger;
    expect(challenger.reason).toContain('no Forecast quantiles');
    expect(challenger.reason).toContain('forbidden from increasing confidence');
    expect(challenger.evidence).toContain('shared/weeklyDecisionChallenger.ts');
    expect(challenger.evidence).toContain('server/services/__tests__/weeklyDecisionChallenger.test.ts');
  });

  test('requires explicit frozen golden traces rather than treating ordinary unit fixtures as replay proof', () => {
    const traces = COMMAND_CENTER_V1_VERIFICATION.golden_traces;
    expect(traces.status).toBe('certified');
    expect(traces.evidence).toContain('server/services/__tests__/golden/weeklyDecisionGate2GoldenTraces.ts');
    expect(traces.evidence).toContain('server/services/__tests__/weeklyDecisionGoldenTraces.test.ts');
  });

  test('records source laundering, malformed Sleeper identity, and correlated-agreement attacks in the red-team boundary', () => {
    const redTeam = COMMAND_CENTER_V1_VERIFICATION.adversarial_red_team;
    expect(redTeam.status).toBe('certified');
    expect(redTeam.reason).toContain('source laundering');
    expect(redTeam.reason).toContain('malformed Sleeper owner/roster/starter geometry');
    expect(redTeam.reason).toContain('correlated-agreement risk');
    expect(redTeam.evidence).toContain('server/services/__tests__/commandCenterV1InvariantReplay.test.ts');
  });

  test('does not falsely certify Gate 2 while postgame process evaluation remains open', () => {
    expect(COMMAND_CENTER_V1_VERIFICATION.postgame_process_evaluation.status).toBe('not_started');
    expect(isCommandCenterV1Gate2Complete()).toBe(false);
  });
});
