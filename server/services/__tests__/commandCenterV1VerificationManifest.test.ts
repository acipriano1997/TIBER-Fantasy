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

  test('certifies weekly receipt persistence and frozen replay only after append-only DB evidence exists', () => {
    const receipts = COMMAND_CENTER_V1_VERIFICATION.immutable_decision_receipts;
    expect(receipts.status).toBe('certified');
    expect(receipts.scope).toContain('application/runtime boundary');
    expect(receipts.reason).toContain('UPDATE, DELETE, and TRUNCATE');
    expect(receipts.evidence).toContain('migrations/0016_weekly_decision_ledger_append_only.sql');
    expect(receipts.evidence).toContain(
      'server/services/__tests__/weeklyDecisionLedgerPersistence.integration.test.ts',
    );
    expect(COMMAND_CENTER_V1_VERIFICATION.frozen_as_of_replay.status).toBe('certified');

    expect(COMMAND_CENTER_V1_VERIFICATION.independent_challenger.status).toBe('not_started');
    expect(COMMAND_CENTER_V1_VERIFICATION.postgame_process_evaluation.status).toBe('not_started');
    expect(COMMAND_CENTER_V1_VERIFICATION.deterministic_invariants.status).toBe('partial');
    expect(COMMAND_CENTER_V1_VERIFICATION.golden_traces.status).toBe('partial');
    expect(COMMAND_CENTER_V1_VERIFICATION.adversarial_red_team.status).toBe('partial');
  });

  test('does not falsely certify Gate 2 while required capabilities remain partial or unstarted', () => {
    expect(isCommandCenterV1Gate2Complete()).toBe(false);
  });
});
