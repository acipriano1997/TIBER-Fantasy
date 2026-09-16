import { SituationDefinitionV0Schema } from '../contracts';
import { withUsrRecordDigest } from '../canonicalization';
import {
  canReopenSituationV0,
  classifySharedAttentionV0,
  classifySituationResolutionV0,
  evaluateWitnessSetV0,
  evaluateWitnessV0,
  isSituationEvidenceEligibleAtV0,
  validateScenarioBranchBindingV0,
} from '../policy';
import {
  USR0_GOLDEN_TRACES,
  USR0_FIXTURE_TIMES,
  fixtureRef,
  makeDefinition,
  makeScenarioBinding,
  observation,
} from '../fixtures/usr0Fixtures';

function mutateDefinition(definition: ReturnType<typeof makeDefinition>, patch: (content: any) => any) {
  const { recordDigest: _digest, ...content } = definition;
  return SituationDefinitionV0Schema.parse(withUsrRecordDigest(patch(content)));
}

describe('USR-0 deterministic policy', () => {
  test('point-in-time eligibility is knownAt <= asOf', () => {
    expect(isSituationEvidenceEligibleAtV0(USR0_FIXTURE_TIMES.T1, USR0_FIXTURE_TIMES.T1)).toBe(true);
    expect(isSituationEvidenceEligibleAtV0(USR0_FIXTURE_TIMES.T0, USR0_FIXTURE_TIMES.T1)).toBe(true);
    expect(isSituationEvidenceEligibleAtV0(USR0_FIXTURE_TIMES.T3, USR0_FIXTURE_TIMES.T1)).toBe(false);
  });

  test('future witness is rejected before it can change support', () => {
    const trace = USR0_GOLDEN_TRACES.find((row) => row.id === 'USR0-T10-point-in-time-future-witness-rejected')!;
    const result = evaluateWitnessV0(trace.definition, trace.observations[0], trace.asOf);
    expect(result.status).toBe('FUTURE_EVIDENCE');
    expect(result.stateEffects.every((entry) => entry.effect === 'indeterminate')).toBe(true);
  });

  test('source-class mismatch cannot satisfy a witness', () => {
    const definition = makeDefinition({ id: 'source_mismatch' });
    const result = evaluateWitnessV0(definition, observation(definition, 'role_deployment', {
      sourceRequirementRef: fixtureRef('wrong-source', 'fixture.source.v0'),
    }), USR0_FIXTURE_TIMES.T2);
    expect(result.status).toBe('SOURCE_MISMATCH');
  });

  test('observed absence needs a closed complete window', () => {
    const trace = USR0_GOLDEN_TRACES.find((row) => row.id === 'USR0-T13-observed-absence-needs-complete-window')!;
    const result = evaluateWitnessV0(trace.definition, trace.observations[0], trace.asOf);
    expect(result.status).toBe('INDETERMINATE');
    expect(result.reasonCodes).toContain('observed_absence_not_admissible');
  });

  test('fast direct authoritative witness can resolve a narrowly scoped state', () => {
    const base = makeDefinition({ id: 'fast_resolve', persistence: 'fast' });
    const definition = mutateDefinition(base, (content) => ({
      ...content,
      classification: { ...content.classification, persistenceClass: 'fast' },
      resolutionWitnesses: content.resolutionWitnesses.map((witness: any) => ({
        ...witness,
        resolutionUse: 'DIRECT_AUTHORITATIVE',
        coverageRequirement: 'DIRECT_AUTHORITATIVE',
        window: 'SAME_DAY',
      })),
    }));
    const results = evaluateWitnessSetV0(definition, [observation(definition, 'role_deployment')], USR0_FIXTURE_TIMES.T2);
    expect(classifySituationResolutionV0(definition, results).resolutionState).toBe('RESOLVED');
  });

  test('medium single deployment leans but repeated comparable windows can resolve', () => {
    const definition = makeDefinition({ id: 'medium_repeat', persistence: 'medium' });
    const one = evaluateWitnessSetV0(definition, [observation(definition, 'role_deployment', { windowId: 'game-1' })], USR0_FIXTURE_TIMES.T2);
    expect(classifySituationResolutionV0(definition, one).resolutionState).toBe('LEANING');

    const two = evaluateWitnessSetV0(definition, [
      observation(definition, 'role_deployment', { observationId: 'role:game-1', windowId: 'game-1' }),
      observation(definition, 'role_deployment', { observationId: 'role:game-2', windowId: 'game-2' }),
    ], USR0_FIXTURE_TIMES.T3);
    expect(classifySituationResolutionV0(definition, two).resolutionState).toBe('RESOLVED');
  });

  test('slow regime cannot resolve from one game and requires context-diverse repetition', () => {
    const base = makeDefinition({ id: 'slow_repeat', persistence: 'slow', primaryClass: 'OFFENSIVE_REGIME' });
    const definition = mutateDefinition(base, (content) => ({
      ...content,
      classification: { ...content.classification, persistenceClass: 'slow', primaryClass: 'OFFENSIVE_REGIME' },
      resolutionWitnesses: content.resolutionWitnesses.map((witness: any) => ({
        ...witness,
        resolutionUse: 'CONTEXTUAL',
        window: 'MULTI_GAME',
      })),
    }));
    const one = evaluateWitnessSetV0(definition, [observation(definition, 'role_deployment', { windowId: 'game-1', contextKey: 'neutral' })], USR0_FIXTURE_TIMES.T2);
    expect(classifySituationResolutionV0(definition, one).resolutionState).toBe('LEANING');

    const three = evaluateWitnessSetV0(definition, [
      observation(definition, 'role_deployment', { observationId: 'slow:g1', windowId: 'game-1', contextKey: 'neutral' }),
      observation(definition, 'role_deployment', { observationId: 'slow:g2', windowId: 'game-2', contextKey: 'trailing' }),
      observation(definition, 'role_deployment', { observationId: 'slow:g3', windowId: 'game-3', contextKey: 'neutral' }),
    ], '2026-10-01T13:00:00.000Z');
    expect(classifySituationResolutionV0(definition, three).resolutionState).toBe('RESOLVED');
  });

  test('conflicting route and target hierarchy remains contested', () => {
    const trace = USR0_GOLDEN_TRACES.find((row) => row.id === 'USR0-T04-route-target-hierarchy-conflict')!;
    const results = evaluateWitnessSetV0(trace.definition, trace.observations, trace.asOf);
    expect(classifySituationResolutionV0(trace.definition, results).resolutionState).toBe('CONTESTED');
  });

  test('shared attention uses ordinal rule tree rather than a hidden score', () => {
    const nextGame = makeDefinition({ id: 'attention_elevated', blast: 'HIGH' });
    const resolution = classifySituationResolutionV0(nextGame, []);
    expect(classifySharedAttentionV0(nextGame, resolution, []).attention).toBe('ELEVATED');

    const urgent = mutateDefinition(makeDefinition({ id: 'attention_urgent', blast: 'VERY_HIGH' }), (content) => ({
      ...content,
      resolutionWitnesses: content.resolutionWitnesses.map((witness: any) => ({ ...witness, window: 'PRE_LOCK' })),
    }));
    const urgentResolution = classifySituationResolutionV0(urgent, []);
    const urgentAttention = classifySharedAttentionV0(urgent, urgentResolution, []);
    expect(urgentAttention.attention).toBe('URGENT');
    expect(urgentAttention.reasonCodes).toContain('imminent_resolution_witness');
  });

  test('slow open-ended question stays background and unavailable open witness cannot become urgent', () => {
    const slow = mutateDefinition(makeDefinition({ id: 'attention_background', persistence: 'slow', primaryClass: 'OFFENSIVE_REGIME' }), (content) => ({
      ...content,
      classification: { ...content.classification, persistenceClass: 'slow', primaryClass: 'OFFENSIVE_REGIME' },
      resolutionWitnesses: content.resolutionWitnesses.map((witness: any) => ({ ...witness, window: 'OPEN', resolutionUse: 'CONTEXTUAL' })),
    }));
    const resolution = classifySituationResolutionV0(slow, []);
    expect(classifySharedAttentionV0(slow, resolution, []).attention).toBe('BACKGROUND');
  });

  test('incomplete state set rejects calibrated mixture while qualitative binding stays valid', () => {
    const incomplete = makeDefinition({ id: 'scenario_incomplete', completeness: 'partial' });
    expect(validateScenarioBranchBindingV0(incomplete, makeScenarioBinding(incomplete, { calibrated: true, completeness: 'partial' })).valid).toBe(false);

    const exhaustive = makeDefinition({ id: 'scenario_qualitative', completeness: 'exhaustive' });
    const qualitative = makeScenarioBinding(exhaustive, { calibrated: false });
    expect(validateScenarioBranchBindingV0(exhaustive, qualitative).valid).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(qualitative, 'probability')).toBe(false);
    expect(qualitative.probabilityBinding.status).toBe('QUALITATIVE_ONLY');
  });

  test('reopening uses explicit material causes; routine noise is not one', () => {
    expect(canReopenSituationV0('RETURN_FROM_ABSENCE')).toBe(true);
    expect(canReopenSituationV0('MEANINGFUL_ROLE_REVERSAL')).toBe(true);
    expect(canReopenSituationV0('ROUTINE_NOISE')).toBe(false);
  });
});
