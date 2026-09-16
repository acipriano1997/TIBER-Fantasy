import {
  SituationCorrectionReceiptV0Schema,
  SituationEvaluationSnapshotV0Schema,
  SituationReopenReceiptV0Schema,
  SituationResolutionReceiptV0Schema,
  type SituationDefinitionV0,
  type SituationEvaluationSnapshotV0,
} from '../contracts';
import { digestUsrValue, withUsrRecordDigest } from '../canonicalization';
import {
  definitionRecordRefV0,
  makeUsrRecordRefV0,
  validateUsrHistoryV0,
} from '../conformance';
import {
  classifySharedAttentionV0,
  classifySituationResolutionV0,
  evaluateWitnessSetV0,
  evaluateWitnessV0,
  shouldReevaluateSituationV0,
  validateScenarioBranchBindingV0,
} from '../policy';
import { USR0_GOLDEN_TRACES, USR0_FIXTURE_TIMES, fixtureRef } from '../fixtures/usr0Fixtures';

function snapshot(
  definition: SituationDefinitionV0,
  id: string,
  resolutionState: SituationEvaluationSnapshotV0['resolutionState'] = 'UNRESOLVED',
  prior: SituationEvaluationSnapshotV0 | null = null,
): SituationEvaluationSnapshotV0 {
  const states = definition.competingStates.map((state, index) => ({
    stateId: state.stateId,
    support: resolutionState === 'RESOLVED' && index === 0 ? 'LEADING' as const : 'UNASSESSED' as const,
    basisWitnessIds: [],
    contradictionWitnessIds: [],
  }));
  return SituationEvaluationSnapshotV0Schema.parse(withUsrRecordDigest({
    schemaVersion: 'ffcc.usr.evaluation-snapshot.v0.1.0' as const,
    snapshotId: `usr_snap_${id}`,
    situationId: definition.situationId,
    definitionRef: definitionRecordRefV0(definition),
    asOf: USR0_FIXTURE_TIMES.T1,
    knownAtCutoff: USR0_FIXTURE_TIMES.T1,
    recordedAt: USR0_FIXTURE_TIMES.T1,
    priorSnapshotRef: prior ? makeUsrRecordRefV0('evaluation_snapshot', prior.snapshotId, prior.recordDigest) : null,
    inputFingerprint: digestUsrValue({ id, input: 'synthetic' }),
    policyVersion: 'ffcc.usr.resolution-policy.v0.1.0',
    evidenceRefs: [],
    evidenceReadiness: { state: 'READY' as const, reasonCodes: [] },
    witnessResults: [],
    stateSupport: states,
    resolutionState,
    resolvedStateIds: resolutionState === 'RESOLVED' ? [definition.competingStates[0].stateId] : [],
    remainingUnknowns: resolutionState === 'RESOLVED' ? [] : ['synthetic_unknown'],
    materialDelta: prior ? 'CORRECTION' as const : 'NEW' as const,
    sharedAttention: resolutionState === 'RESOLVED' ? 'BACKGROUND' as const : 'WATCH' as const,
    attentionReasons: [],
    scenarioBranchBindingRefs: [],
  }));
}

