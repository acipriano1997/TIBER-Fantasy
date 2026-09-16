import type {
  GovernedRefV0,
  ResolutionStateV0,
  ResolutionWitnessDefinitionV0,
  ScenarioBranchBindingV0,
  SharedAttentionV0,
  SituationDefinitionV0,
  SituationEvaluationSnapshotV0,
  StateSupportV0,
  WitnessEffectV0,
  WitnessObservationV0,
  WitnessResultV0,
} from './contracts';

export type StateSupportAssessmentV0 = {
  stateId: string;
  support: StateSupportV0;
  basisWitnessIds: string[];
  contradictionWitnessIds: string[];
};

export type ResolutionAssessmentV0 = {
  resolutionState: ResolutionStateV0;
  resolvedStateIds: string[];
  stateSupport: StateSupportAssessmentV0[];
  remainingUnknownWitnessIds: string[];
  reasonCodes: string[];
};

export type SharedAttentionAssessmentV0 = {
  sharedAttention: SharedAttentionV0;
  reasonCodes: string[];
};

export type ScenarioBranchValidationV0 = { valid: boolean; reasonCodes: string[] };
export type ReevaluationDecisionV0 = { reevaluate: boolean; reasonCode: string };

function sameRef(a: GovernedRefV0 | null, b: GovernedRefV0 | null): boolean {
  if (a === null || b === null) return a === b;
  return a.refType === b.refType && a.namespace === b.namespace && a.id === b.id
    && a.version === b.version && a.digest === b.digest;
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isSituationEvidenceEligibleAtV0(knownAt: string, asOf: string): boolean {
  const known = parseInstant(knownAt);
  const cutoff = parseInstant(asOf);
  return known !== null && cutoff !== null && known <= cutoff;
}

function indeterminate(definition: ResolutionWitnessDefinitionV0): WitnessResultV0['effects'] {
  return definition.stateEffects.map((entry) => ({ stateId: entry.stateId, effect: 'indeterminate' as const }));
}

export function evaluateWitnessV0(
  definition: ResolutionWitnessDefinitionV0,
  observation: WitnessObservationV0,
): WitnessResultV0 {
  const sourceMatched = sameRef(definition.sourceRequirementRef, observation.sourceRequirementRef)
    && (definition.metricDefinitionRef === null || sameRef(definition.metricDefinitionRef, observation.metricDefinitionRef));
  const base = {
    witnessId: definition.witnessId,
    observationId: observation.observationId,
    windowState: observation.windowState,
    observationState: observation.observationState,
    coverageState: observation.coverageState,
    materiality: definition.materiality,
    sourceMatched,
    basisRefs: observation.basisRefs,
    windowInstanceId: observation.windowInstanceId,
    comparisonKey: observation.comparisonKey,
    contextKey: observation.contextKey,
  };
  const refusal = (reasonCode: string): WitnessResultV0 => ({
    ...base,
    effects: indeterminate(definition),
    reasonCodes: [reasonCode],
  });

  if (observation.witnessId !== definition.witnessId) return { ...refusal('witness_id_mismatch'), sourceMatched: false };
  if (!sourceMatched) return refusal('source_or_metric_requirement_mismatch');
  if (observation.observationState === 'unobserved') return refusal('unobserved_is_not_evidence');
  if (observation.observationState === 'unavailable') return refusal('unavailable_is_not_evidence');
  if (observation.observationState === 'contradicted') return refusal('source_evidence_contradicted');

  if (observation.observationState === 'observed_absent') {
    const validAbsence = definition.absenceSemantics === 'OBSERVABLE_ZERO_ONLY_WITH_COMPLETE_WINDOW'
      && observation.windowState === 'closed'
      && observation.coverageState === 'complete';
    if (!validAbsence) return refusal('observed_absence_requires_closed_complete_observable_window');
    return {
      ...base,
      effects: definition.stateEffects.map((entry) => ({ stateId: entry.stateId, effect: entry.observedAbsent })),
      reasonCodes: ['closed_complete_absence_evaluated'],
    };
  }

  if (definition.coverageRequirement === 'COMPLETE_REQUIRED' && observation.coverageState !== 'complete') {
    return refusal('complete_coverage_required');
  }
  return {
    ...base,
    effects: definition.stateEffects.map((entry) => ({ stateId: entry.stateId, effect: entry.observedPresent })),
    reasonCodes: ['observed_present_evaluated'],
  };
}

type EffectRow = { result: WitnessResultV0; effect: WitnessEffectV0 };

function effectsFor(results: WitnessResultV0[], candidateStateId: string): EffectRow[] {
  const out: EffectRow[] = [];
  for (const result of results) {
    const found = result.effects.find((entry) => entry.stateId === candidateStateId);
    if (found) out.push({ result, effect: found.effect });
  }
  return out;
}

function supportAssessment(
  stateId: string,
  results: WitnessResultV0[],
): StateSupportAssessmentV0 & { strong: boolean; positiveCount: number; hasMixedEvidence: boolean } {
  const rows = effectsFor(results, stateId);
  const positives = rows.filter((row) => row.effect === 'supports' || row.effect === 'strongly_supports');
  const negatives = rows.filter((row) => row.effect === 'refutes' || row.effect === 'rules_out');
  const hasRuleOut = rows.some((row) => row.effect === 'rules_out');
  const hasStrong = rows.some((row) => row.effect === 'strongly_supports');
  const hasMixedEvidence = positives.length > 0 && negatives.length > 0;
  let support: StateSupportV0 = 'UNASSESSED';
  if (hasRuleOut) support = 'RULED_OUT';
  else if (negatives.length > 0) support = 'CONTRADICTED';
  else if (hasStrong || positives.length >= 2) support = 'SUPPORTED';
  else if (positives.length === 1) support = 'PLAUSIBLE';
  return {
    stateId,
    support,
    basisWitnessIds: [...new Set(positives.map((row) => row.result.witnessId))].sort(),
    contradictionWitnessIds: [...new Set(negatives.map((row) => row.result.witnessId))].sort(),
    strong: hasStrong,
    positiveCount: positives.length,
    hasMixedEvidence,
  };
}

function stateSupportBundle(definition: SituationDefinitionV0, results: WitnessResultV0[]) {
  const raw = definition.competingStates.map((state) => supportAssessment(state.stateId, results));
  const materiallySupported = raw.filter((state) => (
    state.support !== 'CONTRADICTED'
    && state.support !== 'RULED_OUT'
    && (state.strong || state.positiveCount >= 2)
  ));
  if (materiallySupported.length === 1) {
    const leadingId = materiallySupported[0].stateId;
    raw.forEach((state) => { if (state.stateId === leadingId) state.support = 'LEADING'; });
  }
  return raw;
}

function publicStateSupport(raw: ReturnType<typeof stateSupportBundle>): StateSupportAssessmentV0[] {
  return raw.map(({ strong: _strong, positiveCount: _positiveCount, hasMixedEvidence: _mixed, ...state }) => state);
}

function unresolvedLoadBearing(
  definition: SituationDefinitionV0,
  results: WitnessResultV0[],
): string[] {
  const unresolved: string[] = [];
  for (const witness of definition.resolutionWitnesses) {
    if (witness.materiality !== 'LOAD_BEARING') continue;
    const matching = results.filter((result) => result.witnessId === witness.witnessId);
    if (matching.length === 0 || matching.every((result) => result.effects.every(
      (entry) => entry.effect === 'indeterminate' || entry.effect === 'no_change',
    ))) unresolved.push(witness.witnessId);
  }
  return [...new Set(unresolved)].sort();
}

function supports(result: WitnessResultV0, stateId: string): boolean {
  const effect = result.effects.find((entry) => entry.stateId === stateId)?.effect;
  return effect === 'supports' || effect === 'strongly_supports';
}

function stronglySupports(result: WitnessResultV0, stateId: string): boolean {
  return result.effects.find((entry) => entry.stateId === stateId)?.effect === 'strongly_supports';
}

function uniquePositiveState(support: StateSupportAssessmentV0[]): string | null {
  for (const tier of ['LEADING', 'SUPPORTED', 'PLAUSIBLE'] as const) {
    const matches = support.filter((state) => state.support === tier);
    if (matches.length === 1) return matches[0].stateId;
    if (matches.length > 1) return null;
  }
  return null;
}

export function classifySituationResolutionV0(
  definition: SituationDefinitionV0,
  witnessResults: WitnessResultV0[],
  _priorSnapshot: SituationEvaluationSnapshotV0 | null = null,
): ResolutionAssessmentV0 {
  const rawSupport = stateSupportBundle(definition, witnessResults);
  const stateSupport = publicStateSupport(rawSupport);
  const remainingUnknownWitnessIds = unresolvedLoadBearing(definition, witnessResults);
  const reasonCodes: string[] = [];
  const evidenceConflict = witnessResults.some((result) => result.observationState === 'contradicted')
    || rawSupport.some((state) => state.hasMixedEvidence);
  if (evidenceConflict) reasonCodes.push('material_evidence_conflict');

  const witnessById = new Map(definition.resolutionWitnesses.map((witness) => [witness.witnessId, witness]));
  const directSupportedStates = new Set<string>();
  for (const result of witnessResults) {
    const witness = witnessById.get(result.witnessId);
    if (witness?.coverageRequirement !== 'DIRECT_AUTHORITATIVE' || witness.materiality !== 'LOAD_BEARING') continue;
    definition.competingStates.forEach((state) => {
      if (supports(result, state.stateId)) directSupportedStates.add(state.stateId);
    });
  }
  if (directSupportedStates.size > 1) {
    return {
      resolutionState: 'CONTESTED', resolvedStateIds: [], stateSupport, remainingUnknownWitnessIds,
      reasonCodes: [...reasonCodes, 'conflicting_direct_authoritative_witnesses'],
    };
  }

  const candidateStateId = uniquePositiveState(stateSupport);
  if (evidenceConflict && candidateStateId === null) {
    return { resolutionState: 'CONTESTED', resolvedStateIds: [], stateSupport, remainingUnknownWitnessIds, reasonCodes };
  }

  if (definition.classification.persistenceClass === 'fast') {
    if (directSupportedStates.size === 1 && !evidenceConflict) {
      const resolvedStateId = [...directSupportedStates][0];
      const unknownOtherLoadBearing = remainingUnknownWitnessIds.filter((id) => {
        const matching = witnessResults.filter((result) => result.witnessId === id);
        return matching.length === 0 || matching.every((result) => !supports(result, resolvedStateId));
      });
      if (unknownOtherLoadBearing.length) {
        return {
          resolutionState: 'PARTIALLY_RESOLVED', resolvedStateIds: [resolvedStateId], stateSupport,
          remainingUnknownWitnessIds, reasonCodes: [...reasonCodes, 'direct_state_resolved_with_load_bearing_unknowns_remaining'],
        };
      }
      return {
        resolutionState: 'RESOLVED', resolvedStateIds: [resolvedStateId], stateSupport, remainingUnknownWitnessIds,
        reasonCodes: [...reasonCodes, 'direct_authoritative_witness_resolved_fast_state'],
      };
    }
    if (candidateStateId) {
      return {
        resolutionState: 'LEANING', resolvedStateIds: [], stateSupport, remainingUnknownWitnessIds,
        reasonCodes: [...reasonCodes, 'fast_state_has_non_authoritative_leader'],
      };
    }
    return {
      resolutionState: evidenceConflict ? 'CONTESTED' : 'UNRESOLVED', resolvedStateIds: [], stateSupport,
      remainingUnknownWitnessIds, reasonCodes,
    };
  }

  if (!candidateStateId) {
    return {
      resolutionState: evidenceConflict ? 'CONTESTED' : 'UNRESOLVED', resolvedStateIds: [], stateSupport,
      remainingUnknownWitnessIds, reasonCodes,
    };
  }

  const supportingResults = witnessResults.filter((result) => supports(result, candidateStateId));
  const windows = new Set(supportingResults.map((result) => result.windowInstanceId).filter((x): x is string => x !== null));
  const contexts = new Set(supportingResults.map((result) => result.contextKey).filter((x): x is string => x !== null));
  const directSupport = supportingResults.some((result) => witnessById.get(result.witnessId)?.coverageRequirement === 'DIRECT_AUTHORITATIVE');
  const overwhelmingDeployment = supportingResults.some((result) => {
    const witness = witnessById.get(result.witnessId);
    return witness?.coverageRequirement !== 'DIRECT_AUTHORITATIVE'
      && (witness?.materiality === 'LOAD_BEARING' || witness?.materiality === 'HIGH')
      && stronglySupports(result, candidateStateId);
  });

  if (definition.classification.persistenceClass === 'medium') {
    const persistenceSatisfied = windows.size >= 2 || (directSupport && overwhelmingDeployment);
    if (persistenceSatisfied && !evidenceConflict) {
      const partial = remainingUnknownWitnessIds.length > 0;
      return {
        resolutionState: partial ? 'PARTIALLY_RESOLVED' : 'RESOLVED',
        resolvedStateIds: [candidateStateId], stateSupport, remainingUnknownWitnessIds,
        reasonCodes: [...reasonCodes, partial
          ? 'medium_state_persistence_satisfied_with_load_bearing_unknowns_remaining'
          : windows.size >= 2 ? 'medium_state_repeated_comparable_support' : 'medium_state_overwhelming_plus_direct_support'],
      };
    }
    return {
      resolutionState: evidenceConflict ? 'CONTESTED' : 'LEANING', resolvedStateIds: [], stateSupport,
      remainingUnknownWitnessIds, reasonCodes: [...reasonCodes, 'medium_state_persistence_not_yet_satisfied'],
    };
  }

  const slowPersistenceSatisfied = windows.size >= 3 && contexts.size >= 2;
  if (slowPersistenceSatisfied && !evidenceConflict) {
    const partial = remainingUnknownWitnessIds.length > 0;
    return {
      resolutionState: partial ? 'PARTIALLY_RESOLVED' : 'RESOLVED', resolvedStateIds: [candidateStateId],
      stateSupport, remainingUnknownWitnessIds,
      reasonCodes: [...reasonCodes, partial
        ? 'slow_state_context_diverse_persistence_with_load_bearing_unknowns_remaining'
        : 'slow_state_context_diverse_multi_game_persistence_satisfied'],
    };
  }
  if (windows.size >= 2 && !evidenceConflict) {
    return {
      resolutionState: 'LEANING', resolvedStateIds: [], stateSupport, remainingUnknownWitnessIds,
      reasonCodes: [...reasonCodes, 'slow_state_two_comparable_windows_support_lead_only'],
    };
  }
  return {
    resolutionState: evidenceConflict ? 'CONTESTED' : 'UNRESOLVED', resolvedStateIds: [], stateSupport,
    remainingUnknownWitnessIds, reasonCodes: [...reasonCodes, 'slow_state_single_or_insufficient_window_cannot_resolve'],
  };
}

export function classifySharedAttentionV0(
  definition: SituationDefinitionV0,
  resolution: ResolutionAssessmentV0,
  witnessResults: WitnessResultV0[],
): SharedAttentionAssessmentV0 {
  const reasons: string[] = [];
  const unresolved = resolution.resolutionState !== 'RESOLVED';
  const highBlast = definition.impactDefinition.blastRadius === 'HIGH' || definition.impactDefinition.blastRadius === 'VERY_HIGH';
  if (definition.impactDefinition.blastRadius === 'HIGH') reasons.push('high_blast_radius');
  if (definition.impactDefinition.blastRadius === 'VERY_HIGH') reasons.push('very_high_blast_radius');
  const resultByWitness = new Map<string, WitnessResultV0[]>();
  witnessResults.forEach((result) => resultByWitness.set(result.witnessId, [...(resultByWitness.get(result.witnessId) ?? []), result]));
  const unresolvedWitnesses = definition.resolutionWitnesses.filter((witness) => {
    const matching = resultByWitness.get(witness.witnessId) ?? [];
    return matching.length === 0 || matching.every((result) => result.effects.every(
      (entry) => entry.effect === 'indeterminate' || entry.effect === 'no_change',
    ));
  });
  const loadBearingUnknown = unresolvedWitnesses.some((witness) => witness.materiality === 'LOAD_BEARING');
  if (loadBearingUnknown) reasons.push('load_bearing_unknown');
  const imminent = unresolvedWitnesses.some((witness) => ['PRE_LOCK', 'SAME_DAY', 'NEXT_PRACTICE_CYCLE'].includes(witness.window));
  const byNextGame = unresolvedWitnesses.some((witness) => ['PRE_LOCK', 'SAME_DAY', 'NEXT_PRACTICE_CYCLE', 'NEXT_GAME'].includes(witness.window));
  if (imminent) reasons.push('imminent_resolution_witness');
  const loadBearingConflict = resolution.resolutionState === 'CONTESTED'
    && definition.resolutionWitnesses.some((witness) => witness.materiality === 'LOAD_BEARING');
  if (loadBearingConflict) reasons.push('load_bearing_conflict');
  const multiPlayerImpact = definition.impactDefinition.affectedPlayers.length >= 2 || definition.classification.scope === 'multi_entity';
  if (multiPlayerImpact) reasons.push('multi_player_scenario_impact');
  const whollyUnavailable = witnessResults.length > 0 && witnessResults.every(
    (result) => result.observationState === 'unavailable' || result.observationState === 'unobserved',
  );
  const noActionableWitness = unresolvedWitnesses.every((witness) => ['MULTI_GAME', 'OPEN'].includes(witness.window));
  const unavailableWithoutActionableWitness = whollyUnavailable && noActionableWitness;
  if (unavailableWithoutActionableWitness) reasons.push('unavailable_without_actionable_witness');

  const out = (sharedAttention: SharedAttentionV0): SharedAttentionAssessmentV0 => ({
    sharedAttention,
    reasonCodes: [...new Set(reasons)].sort(),
  });
  if (unresolved && highBlast && loadBearingUnknown && (imminent || loadBearingConflict) && !unavailableWithoutActionableWitness) return out('URGENT');
  if (unresolved && ((highBlast && byNextGame) || loadBearingConflict || (highBlast && multiPlayerImpact))) return out('ELEVATED');
  const slowOpen = definition.classification.persistenceClass === 'slow'
    && definition.resolutionWitnesses.every((witness) => ['MULTI_GAME', 'OPEN'].includes(witness.window))
    && !loadBearingConflict;
  if (slowOpen) { reasons.push('slow_persistence_no_near_witness'); return out('BACKGROUND'); }
  return out(unresolved ? 'WATCH' : 'BACKGROUND');
}

export function validateScenarioBranchBindingV0(
  definition: SituationDefinitionV0,
  binding: ScenarioBranchBindingV0,
): ScenarioBranchValidationV0 {
  const reasons: string[] = [];
  if (binding.situationId !== definition.situationId) reasons.push('situation_id_mismatch');
  if (binding.stateSetCompleteness !== definition.stateSetCompleteness) reasons.push('state_set_completeness_mismatch');
  const declaredStates = new Set(definition.competingStates.map((state) => state.stateId));
  const branchStates = binding.branches.map((branch) => branch.stateId);
  if (new Set(branchStates).size !== branchStates.length) reasons.push('duplicate_branch_state');
  if (branchStates.some((id) => !declaredStates.has(id))) reasons.push('undeclared_branch_state');
  if (declaredStates.size !== new Set(branchStates).size || [...declaredStates].some((id) => !branchStates.includes(id))) {
    reasons.push('declared_state_missing_branch');
  }
  const declaredPlayers = new Set(definition.identity.playerIds);
  if (binding.branches.some((branch) => branch.affectedPlayerIds.some((id) => !declaredPlayers.has(id)))) {
    reasons.push('branch_contains_undeclared_player');
  }
  if (binding.probabilityBinding.status === 'CALIBRATED') {
    if (definition.stateSetCompleteness !== 'exhaustive') reasons.push('calibrated_probability_requires_exhaustive_state_set');
    if (!binding.probabilityBinding.producerRef) reasons.push('calibrated_probability_requires_producer_ref');
    if (!binding.probabilityBinding.calibrationRef) reasons.push('calibrated_probability_requires_calibration_ref');
    if (!binding.probabilityBinding.horizonRef) reasons.push('calibrated_probability_requires_horizon_ref');
    if (binding.branches.some((branch) => branch.stateProbability === null)) {
      reasons.push('calibrated_probability_requires_every_branch_probability');
    } else {
      const sum = binding.branches.reduce((total, branch) => total + (branch.stateProbability ?? 0), 0);
      if (Math.abs(sum - 1) > 1e-9) reasons.push('calibrated_branch_probabilities_must_sum_to_one');
    }
  } else {
    if (binding.branches.some((branch) => branch.stateProbability !== null)) {
      reasons.push('qualitative_or_unavailable_binding_cannot_carry_numeric_probability');
    }
    if (binding.probabilityBinding.producerRef || binding.probabilityBinding.calibrationRef || binding.probabilityBinding.horizonRef) {
      reasons.push('non_calibrated_probability_binding_must_not_claim_calibration_authority');
    }
  }
  return { valid: reasons.length === 0, reasonCodes: [...new Set(reasons)].sort() };
}

export function shouldReevaluateSituationV0(
  priorSnapshot: SituationEvaluationSnapshotV0,
  currentInputFingerprint: string,
  trigger: 'football_evidence_changed' | 'source_correction' | 'definition_changed' | 'reopen_cause' | 'output_only_changed',
): ReevaluationDecisionV0 {
  if (trigger === 'output_only_changed') return { reevaluate: false, reasonCode: 'output_only_change_cannot_wake_usr' };
  if (trigger === 'source_correction') return { reevaluate: true, reasonCode: 'source_correction_requires_replay' };
  if (trigger === 'definition_changed') return { reevaluate: true, reasonCode: 'definition_change_requires_replay' };
  if (trigger === 'reopen_cause') return { reevaluate: true, reasonCode: 'material_reopen_cause_requires_replay' };
  if (priorSnapshot.inputFingerprint === currentInputFingerprint) {
    return { reevaluate: false, reasonCode: 'semantic_input_fingerprint_unchanged' };
  }
  return { reevaluate: true, reasonCode: 'football_evidence_fingerprint_changed' };
}
