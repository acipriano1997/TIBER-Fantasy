import {
  SituationDefinitionV0Schema,
  type UsrRecordV0,
} from '../contracts';
import {
  usrRecordRef,
  withUsrDigest,
} from '../canonicalization';
import {
  validateCorrectionReceiptV0,
  validateScenarioBindingConformanceV0,
  validateUsrRecordV0,
} from '../conformance';
import {
  classifySituationResolutionV0,
  evaluateWitnessV0,
  validateScenarioBranchBindingV0,
} from '../policy';
import {
  makeDefinition,
  makeObservation,
  makeScenarioBinding,
  fixtureRef,
} from '../fixtures/usr0Fixtures';

function successorDefinition(seed: string) {
  const prior = makeDefinition(seed, { persistenceClass: 'medium' });
  const { recordDigest: _discard, ...rest } = prior;
  const next = SituationDefinitionV0Schema.parse(withUsrDigest({
    ...rest,
    recordId: `usr_def_${seed}_v2`,
    versionOrdinal: 2,
    question: `${prior.question} Version two.`,
    predecessorDefinitionRef: usrRecordRef(prior as unknown as Record<string, unknown> & { schemaVersion: string; recordDigest: string }),
  }));
  return { prior, next };
}

describe('USR-0 independent review merge-gate invariants', () => {
  test('medium persistence does not treat non-comparable windows as confirmation', () => {
    const definition = makeDefinition('reviewcmp', { persistenceClass: 'medium' });
    const first = makeObservation(definition, 'witness:w1', 'cmpone', {
      windowInstanceId: 'game:1',
      comparisonKey: 'neutral-script',
    });
    const second = makeObservation(definition, 'witness:w1', 'cmptwo', {
      windowInstanceId: 'game:2',
      comparisonKey: 'two-minute-only',
    });
    const results = [first, second].map((observation) => evaluateWitnessV0(definition.resolutionWitnesses[0], observation));
    expect(classifySituationResolutionV0(definition, results).resolutionState).toBe('LEANING');

    const comparableSecond = makeObservation(definition, 'witness:w1', 'cmpthree', {
      windowInstanceId: 'game:2',
      comparisonKey: 'neutral-script',
    });
    const comparableResults = [first, comparableSecond].map((observation) => evaluateWitnessV0(definition.resolutionWitnesses[0], observation));
    expect(classifySituationResolutionV0(definition, comparableResults).resolutionState).toBe('RESOLVED');
  });

  test('scenario binding is tied to the exact definition version at both policy and conformance seams', () => {
    const { prior, next } = successorDefinition('reviewbind');
    const binding = makeScenarioBinding(prior, 'reviewbind', 'QUALITATIVE_ONLY');
    const policyResult = validateScenarioBranchBindingV0(next, binding);
    expect(policyResult.valid).toBe(false);
    expect(policyResult.reasonCodes).toContain('scenario_definition_ref_mismatch');

    const conformanceResult = validateScenarioBindingConformanceV0(next, binding);
    expect(conformanceResult.valid).toBe(false);
    expect(conformanceResult.reasonCodes).toContain('scenario_definition_ref_mismatch');
  });

  test('calendar-invalid RFC3339-looking timestamp fails conformance', () => {
    const definition = makeDefinition('reviewtime', { persistenceClass: 'medium' });
    const valid = makeObservation(definition, 'witness:w1', 'reviewtimeobs');
    const { recordDigest: _discard, ...rest } = valid;
    const invalidCalendarRecord = withUsrDigest({
      ...rest,
      knownAt: '2026-02-31T13:05:00Z',
    }) as unknown as UsrRecordV0;
    const result = validateUsrRecordV0(invalidCalendarRecord);
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain('invalid_rfc3339_instant:knownAt');
  });

  test('correction cannot cross situation or record family', () => {
    const firstDefinition = makeDefinition('reviewcorr1', { persistenceClass: 'medium' });
    const secondDefinition = makeDefinition('reviewcorr2', { persistenceClass: 'medium' });
    const corrected = makeObservation(firstDefinition, 'witness:w1', 'corrfirst');
    const replacement = makeObservation(secondDefinition, 'witness:w1', 'corrsecond');
    const correction = withUsrDigest({
      schemaVersion: 'ffcc.usr.correction-receipt.v0.1.0',
      receiptId: 'usr_corr_reviewcorr',
      situationId: firstDefinition.situationId,
      correctedRecordRef: usrRecordRef(corrected as unknown as Record<string, unknown> & { schemaVersion: string; recordDigest: string }),
      replacementRecordRef: usrRecordRef(replacement as unknown as Record<string, unknown> & { schemaVersion: string; recordDigest: string }),
      correctedAt: '2026-09-16T14:00:00Z',
      knownAt: '2026-09-16T14:00:00Z',
      reasonCodes: ['source_correction'],
      evidenceRefs: [fixtureRef('evidence:reviewcorr')],
    });
    const result = validateCorrectionReceiptV0(correction as never, corrected, replacement);
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain('correction_situation_mismatch');
  });
});
