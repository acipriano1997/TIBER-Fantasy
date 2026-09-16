import {
  classifySharedAttentionV0,
  classifySituationResolutionV0,
  evaluateWitnessV0,
  isSituationEvidenceEligibleAtV0,
  validateScenarioBranchBindingV0,
} from '../policy';
import { validateOpportunityConservationV0 } from '../conservation';
import { USR0_GOLDEN_TRACES } from '../fixtures/usr0Fixtures';

function trace(id: string) {
  const found = USR0_GOLDEN_TRACES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing trace ${id}`);
  return found;
}

function evaluated(id: string) {
  const t = trace(id);
  const results = t.observations.map((observation) => {
    const witness = t.definition.resolutionWitnesses.find((candidate) => candidate.witnessId === observation.witnessId);
    if (!witness) throw new Error(`missing witness ${observation.witnessId}`);
    return evaluateWitnessV0(witness, observation);
  });
  return { t, results, resolution: classifySituationResolutionV0(t.definition, results) };
}

describe('USR-0 deterministic policy', () => {
  test('three-back trace partially resolves when one load-bearing role remains unavailable', () => {
    const { resolution } = evaluated('USR0-T01-three-back-partial-resolution');
    expect(resolution.resolutionState).toBe('PARTIALLY_RESOLVED');
    expect(resolution.resolvedStateIds).toEqual(['state:s1']);
    expect(resolution.remainingUnknownWitnessIds).toContain('witness:w2');
  });

  test('conflicting route/target hierarchy remains contested', () => {
    const { resolution } = evaluated('USR0-T04-route-target-hierarchy-conflict');
    expect(resolution.resolutionState).toBe('CONTESTED');
    expect(resolution.reasonCodes).toContain('material_evidence_conflict');
  });

  test('one game cannot resolve a slow offensive regime', () => {
    const { resolution } = evaluated('USR0-T05-one-game-regime-not-resolved');
    expect(resolution.resolutionState).toBe('UNRESOLVED');
    expect(resolution.reasonCodes).toContain('slow_state_single_or_insufficient_window_cannot_resolve');
  });

  test('direct authoritative fast-state witness may resolve narrowly', () => {
    const { resolution } = evaluated('USR0-T03-qb-cascade-joint-branches');
    expect(resolution.resolutionState).toBe('RESOLVED');
    expect(resolution.resolvedStateIds).toEqual(['state:s1']);
  });

  test('open/incomplete observed absence remains indeterminate', () => {
    const { t, results } = evaluated('USR0-T13-observed-absence-needs-complete-window');
    expect(results[0].effects.every((effect) => effect.effect === 'indeterminate')).toBe(true);
    expect(results[0].reasonCodes).toContain('observed_absence_requires_closed_complete_observable_window');
    const resolution = classifySituationResolutionV0(t.definition, results);
    expect(resolution.resolutionState).toBe('UNRESOLVED');
  });

  test('future-known witness is ineligible at the frozen earlier cutoff', () => {
    const t = trace('USR0-T10-point-in-time-future-witness-rejected');
    expect(isSituationEvidenceEligibleAtV0(t.observations[0].knownAt, '2026-09-17T00:00:00Z')).toBe(false);
    expect(isSituationEvidenceEligibleAtV0('2026-09-17T00:00:00Z', '2026-09-17T00:00:00Z')).toBe(true);
  });

  test('partial state set cannot carry calibrated probability mixture', () => {
    const t = trace('USR0-T08-incomplete-state-set-no-mixture');
    const validation = validateScenarioBranchBindingV0(t.definition, t.scenarioBinding!);
    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain('calibrated_probability_requires_exhaustive_state_set');
  });

  test('qualitative support cannot carry numeric state probability', () => {
    const t = trace('USR0-T15-qualitative-support-cannot-be-probability');
    const validation = validateScenarioBranchBindingV0(t.definition, t.scenarioBinding!);
    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain('qualitative_or_unavailable_binding_cannot_carry_numeric_probability');
  });

  test('opportunity conservation rejects impossible simultaneous shares', () => {
    const t = trace('USR0-T14-conservation-constraint-rejection');
    const validation = validateOpportunityConservationV0(t.conservation!.constraint, t.conservation!.allocation);
    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain('allocation_violates_sum_eq_capacity');
  });

  test('high-blast next-game unresolved situation is elevated rather than fabricated as certain', () => {
    const { t, results, resolution } = evaluated('USR0-T01-three-back-partial-resolution');
    const attention = classifySharedAttentionV0(t.definition, resolution, results);
    expect(attention.sharedAttention).toBe('ELEVATED');
    expect(attention.reasonCodes).toContain('high_blast_radius');
  });

  test('slow open-ended regime question remains background attention', () => {
    const { t, results, resolution } = evaluated('USR0-T05-one-game-regime-not-resolved');
    const attention = classifySharedAttentionV0(t.definition, resolution, results);
    expect(attention.sharedAttention).toBe('BACKGROUND');
    expect(attention.reasonCodes).toContain('slow_persistence_no_near_witness');
  });
});
