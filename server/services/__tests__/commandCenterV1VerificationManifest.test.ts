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

  test('records every required Gate 2 capability as certified only with executable evidence', () => {
    for (const id of COMMAND_CENTER_V1_GATE2_REQUIRED_CAPABILITIES) {
      const capability = COMMAND_CENTER_V1_VERIFICATION[id];
      expect(capability.status).toBe('certified');
      expect(capability.evidence.length).toBeGreaterThan(0);
    }

    const receipts = COMMAND_CENTER_V1_VERIFICATION.immutable_decision_receipts;
    expect(receipts.scope).toContain('application/runtime boundary');
    expect(receipts.reason).toContain('UPDATE, DELETE, and TRUNCATE');
    expect(receipts.evidence).toContain('migrations/0016_weekly_decision_ledger_append_only.sql');
  });

  test('binds deterministic invariant certification to the canonical catalog and executable replay suite', () => {
    const invariants = COMMAND_CENTER_V1_VERIFICATION.deterministic_invariants;
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
    expect(traces.evidence).toContain('server/services/__tests__/golden/weeklyDecisionGate2GoldenTraces.ts');
    expect(traces.evidence).toContain('server/services/__tests__/weeklyDecisionGoldenTraces.test.ts');
  });

  test('certifies postgame evaluation without outcome hindsight or mixed-cohort calibration claims', () => {
    const postgame = COMMAND_CENTER_V1_VERIFICATION.postgame_process_evaluation;
    expect(postgame.status).toBe('certified');
    expect(postgame.reason).toContain('cannot rewrite the pregame receipt');
    expect(postgame.reason).toContain('at least 20 player outcomes');
    expect(postgame.reason).toContain('mixed cohorts are never blended');
    expect(postgame.evidence).toContain('server/services/weeklyDecisionPostgameEvaluation.ts');
    expect(postgame.evidence).toContain('server/services/__tests__/weeklyDecisionPostgameEvaluation.test.ts');
  });

  test('records postgame hindsight attacks alongside the existing adversarial boundary', () => {
    const redTeam = COMMAND_CENTER_V1_VERIFICATION.adversarial_red_team;
    expect(redTeam.reason).toContain('source laundering');
    expect(redTeam.reason).toContain('malformed Sleeper owner/roster/starter geometry');
    expect(redTeam.reason).toContain('correlated-agreement risk');
    expect(redTeam.reason).toContain('conflicting final outcomes');
    expect(redTeam.reason).toContain('mixed calibration cohorts');
    expect(redTeam.evidence).toContain('server/services/__tests__/weeklyDecisionPostgameEvaluation.test.ts');
  });

  test('certifies Gate 2 only when every required capability is certified', () => {
    expect(isCommandCenterV1Gate2Complete()).toBe(true);
  });
});