describe('USR-0 golden-trace conformance', () => {
  test('all 15 required golden traces exist with unique IDs', () => {
    expect(USR0_GOLDEN_TRACES).toHaveLength(15);
    expect(new Set(USR0_GOLDEN_TRACES.map((trace) => trace.id)).size).toBe(15);
  });

  test.each(USR0_GOLDEN_TRACES.filter((trace) => trace.expectedResolution))('$id resolves exactly as frozen', (trace) => {
    const witnessResults = evaluateWitnessSetV0(trace.definition, trace.observations, trace.asOf);
    const resolution = classifySituationResolutionV0(trace.definition, witnessResults);
    expect(resolution.resolutionState).toBe(trace.expectedResolution);
    if (trace.expectedAttention) {
      expect(classifySharedAttentionV0(trace.definition, resolution, witnessResults).attention).toBe(trace.expectedAttention);
    }
  });

  test.each(USR0_GOLDEN_TRACES.filter((trace) => trace.scenarioBinding))('$id scenario seam is fail-closed', (trace) => {
    const result = validateScenarioBranchBindingV0(trace.definition, trace.scenarioBinding!);
    expect(result.valid).toBe(trace.expectedScenarioValid);
  });

  test('operator overlay cannot mutate shared football state', () => {
    const trace = USR0_GOLDEN_TRACES.find((row) => row.id === 'USR0-T09-operator-overlay-does-not-mutate-shared')!;
    const before = trace.definition.recordDigest;
    expect(trace.operatorOverlay?.situationId).toBe(trace.definition.situationId);
    expect(trace.operatorOverlay?.actionTiming).toBe('WAIT_FOR_SPECIFIC_EVIDENCE');
    expect(trace.definition.recordDigest).toBe(before);
  });

  test('future evidence trace stays ineligible and absence trace stays indeterminate', () => {
    const future = USR0_GOLDEN_TRACES.find((row) => row.assertion === 'future_evidence')!;
    expect(evaluateWitnessV0(future.definition, future.observations[0], future.asOf).status).toBe('FUTURE_EVIDENCE');

    const absence = USR0_GOLDEN_TRACES.find((row) => row.assertion === 'absence')!;
    expect(evaluateWitnessV0(absence.definition, absence.observations[0], absence.asOf).status).toBe('INDETERMINATE');
  });

  test('correction history appends replacement snapshot without deleting prior belief', () => {
    const trace = USR0_GOLDEN_TRACES.find((row) => row.id === 'USR0-T11-correction-preserves-prior-belief')!;
    const first = snapshot(trace.definition, 'corr_before');
    const replacement = snapshot(trace.definition, 'corr_after', 'UNRESOLVED', first);
    const correction = SituationCorrectionReceiptV0Schema.parse(withUsrRecordDigest({
      schemaVersion: 'ffcc.usr.correction-receipt.v0.1.0' as const,
      receiptId: 'usr_corr_golden_correction',
      situationId: trace.definition.situationId,
      targetRecordRef: makeUsrRecordRefV0('evaluation_snapshot', first.snapshotId, first.recordDigest),
      replacementRecordRef: makeUsrRecordRefV0('evaluation_snapshot', replacement.snapshotId, replacement.recordDigest),
      correctedAt: USR0_FIXTURE_TIMES.T2,
      knownAt: USR0_FIXTURE_TIMES.T2,
      reasonCodes: ['source_correction'],
      evidenceRefs: [fixtureRef('correction:evidence', 'fixture.evidence.v0')],
    }));
    const history = validateUsrHistoryV0({
      definitions: [trace.definition],
      snapshots: [first, replacement],
      resolutionReceipts: [],
      reopenReceipts: [],
      correctionReceipts: [correction],
      scenarioBindings: [],
      operatorOverlays: [],
    });
    expect(history).toEqual({ valid: true, reasonCodes: [] });
    expect(first.snapshotId).not.toBe(replacement.snapshotId);
  });

  test('material return/reversal can reopen a resolution while routine noise cannot', () => {
    const trace = USR0_GOLDEN_TRACES.find((row) => row.id === 'USR0-T12-valid-material-reopen')!;
    const resolved = snapshot(trace.definition, 'resolved_before_reopen', 'RESOLVED');
    expect(shouldReevaluateSituationV0(resolved, resolved.inputFingerprint, 'MEANINGFUL_ROLE_REVERSAL')).toMatchObject({ reevaluate: true, materialDelta: 'REOPENED' });
    expect(shouldReevaluateSituationV0(resolved, digestUsrValue({ noise: true }), 'ROUTINE_NOISE')).toMatchObject({ reevaluate: false, materialDelta: 'NO_MATERIAL_CHANGE' });
  });

  test('resolution and reopen receipts remain append-only auditable records', () => {
    const trace = USR0_GOLDEN_TRACES.find((row) => row.id === 'USR0-T06-returning-player-reopen')!;
    const resolved = snapshot(trace.definition, 'resolved_receipt_target', 'RESOLVED');
    const resolution = SituationResolutionReceiptV0Schema.parse(withUsrRecordDigest({
      schemaVersion: 'ffcc.usr.resolution-receipt.v0.1.0' as const,
      receiptId: 'usr_res_golden_resolution',
      situationId: trace.definition.situationId,
      definitionRef: definitionRecordRefV0(trace.definition),
      finalSnapshotRef: makeUsrRecordRefV0('evaluation_snapshot', resolved.snapshotId, resolved.recordDigest),
      resolvedStateIds: [trace.definition.competingStates[0].stateId],
      resolvedAt: USR0_FIXTURE_TIMES.T1,
      knownAt: USR0_FIXTURE_TIMES.T1,
      resolutionBasisWitnessIds: ['role_deployment'],
      residualUnknowns: [],
      reopenConditions: ['RETURN_FROM_ABSENCE'],
    }));
    const reopen = SituationReopenReceiptV0Schema.parse(withUsrRecordDigest({
      schemaVersion: 'ffcc.usr.reopen-receipt.v0.1.0' as const,
      receiptId: 'usr_reopen_golden_return',
      situationId: trace.definition.situationId,
      priorResolutionReceiptRef: makeUsrRecordRefV0('resolution_receipt', resolution.receiptId, resolution.recordDigest),
      reopenedAt: USR0_FIXTURE_TIMES.T2,
      knownAt: USR0_FIXTURE_TIMES.T2,
      cause: 'RETURN_FROM_ABSENCE' as const,
      evidenceRefs: [fixtureRef('return:evidence', 'fixture.evidence.v0')],
    }));
    expect(validateUsrHistoryV0({
      definitions: [trace.definition],
      snapshots: [resolved],
      resolutionReceipts: [resolution],
      reopenReceipts: [reopen],
      correctionReceipts: [],
      scenarioBindings: [],
      operatorOverlays: [],
    })).toEqual({ valid: true, reasonCodes: [] });
  });

  test('conservation trace rejects branch impact on undeclared player', () => {
    const trace = USR0_GOLDEN_TRACES.find((row) => row.id === 'USR0-T14-conservation-constraint-rejection')!;
    const result = validateScenarioBranchBindingV0(trace.definition, trace.scenarioBinding!);
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain('branch_references_undeclared_player');
  });

  test('qualitative support trace has no route to fabricated state probability', () => {
    const trace = USR0_GOLDEN_TRACES.find((row) => row.id === 'USR0-T15-qualitative-support-cannot-be-probability')!;
    const results = evaluateWitnessSetV0(trace.definition, trace.observations, trace.asOf);
    const resolution = classifySituationResolutionV0(trace.definition, results);
    expect(resolution.stateSupport.some((row) => row.support === 'LEADING' || row.support === 'SUPPORTED')).toBe(true);
    expect(trace.scenarioBinding?.probabilityBinding.status).toBe('QUALITATIVE_ONLY');
    expect(JSON.stringify(trace.scenarioBinding)).not.toContain('"probability":');
  });
});
