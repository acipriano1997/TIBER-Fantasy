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

export type ScenarioBranchValidationV0 = {
  valid: boolean;
  reasonCodes: string[];
};

export type ReevaluationDecisionV0 = {
  reevaluate: boolean;
  reasonCode: string;
};

function sameGovernedRef(left: GovernedRefV0 | null, right: GovernedRefV0 | null): boolean {
  if (left === null || right === null) return left === right;
  return left.refType === right.refType
    && left.namespace === right.namespace
    && left.id === right.id
    && left.version === right.version
    && left.digest === right.digest;
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function isSituationEvidenceEligibleAtV0(knownAt: string, asOf: string): boolean {
  const known = parseInstant(knownAt);
  const cutoff = parseInstant(asOf);
  return known !== null && cutoff !== null && known <= cutoff;
}

function indeterminateEffects(definition: ResolutionWitnessDefinitionV0): WitnessResultV0['effects'] {
  return definition.stateEffects.map((effect) => ({ stateId: effect.stateId, effect: 'indeterminate' as const }));
}

export function evaluateWitnessV0(
  definition: ResolutionWitnessDefinitionV0,
  observation: WitnessObservationV0,
): WitnessResultV0 {
  const reasonCodes: string[] = [];
  const sourceMatched = sameGovernedRef(definition.sourceRequirementRef, observation.sourceRequirementRef)
    && (definition.metricDefinitionRef === null
      || sameGovernedRef(definition.metricDefinitionRef, observation.metricDefinitionRef));

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

  if (observation.witnessId !== definition.witnessId) {
    return { ...base, sourceMatched: false, effects: indeterminateEffects(definition), reasonCodes: ['witness_id_mismatch'] };
  }
  if (!sourceMatched) {
    return { ...base, effects: indeterminateEffects(definition), reasonCodes: ['source_or_metric_requirement_mismatch'] };
  }
  if (observation.observationState === 'unobserved') {
    return { ...base, effects: indeterminateEffects(definition), reasonCodes: ['unobserved_is_not_evidence'] };
  }
  if (observation.observationState === 'unavailable') {
    return { ...base, effects: indeterminateEffects(definition), reasonCodes: ['unavailable_is_not_evidence'] };
  }
  if (observation.observationState === 'contradicted') {
    return { ...base, effects: indeterminateEffects(definition), reasonCodes: ['source_evidence_contradicted'] };
  }

  if (observation.observationState === 'observed_absent') {
    const absenceObservable = definition.absenceSemantics === 'OBSERVABLE_ZERO_ONLY_WITH_COMPLETE_WINDOW'
      && observation.windowState === 'closed'
      && observation.coverageState === 'complete';
    if (!absenceObservable) {
      return {
        ...base,
        effects: indeterminateEffects(definition),
        reasonCodes: ['observed_absence_requires_closed_complete_observable_window'],
      };
    }
    reasonCodes.push('closed_complete_absence_evaluated');
    return {
      ...base,
      effects: definition.stateEffects.map((effect) => ({ stateId: effect.stateId, effect: effect.observedAbsent })),
      reasonCodes,
    };
  }

  if (definition.coverageRequirement === 'COMPLETE_REQUIRED' && observation.coverageState !== 'complete') {
    return {
      ...base,
      effects: indeterminateEffects(definition),
      reasonCodes: ['complete_coverage_required'],
    };
  }

  reasonCodes.push('observed_present_evaluated');
  return {
    ...base,
    effects: definition.stateEffects.map((effect) => ({ stateId: effect.stateId, effect: effect.observedPresent })),
    reasonCodes,
  };
}

function stateEffectsFor(results: WitnessResultV0[], candidateStateId: string): Array<{ result: WitnessResultV0; effect: WitnessEffectV0 }> {
  const out: Array<{ result: WitnessResultV0; effect: WitnessEffectV0 }> = [];
  for (const result of results) {
    const stateEffect = result.effects.find((effect) => effect.stateId === candidateStateId);
    if (stateEffect) out.push({ result, effect: stateEffect.effect });
  }
  return out;
}

function preliminarySupport(
  stateId: string,
  results: WitnessResultV0[],
): StateSupportAssessmentV0 & { strong: boolean; positiveCount: number } {
  const effects = stateEffectsFor(results, stateId);
  const basisWitnessIds = effects
    .filter(({ effect }) => effect === 'supports' || effect === 'strongly_supports')
    .map(({ result }) => result.witnessId);
  const contradictionWitnessIds = effects
    .filter(({ effect }) => effect === 'refutes' || effect === 'rules_out')
    .map(({ result }) => result.witnessId);
  const hasRuleOut = effects.some(({ effect }) => effect === 'rules_out');
  const hasRefute = effects.some(({ effect }) => effect === 'refutes');
  const hasStrong = effects.some(({ effect }) => effect === 'strongly_supports');
  const positiveCount = basisWitnessIds.length;

  let support: StateSupportV0 = 'UNASSESSED';
  if (hasRuleOut) support = 'RULED_OUT';
  else if (hasRefute) support = 'CONTRADICTED';
  else if (hasStrong || positiveCount >= 2) support = 'SUPPORTED';
  else if (positiveCount === 1) support = 'PLAUSIBLE';

  return {
    stateId,
    support,
    basisWitnessIds: [...new Set(basisWitnessIds)].sort(),
    contradictionWitnessIds: [...new Set(contradictionWitnessIds)].sort(),
    strong: hasStrong,
    positiveCount,
  };
}

function classifyStateSupport(
  definition: SituationDefinitionV0,
  results: WitnessResultV0[],
): StateSupportAssessmentV0[] {
  const provisional = definition.competingStates.map((state) => preliminarySupport(state.stateId, results));
  const viable = provisional.filter((state) => state.support !== 'CONTRADICTED' && state.support !== 'RULED_OUT');
  const materiallySupported = viable.filter((state) => state.strong || state.positiveCount >= 2);
  if (materiallySupported.length === 1) {
    const leadingId = materiallySupported[0].stateId;
    for (const state of provisional) {
      if (state.stateId === leadingId) state.support = 'LEADING';
    }
  }
  return provisional.map(({ strong: _strong, positiveCount: _positiveCount, ...state }) => state);
}

function unresolvedLoadBearingWitnesses(results: WitnessResultV0[]): string[] {
  return results
    .filter((result) => result.materiality === 'LOAD_BEARING')
    .filter((result) => result.effects.every((effect) => effect.effect === 'indeterminate' || effect.effect === 'no_change'))
    .map((result) => result.witnessId)
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort();
}

function resultSupportsState(result: WitnessResultV0, candidateStateId: string): boolean {
  const effect = result.effects.find((entry) => entry.stateId === candidateStateId)?.effect;
  return effect === 'supports' || effect === 'strongly_supports';
}

function resultStronglySupportsState(result: WitnessResultV0, candidateStateId: string): boolean {
  return result.effects.find((entry) => entry.stateId === candidateStateId)?.effect === 'strongly_supports';
}

function uniquePositiveState(stateSupport: StateSupportAssessmentV0[]): string | null {
  const leading = stateSupport.filter((state) => state.support === 'LEADING');
  if (leading.length === 1) return leading[0].stateId;
  const supported = stateSupport.filter((state) => state.support === 'SUPPORTED');
  if (supported.length === 1) return supported[0].stateId;
  const plausible = stateSupport.filter((state) => state.support === 'PLAUSIBLE');
  if (plausible.length === 1 && supported.length === 0 && leading.length === 0) return plausible[0].stateId;
  return null;
}

export function classifySituationResolutionV0(
  definition: SituationDefinitionV0,
  witnessResults: WitnessResultV0[],
  _priorSnapshot: SituationEvaluationSnapshotV0 | null = null,
): ResolutionAssessmentV0 {
  const stateSupport = classifyStateSupport(definition, witnessResults);
  const remainingUnknownWitnessIds = unresolvedLoadBearingWitnesses(witnessResults);
  const reasonCodes: string[] = [];

  const evidenceConflict = witnessResults.some((result) => result.observationState === 'contradicted')
    || stateSupport.some((state) => state.support === 'CONTRADICTED');
  if (evidenceConflict) reasonCodes.push('material_evidence_conflict');

  const witnessById = new Map(definition.resolutionWitnesses.map((witness) => [witness.witnessId, witness]));
  const directSupportedStates = new Set<string>();
  for (const result of witnessResults) {
    const witness = witnessById.get(result.witnessId);
    if (!witness || witness.coverageRequirement !== 'DIRECT_AUTHORITATIVE' || witness.materiality !== 'LOAD_BEARING') continue;
    for (const state of definition.competingStates) {
      if (resultSupportsState(result, state.stateId)) directSupportedStates.add(state.stateId);
    }
  }
  if (directSupportedStates.size > 1) {
    return {
      resolutionState: 'CONTESTED',
      resolvedStateIds: [],
      stateSupport,
      remainingUnknownWitnessIds,
      reasonCodes: [...reasonCodes, 'conflicting_direct_authoritative_witnesses'],
    };
  }

  const candidateStateId = uniquePositiveState(stateSupport);
  if (evidenceConflict && candidateStateId === null) {
    return {
      resolutionState: 'CONTESTED',
      resolvedStateIds: [],
      stateSupport,
      remainingUnknownWitnessIds,
      reasonCodes,
    };
  }

  if (definition.classification.persistenceClass === 'fast') {
    if (directSupportedStates.size === 1 && !evidenceConflict) {
      const resolvedStateId = [...directSupportedStates][0];
      const unknownsOutsideResolvingWitness = remainingUnknownWitnessIds.filter((id) => {
        const result = witnessResults.find((candidate) => candidate.witnessId === id);
        return !result || !resultSupportsState(result, resolvedStateId);
      });
      if (unknownsOutsideResolvingWitness.length > 0) {
        return {
          resolutionState: 'PARTIALLY_RESOLVED',
          resolvedStateIds: [resolvedStateId],
          stateSupport,
          remainingUnknownWitnessIds,
          reasonCodes: [...reasonCodes, 'direct_state_resolved_with_load_bearing_unknowns_remaining'],
        };
      }
      return {
        resolutionState: 'RESOLVED',
        resolvedStateIds: [resolvedStateId],
        stateSupport,
        remainingUnknownWitnessIds,
        reasonCodes: [...reasonCodes, 'direct_authoritative_witness_resolved_fast_state'],
      };
    }
    if (candidateStateId) {
      return {
        resolutionState: 'LEANING',
        resolvedStateIds: [],
        stateSupport,
        remainingUnknownWitnessIds,
        reasonCodes: [...reasonCodes, 'fast_state_has_non_authoritative_leader'],
      };
    }
    return {
      resolutionState: evidenceConflict ? 'CONTESTED' : 'UNRESOLVED',
      resolvedStateIds: [],
      stateSupport,
      remainingUnknownWitnessIds,
      reasonCodes,
    };
  }

  if (!candidateStateId) {
    return {
      resolutionState: evidenceConflict ? 'CONTESTED' : 'UNRESOLVED',
      resolvedStateIds: [],
      stateSupport,
      remainingUnknownWitnessIds,
      reasonCodes,
    };
  }

  const supportingResults = witnessResults.filter((result) => resultSupportsState(result, candidateStateId));
  const supportingWindows = new Set(
    supportingResults.map((result) => result.windowInstanceId).filter((value): value is string => value !== null),
  );
  const supportingContexts = new Set(
    supportingResults.map((result) => result.contextKey).filter((value): value is string => value !== null),
  );
  const directSupport = supportingResults.some((result) => {
    const witness = witnessById.get(result.witnessId);
    return witness?.coverageRequirement === 'DIRECT_AUTHORITATIVE';
  });
  const overwhelmingDeployment = supportingResults.some((result) => {
    const witness = witnessById.get(result.witnessId);
    return witness?.coverageRequirement !== 'DIRECT_AUTHORITATIVE'
      && (witness?.materiality === 'LOAD_BEARING' || witness?.materiality === 'HIGH')
      && resultStronglySupportsState(result, candidateStateId);
  });

  if (definition.classification.persistenceClass === 'medium') {
    const persistenceSatisfied = supportingWindows.size >= 2 || (directSupport && overwhelmingDeployment);
    if (persistenceSatisfied && !evidenceConflict) {
      if (remainingUnknownWitnessIds.length > 0) {
        return {
          resolutionState: 'PARTIALLY_RESOLVED',
          resolvedStateIds: [candidateStateId],
          stateSupport,
          remainingUnknownWitnessIds,
          reasonCodes: [...reasonCodes, 'medium_state_persistence_satisfied_with_load_bearing_unknowns_remaining'],
        };
      }
      return {
        resolutionState: 'RESOLVED',
        resolvedStateIds: [candidateStateId],
        stateSupport,
        remainingUnknownWitnessIds,
        reasonCodes: [...reasonCodes, supportingWindows.size >= 2 ? 'medium_state_repeated_comparable_support' : 'medium_state_overwhelming_plus_direct_support'],
      };
    }
    return {
      resolutionState: evidenceConflict ? 'CONTESTED' : 'LEANING',
      resolvedStateIds: [],
      stateSupport,
      remainingUnknownWitnessIds,
      reasonCodes: [...reasonCodes, 'medium_state_persistence_not_yet_satisfied'],
    };
  }

  const slowPersistenceSatisfied = supportingWindows.size >= 3 && supportingContexts.size >= 2;
  if (slowPersistenceSatisfied && !evidenceConflict) {
    if (remainingUnknownWitnessIds.length > 0) {
      return {
        resolutionState: 'PARTIALLY_RESOLVED',
        resolvedStateIds: [candidateStateId],
        stateSupport,
        remainingUnknownWitnessIds,
        reasonCodes: [...reasonCodes, 'slow_state_context_diverse_persistence_with_load_bearing_unknowns_remaining'],
      };
    }
    return {
      resolutionState: 'RESOLVED',
      resolvedStateIds: [candidateStateId],
      stateSupport,
      remainingUnknownWitnessIds,
      reasonCodes: [...reasonCodes, 'slow_state_context_diverse_multi_game_persistence_satisfied'],
    };
  }
  if (supportingWindows.size >= 2 && !evidenceConflict) {
    return {
      resolutionState: 'LEANING',
      resolvedStateIds: [],
      stateSupport,
      remainingUnknownWitnessIds,
      reasonCodes: [...reasonCodes, 'slow_state_two_comparable_windows_support_lead_only'],
    };
  }
  return {
    resolutionState: evidenceConflict ? 'CONTESTED' : 'UNRESOLVED',
    resolvedStateIds: [],
    stateSupport,
    remainingUnknownWitnessIds,
    reasonCodes: [...reasonCodes, 'slow_state_single_or_insufficient_window_cannot_resolve'],
  };
}

export function classifySharedAttentionV0(
  definition: SituationDefinitionV0,
  resolution: ResolutionAssessmentV0,
  witnessResults: WitnessResultV0[],
): SharedAttentionAssessmentV0 {
  const reasonCodes: string[] = [];
  const unresolved = resolution.resolutionState !== 'RESOLVED';
  const highBlast = definition.impactDefinition.blastRadius === 'HIGH' || definition.impactDefinition.blastRadius === 'VERY_HIGH';
  if (definition.impactDefinition.blastRadius === 'HIGH') reasonCodes.push('high_blast_radius');
  if (definition.impactDefinition.blastRadius === 'VERY_HIGH') reasonCodes.push('very_high_blast_radius');

  const resultByWitness = new Map(witnessResults.map((result) => [result.witnessId, result]));
  const loadBearingUnknown = definition.resolutionWitnesses.some((witness) => {
    if (witness.materiality !== 'LOAD_BEARING') return false;
    const result = resultByWitness.get(witness.witnessId);
    return !result || result.effects.every((effect) => effect.effect === 'indeterminate' || effect.effect === 'no_change');
  });
  if (loadBearingUnknown) reasonCodes.push('load_bearing_unknown');

  const unresolvedWitnesses = definition.resolutionWitnesses.filter((witness) => {
    const result = resultByWitness.get(witness.witnessId);
    return !result || result.effects.every((effect) => effect.effect === 'indeterminate' || effect.effect === 'no_change');
  });
  const imminent = unresolvedWitnesses.some((witness) => ['PRE_LOCK', 'SAME_DAY', 'NEXT_PRACTICE_CYCLE'].includes(witness.window));
  const byNextGame = unresolvedWitnesses.some((witness) => ['PRE_LOCK', 'SAME_DAY', 'NEXT_PRACTICE_CYCLE', 'NEXT_GAME'].includes(witness.window));
  if (imminent) reasonCodes.push('imminent_resolution_witness');

  const loadBearingConflict = resolution.resolutionState === 'CONTESTED'
    && definition.resolutionWitnesses.some((witness) => witness.materiality === 'LOAD_BEARING');
  if (loadBearingConflict) reasonCodes.push('load_bearing_conflict');

  const multiPlayerImpact = definition.impactDefinition.affectedPlayers.length >= 2
    || definition.classification.scope === 'multi_entity';
  if (multiPlayerImpact) reasonCodes.push('multi_player_scenario_impact');

  const whollyUnavailable = witnessResults.length > 0
    && witnessResults.every((result) => result.observationState === 'unavailable' || result.observationState === 'unobserved');
  const noActionableWitness = unresolvedWitnesses.every((witness) => ['MULTI_GAME', 'OPEN'].includes(witness.window));
  const unavailableWithoutActionableWitness = whollyUnavailable && noActionableWitness;
  if (unavailableWithoutActionableWitness) reasonCodes.push('unavailable_without_actionable_witness');

  if (unresolved && highBlast && loadBearingUnknown && (imminent || loadBearingConflict) && !unavailableWithoutActionableWitness) {
    return { sharedAttention: 'URGENT', reasonCodes: [...new Set(reasonCodes)].sort() };
  }
  if (
    unresolved
    && ((highBlast && byNextGame) || loadBearingConflict || (highBlast && multiPlayerImpact))
  ) {
    return { sharedAttention: 'ELEVATED', reasonCodes: [...new Set(reasonCodes)].sort() };
  }

  const slowOpenEnded = definition.classification.persistenceClass === 'slow'
    && definition.resolutionWitnesses.every((witness) => ['MULTI_GAME', 'OPEN'].includes(witness.window))
    && !loadBearingConflict;
  if (slowOpenEnded) {
    reasonCodes.push('slow_persistence_no_near_witness');
    return { sharedAttention: 'BACKGROUND', reasonCodes: [...new Set(reasonCodes)].sort() };
  }
  if (unresolved) return { sharedAttention: 'WATCH', reasonCodes: [...new Set(reasonCodes)].sort() };
  return { sharedAttention: 'BACKGROUND', reasonCodes: [...new Set(reasonCodes)].sort() };
}

export function validateScenarioBranchBindingV0(
  definition: SituationDefinitionV0,
  binding: ScenarioBranchBindingV0,
): ScenarioBranchValidationV0 {
  const reasonCodes: string[] = [];
  if (binding.situationId !== definition.situationId) reasonCodes.push('situation_id_mismatch');
  if (binding.stateSetCompleteness !== definition.stateSetCompleteness) reasonCodes.push('state_set_completeness_mismatch');

  const declaredStates = new Set(definition.competingStates.map((state) => state.stateId));
  const branchStates = binding.branches.map((branch) => branch.stateId);
  if (new Set(branchStates).size !== branchStates.length) reasonCodes.push('duplicate_branch_state');
  if (branchStates.some((id) => !declaredStates.has(id))) reasonCodes.push('undeclared_branch_state');
  if (declaredStates.size !== new Set(branchStates).size || [...declaredStates].some((id) => !branchStates.includes(id))) {
    reasonCodes.push('declared_state_missing_branch');
  }

  const declaredPlayers = new Set(definition.identity.playerIds);
  if (binding.branches.some((branch) => branch.affectedPlayerIds.some((id) => !declaredPlayers.has(id)))) {
    reasonCodes.push('branch_contains_undeclared_player');
  }

  const probabilityStatus = binding.probabilityBinding.status;
  if (probabilityStatus === 'CALIBRATED') {
    if (definition.stateSetCompleteness !== 'exhaustive') reasonCodes.push('calibrated_probability_requires_exhaustive_state_set');
    if (!binding.probabilityBinding.producerRef) reasonCodes.push('calibrated_probability_requires_producer_ref');
    if (!binding.probabilityBinding.calibrationRef) reasonCodes.push('calibrated_probability_requires_calibration_ref');
    if (!binding.probabilityBinding.horizonRef) reasonCodes.push('calibrated_probability_requires_horizon_ref');
    if (binding.branches.some((branch) => branch.stateProbability === null)) {
      reasonCodes.push('calibrated_probability_requires_every_branch_probability');
    } else {
      const sum = binding.branches.reduce((total, branch) => total + (branch.stateProbability ?? 0), 0);
      if (Math.abs(sum - 1) > 1e-9) reasonCodes.push('calibrated_branch_probabilities_must_sum_to_one');
    }
  } else {
    if (binding.branches.some((branch) => branch.stateProbability !== null)) {
      reasonCodes.push('qualitative_or_unavailable_binding_cannot_carry_numeric_probability');
    }
    if (binding.probabilityBinding.producerRef || binding.probabilityBinding.calibrationRef || binding.probabilityBinding.horizonRef) {
      reasonCodes.push('non_calibrated_probability_binding_must_not_claim_calibration_authority');
    }
  }

  return { valid: reasonCodes.length === 0, reasonCodes: [...new Set(reasonCodes)].sort() };
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
