import {
  SituationDefinitionV0Schema,
  SituationEvaluationSnapshotV0Schema,
  SituationReopenReceiptV0Schema,
  SituationResolutionReceiptV0Schema,
} from '../contracts';
import {
  digestUsrValue,
  usrRecordRef,
  withUsrDigest,
} from '../canonicalization';
import {
  validateDefinitionSuccessorV0,
  validateReopenReceiptV0,
  validateResolutionReceiptAgainstSnapshotV0,
  validateUsrAppendOnlySequenceV0,
  validateUsrRecordV0,
} from '../conformance';
import {
  classifySharedAttentionV0,
  classifySituationResolutionV0,
  evaluateWitnessV0,
} from '../policy';
import {
  USR0_GOLDEN_TRACES,
  fixtureRef,
} from '../fixtures/usr0Fixtures';

function qbTrace() {
  const found = USR0_GOLDEN_TRACES.find((trace) => trace.id === 'USR0-T03-qb-cascade-joint-branches');
  if (!found) throw new Error('missing qb trace');
  return found;
}

function buildResolvedSnapshot() {
  const t = qbTrace();
  const witness = t.definition.resolutionWitnesses[0];
  const result = evaluateWitnessV0(witness, t.observations[0]);
  const resolution = classifySituationResolutionV0(t.definition, [result]);
  const attention = classifySharedAttentionV0(t.definition, resolution, [result]);
  const raw = {
    schemaVersion: 'ffcc.usr.evaluation-snapshot.v0.1.0' as const,
    snapshotId: 'usr_eval_resolved01',
    situationId: t.definition.situationId,
    definitionRef: usrRecordRef(t.definition),
    asOf: '2026-09-16T14:00:00Z',
    knownAtCutoff: '2026-09-16T14:00:00Z',
    recordedAt: '2026-09-16T14:01:00Z',
    priorSnapshotRef: null,
    inputFingerprint: digestUsrValue({ witness: t.observations[0] }),
    policyVersion: 'usr-policy-v0',
    evidenceRefs: result.basisRefs,
    evidenceReadiness: { state: 'READY' as const, reasonCodes: [] },
    witnessResults: [result],
    stateSupport: resolution.stateSupport,
    resolutionState: resolution.resolutionState,
    resolvedStateIds: resolution.resolvedStateIds,
    remainingUnknowns: resolution.remainingUnknownWitnessIds,
    materialDelta: 'NEW' as const,
    sharedAttention: attention.sharedAttention,
    attentionReasons: attention.reasonCodes,
    scenarioBranchBindingRefs: [],
  };
  return SituationEvaluationSnapshotV0Schema.parse(withUsrDigest(raw as unknown as Record<string, unknown>));
}

describe('USR-0 conformance', () => {
  test('validates digest and rejects semantic tampering', () => {
    const definition = qbTrace().definition;
    expect(validateUsrRecordV0(definition).valid).toBe(true);
    const tampered = { ...definition, question: `${definition.question} tampered` };
    expect(validateUsrRecordV0(tampered).reasonCodes).toContain('record_digest_mismatch');
  });

  test('definition successor binds exact predecessor record', () => {
    const previous = qbTrace().definition;
    const raw = {
      ...previous,
      recordId: 'usr_def_successor01',
      versionOrdinal: 2,
      question: `${previous.question} successor`,
      predecessorDefinitionRef: usrRecordRef(previous),
      recordDigest: undefined,
    };
    const successor = SituationDefinitionV0Schema.parse(withUsrDigest(raw as unknown as Record<string, unknown>));
    expect(validateDefinitionSuccessorV0(previous, successor).valid).toBe(true);
  });

  test('resolution receipt must bind the exact resolved snapshot', () => {
    const definition = qbTrace().definition;
    const snapshot = buildResolvedSnapshot();
    expect(snapshot.resolutionState).toBe('RESOLVED');
    const raw = {
      schemaVersion: 'ffcc.usr.resolution-receipt.v0.1.0' as const,
      receiptId: 'usr_res_receipt01',
      situationId: definition.situationId,
      definitionRef: usrRecordRef(definition),
      finalSnapshotRef: usrRecordRef(snapshot),
      resolvedStateIds: snapshot.resolvedStateIds,
      resolvedAt: '2026-09-16T14:02:00Z',
      knownAt: '2026-09-16T14:02:00Z',
      resolutionBasis: ['witness:w1'],
      finalWitnesses: ['witness:w1'],
      residualUncertainty: [],
      priorStateCount: definition.competingStates.length,
      reopenConditions: ['injury' as const, 'returning_player' as const, 'source_correction' as const],
    };
    const receipt = SituationResolutionReceiptV0Schema.parse(withUsrDigest(raw as unknown as Record<string, unknown>));
    expect(validateResolutionReceiptAgainstSnapshotV0(definition, snapshot, receipt).valid).toBe(true);
  });

  test('reopen is valid only for a predeclared material cause', () => {
    const definition = qbTrace().definition;
    const snapshot = buildResolvedSnapshot();
    const resolution = SituationResolutionReceiptV0Schema.parse(withUsrDigest({
      schemaVersion: 'ffcc.usr.resolution-receipt.v0.1.0',
      receiptId: 'usr_res_reopenbase',
      situationId: definition.situationId,
      definitionRef: usrRecordRef(definition),
      finalSnapshotRef: usrRecordRef(snapshot),
      resolvedStateIds: snapshot.resolvedStateIds,
      resolvedAt: '2026-09-16T14:02:00Z',
      knownAt: '2026-09-16T14:02:00Z',
      resolutionBasis: ['witness:w1'],
      finalWitnesses: ['witness:w1'],
      residualUncertainty: [],
      priorStateCount: definition.competingStates.length,
      reopenConditions: ['injury'],
    }));
    const reopen = SituationReopenReceiptV0Schema.parse(withUsrDigest({
      schemaVersion: 'ffcc.usr.reopen-receipt.v0.1.0',
      receiptId: 'usr_reopen_valid01',
      situationId: definition.situationId,
      priorResolutionRef: usrRecordRef(resolution),
      reopenedAt: '2026-09-17T12:00:00Z',
      knownAt: '2026-09-17T12:00:00Z',
      cause: 'injury',
      evidenceRefs: [fixtureRef('injury:new')],
    }));
    expect(validateReopenReceiptV0(resolution, reopen).valid).toBe(true);

    const invalid = SituationReopenReceiptV0Schema.parse(withUsrDigest({
      ...reopen,
      receiptId: 'usr_reopen_invalid01',
      cause: 'transaction',
      recordDigest: undefined,
    }));
    expect(validateReopenReceiptV0(resolution, invalid).reasonCodes).toContain('reopen_cause_not_predeclared');
  });

  test('append-only sequence requires referenced records to appear earlier', () => {
    const definition = qbTrace().definition;
    const snapshot = buildResolvedSnapshot();
    const valid = validateUsrAppendOnlySequenceV0([definition, snapshot]);
    expect(valid.valid).toBe(true);
    const invalid = validateUsrAppendOnlySequenceV0([snapshot, definition]);
    expect(invalid.valid).toBe(false);
    expect(invalid.reasonCodes.some((reason) => reason.includes('definition_ref_not_prior'))).toBe(true);
  });
});
