import {
  ResolutionAssessmentV0Schema,
  ScenarioBranchBindingV0Schema,
  SituationDefinitionV0Schema,
  WitnessObservationV0Schema,
  type ResolutionAssessmentV0,
  type ScenarioBranchBindingV0,
  type SharedAttentionV0,
  type SituationDefinitionV0,
  type SituationEvaluationSnapshotV0,
  type StateSupportV0,
  type WitnessEffectV0,
  type WitnessObservationV0,
  type WitnessResultV0,
  type WitnessWindowV0,
} from './contracts';
import { governedRefKey } from './canonicalization';

export const USR_RESOLUTION_POLICY_VERSION = 'ffcc.usr.resolution-policy.v0.1.0' as const;
export const USR_ATTENTION_POLICY_VERSION = 'ffcc.usr.attention-policy.v0.1.0' as const;

const WINDOW_ORDER: Record<WitnessWindowV0, number> = {
  PRE_LOCK: 0,
  SAME_DAY: 1,
  NEXT_PRACTICE_CYCLE: 2,
  NEXT_GAME: 3,
  ONE_TO_TWO_GAMES: 4,
  MULTI_GAME: 5,
  OPEN: 6,
};

const REOPEN_TRIGGERS = new Set([
  'INJURY',
  'TRANSACTION',
  'COACHING_CHANGE',
  'RETURN_FROM_ABSENCE',
  'MEANINGFUL_ROLE_REVERSAL',
  'REPEATED_DEPLOYMENT_CHANGE',
  'SOURCE_CORRECTION',
]);

export type ReevaluationTriggerV0 =
  | 'EVIDENCE_CHANGED'
  | 'CORRECTION'
  | 'INJURY'
  | 'TRANSACTION'
  | 'COACHING_CHANGE'
  | 'RETURN_FROM_ABSENCE'
  | 'MEANINGFUL_ROLE_REVERSAL'
  | 'REPEATED_DEPLOYMENT_CHANGE'
  | 'SOURCE_CORRECTION'
  | 'ROUTINE_NOISE';

export type SharedAttentionAssessmentV0 = {
  attention: SharedAttentionV0;
  reasonCodes: string[];
  nextUnresolvedWindow: WitnessWindowV0 | null;
  loadBearingUnknownCount: number;
};

export type ScenarioBranchValidationV0 = { valid: boolean; reasonCodes: string[] };

export function isSituationEvidenceEligibleAtV0(knownAt: string, asOf: string): boolean {
  const known = Date.parse(knownAt);
  const cutoff = Date.parse(asOf);
  return Number.isFinite(known) && Number.isFinite(cutoff) && known <= cutoff;
}

function indeterminateResult(
  observation: WitnessObservationV0,
  witness: SituationDefinitionV0['resolutionWitnesses'][number] | null,
  status: WitnessResultV0['status'],
  reasonCodes: string[],
): WitnessResultV0 {
  return {
    observationId: observation.observationId,
    witnessId: observation.witnessId,
    windowId: observation.windowId,
    contextKey: observation.contextKey,
    status,
    observationState: observation.observationState,
    coverageState: observation.coverageState,
    materiality: witness?.materiality ?? null,
    resolutionUse: witness?.resolutionUse ?? null,
    requiredForResolution: witness?.requiredForResolution ?? false,
    comparabilityKey: witness?.comparabilityKey ?? null,
    stateEffects: witness?.stateEffects.map((entry) => ({ stateId: entry.stateId, effect: 'indeterminate' as const })) ?? [],
    evidenceRefs: observation.evidenceRefs,
    reasonCodes,
  };
}

export function evaluateWitnessV0(
  definitionInput: SituationDefinitionV0,
  observationInput: WitnessObservationV0,
  asOf: string,
): WitnessResultV0 {
  const definition = SituationDefinitionV0Schema.parse(definitionInput);
  const observation = WitnessObservationV0Schema.parse(observationInput);
  const witness = definition.resolutionWitnesses.find((candidate) => candidate.witnessId === observation.witnessId) ?? null;

  if (!witness) return indeterminateResult(observation, null, 'UNKNOWN_WITNESS', ['unknown_witness']);
  if (!isSituationEvidenceEligibleAtV0(observation.knownAt, asOf)) {
    return indeterminateResult(observation, witness, 'FUTURE_EVIDENCE', ['known_after_as_of']);
  }
  if (governedRefKey(witness.sourceRequirementRef) !== governedRefKey(observation.sourceRequirementRef)) {
    return indeterminateResult(observation, witness, 'SOURCE_MISMATCH', ['source_requirement_mismatch']);
  }
  if (['UNOBSERVED', 'UNAVAILABLE', 'CONTRADICTED'].includes(observation.observationState)) {
    return indeterminateResult(
      observation,
      witness,
      'INDETERMINATE',
      [observation.observationState === 'CONTRADICTED' ? 'source_conflict_preserved' : 'missing_evidence_is_not_negative_evidence'],
    );
  }

  let effectKey: 'observedPresent' | 'observedAbsent';
  if (observation.observationState === 'OBSERVED_PRESENT') {
    effectKey = 'observedPresent';
  } else {
    const absenceObservable = witness.absenceSemantics === 'OBSERVABLE_ZERO_ONLY_WITH_COMPLETE_WINDOW'
      && observation.windowState === 'CLOSED'
      && observation.coverageState === 'COMPLETE';
    if (!absenceObservable) {
      const reasons = ['observed_absence_not_admissible'];
      if (witness.coverageRequirement === 'COMPLETE_REQUIRED' && observation.coverageState !== 'COMPLETE') {
        reasons.push('required_coverage_incomplete');
      }
      return indeterminateResult(observation, witness, 'INDETERMINATE', reasons);
    }
    effectKey = 'observedAbsent';
  }

  if (witness.coverageRequirement === 'COMPLETE_REQUIRED' && observation.coverageState !== 'COMPLETE') {
    return indeterminateResult(observation, witness, 'INDETERMINATE', ['required_coverage_incomplete']);
  }

  return {
    observationId: observation.observationId,
    witnessId: observation.witnessId,
    windowId: observation.windowId,
    contextKey: observation.contextKey,
    status: 'ADMISSIBLE',
    observationState: observation.observationState,
    coverageState: observation.coverageState,
    materiality: witness.materiality,
    resolutionUse: witness.resolutionUse,
    requiredForResolution: witness.requiredForResolution,
    comparabilityKey: witness.comparabilityKey,
    stateEffects: witness.stateEffects.map((entry) => ({ stateId: entry.stateId, effect: entry[effectKey] })),
    evidenceRefs: observation.evidenceRefs,
    reasonCodes: [],
  };
}

export function evaluateWitnessSetV0(
  definition: SituationDefinitionV0,
  observations: readonly WitnessObservationV0[],
  asOf: string,
): WitnessResultV0[] {
  return observations.map((observation) => evaluateWitnessV0(definition, observation, asOf));
}

function effectsForState(results: readonly WitnessResultV0[], stateId: string): WitnessEffectV0[] {
  return results
    .filter((result) => result.status === 'ADMISSIBLE')
    .flatMap((result) => result.stateEffects.filter((entry) => entry.stateId === stateId).map((entry) => entry.effect));
}

function supportForEffects(effects: readonly WitnessEffectV0[]): StateSupportV0 {
  if (effects.includes('rules_out')) return 'RULED_OUT';
  const supportive = effects.includes('supports') || effects.includes('strongly_supports');
  if (effects.includes('refutes') && !supportive) return 'CONTRADICTED';
  if (supportive) return 'SUPPORTED';
  if (effects.includes('no_change')) return 'PLAUSIBLE';
  return 'UNASSESSED';
}

function supportiveEffect(effect: WitnessEffectV0): boolean {
  return effect === 'supports' || effect === 'strongly_supports';
}

function resultSupportsState(result: WitnessResultV0, stateId: string): boolean {
  return result.status === 'ADMISSIBLE'
    && result.stateEffects.some((entry) => entry.stateId === stateId && supportiveEffect(entry.effect));
}

function resultStronglySupportsState(result: WitnessResultV0, stateId: string): boolean {
  return result.status === 'ADMISSIBLE'
    && result.stateEffects.some((entry) => entry.stateId === stateId && entry.effect === 'strongly_supports');
}

function distinct<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

export function classifySituationResolutionV0(
  definitionInput: SituationDefinitionV0,
  witnessResults: readonly WitnessResultV0[],
): ResolutionAssessmentV0 {
  const definition = SituationDefinitionV0Schema.parse(definitionInput);
  const stateRows = definition.competingStates.map((state) => {
    const effects = effectsForState(witnessResults, state.stateId);
    return {
      stateId: state.stateId,
      support: supportForEffects(effects),
      basisWitnessIds: distinct(witnessResults.filter((result) => resultSupportsState(result, state.stateId)).map((result) => result.witnessId)),
      contradictionWitnessIds: distinct(witnessResults.filter((result) => result.status === 'ADMISSIBLE' && result.stateEffects.some((entry) => entry.stateId === state.stateId && (entry.effect === 'refutes' || entry.effect === 'rules_out'))).map((result) => result.witnessId)),
    };
  });

  const directlyConflicted = witnessResults.some((result) => result.observationState === 'CONTRADICTED');
  const supportedStates = stateRows.filter((row) => row.support === 'SUPPORTED').map((row) => row.stateId);
  const viableStates = stateRows.filter((row) => row.support !== 'RULED_OUT').map((row) => row.stateId);
  const contested = directlyConflicted || supportedStates.length > 1;
  let leadingStateId: string | null = null;

  if (!contested && supportedStates.length === 1) leadingStateId = supportedStates[0];
  else if (!contested && supportedStates.length === 0 && viableStates.length === 1) leadingStateId = viableStates[0];

  const stateSupport = stateRows.map((row) => ({
    ...row,
    support: row.stateId === leadingStateId && row.support !== 'RULED_OUT' ? 'LEADING' as const : row.support,
  }));

  const remainingRequiredWitnessIds = definition.resolutionWitnesses
    .filter((witness) => witness.requiredForResolution)
    .filter((witness) => !witnessResults.some((result) => result.witnessId === witness.witnessId && result.status === 'ADMISSIBLE'))
    .map((witness) => witness.witnessId);

  if (contested) {
    return ResolutionAssessmentV0Schema.parse({
      resolutionState: 'CONTESTED', stateSupport, resolvedStateIds: [], leadingStateId: null,
      remainingRequiredWitnessIds, reasonCodes: ['material_competing_support_or_source_conflict'],
    });
  }
  if (!leadingStateId) {
    return ResolutionAssessmentV0Schema.parse({
      resolutionState: 'UNRESOLVED', stateSupport, resolvedStateIds: [], leadingStateId: null,
      remainingRequiredWitnessIds, reasonCodes: ['no_state_has_materially_stronger_support'],
    });
  }

  const supporting = witnessResults.filter((result) => resultSupportsState(result, leadingStateId!));
  let persistenceSatisfied = false;
  const reasonCodes: string[] = [];

  if (definition.classification.persistenceClass === 'fast') {
    persistenceSatisfied = supporting.some((result) => result.resolutionUse === 'DIRECT_AUTHORITATIVE' && result.materiality === 'LOAD_BEARING');
    if (persistenceSatisfied) reasonCodes.push('fast_direct_authoritative_witness');
  } else if (definition.classification.persistenceClass === 'medium') {
    const comparableGroups = new Map<string, Set<string>>();
    for (const result of supporting.filter((row) => row.resolutionUse === 'DEPLOYMENT' && row.comparabilityKey)) {
      const set = comparableGroups.get(result.comparabilityKey!) ?? new Set<string>();
      set.add(result.windowId);
      comparableGroups.set(result.comparabilityKey!, set);
    }
    const repeatedComparable = Array.from(comparableGroups.values()).some((windows) => windows.size >= 2);
    const overwhelmingDeployment = supporting.some((result) => result.resolutionUse === 'DEPLOYMENT' && resultStronglySupportsState(result, leadingStateId!));
    const independentDirect = supporting.some((result) => result.resolutionUse === 'DIRECT_AUTHORITATIVE');
    persistenceSatisfied = repeatedComparable || (overwhelmingDeployment && independentDirect);
    if (repeatedComparable) reasonCodes.push('medium_repeated_comparable_deployment');
    if (overwhelmingDeployment && independentDirect) reasonCodes.push('medium_overwhelming_plus_direct_role_witness');
  } else {
    const persistenceRows = supporting.filter((result) => result.resolutionUse === 'DEPLOYMENT' || result.resolutionUse === 'CONTEXTUAL');
    const windows = distinct(persistenceRows.map((result) => result.windowId));
    const contexts = distinct(persistenceRows.map((result) => result.contextKey).filter((value): value is string => value !== null));
    persistenceSatisfied = windows.length >= 3 && contexts.length >= 2;
    if (persistenceSatisfied) reasonCodes.push('slow_multi_window_context_diverse_confirmation');
  }

  if (!persistenceSatisfied) {
    reasonCodes.push('persistence_requirement_not_yet_satisfied');
    return ResolutionAssessmentV0Schema.parse({
      resolutionState: 'LEANING', stateSupport, resolvedStateIds: [], leadingStateId,
      remainingRequiredWitnessIds, reasonCodes,
    });
  }

  if (remainingRequiredWitnessIds.length > 0) {
    reasonCodes.push('required_resolution_witnesses_remain');
    return ResolutionAssessmentV0Schema.parse({
      resolutionState: 'PARTIALLY_RESOLVED', stateSupport, resolvedStateIds: [leadingStateId], leadingStateId,
      remainingRequiredWitnessIds, reasonCodes,
    });
  }

  reasonCodes.push('resolution_policy_satisfied');
  return ResolutionAssessmentV0Schema.parse({
    resolutionState: 'RESOLVED', stateSupport, resolvedStateIds: [leadingStateId], leadingStateId,
    remainingRequiredWitnessIds: [], reasonCodes,
  });
}

function unresolvedWitnesses(definition: SituationDefinitionV0, results: readonly WitnessResultV0[]) {
  return definition.resolutionWitnesses.filter((witness) => !results.some((result) => result.witnessId === witness.witnessId && result.status === 'ADMISSIBLE'));
}

export function classifySharedAttentionV0(
  definitionInput: SituationDefinitionV0,
  resolution: ResolutionAssessmentV0,
  witnessResults: readonly WitnessResultV0[],
): SharedAttentionAssessmentV0 {
  const definition = SituationDefinitionV0Schema.parse(definitionInput);
  const pending = unresolvedWitnesses(definition, witnessResults);
  const loadBearing = pending.filter((witness) => witness.materiality === 'LOAD_BEARING');
  const actionable = pending.filter((witness) => witness.window !== 'OPEN');
  const nextUnresolvedWindow = pending.length
    ? pending.map((witness) => witness.window).sort((a, b) => WINDOW_ORDER[a] - WINDOW_ORDER[b])[0]
    : null;
  const highBlast = definition.impactDefinition.blastRadius === 'HIGH' || definition.impactDefinition.blastRadius === 'VERY_HIGH';
  const conflict = resolution.resolutionState === 'CONTESTED' || witnessResults.some((result) => result.observationState === 'CONTRADICTED');
  const active = resolution.resolutionState !== 'RESOLVED';
  const reasons: string[] = [];

  if (definition.impactDefinition.blastRadius === 'HIGH') reasons.push('high_blast_radius');
  if (definition.impactDefinition.blastRadius === 'VERY_HIGH') reasons.push('very_high_blast_radius');
  if (loadBearing.length) reasons.push('load_bearing_unknown');
  if (conflict) reasons.push('load_bearing_conflict');
  if (definition.impactDefinition.affectedPlayerIds.length > 1 && definition.competingStates.length > 1) reasons.push('multi_player_scenario_impact');

  const imminent = nextUnresolvedWindow !== null && WINDOW_ORDER[nextUnresolvedWindow] <= WINDOW_ORDER.NEXT_PRACTICE_CYCLE;
  if (imminent) reasons.push('imminent_resolution_witness');

  if (active && highBlast && loadBearing.length > 0 && actionable.length > 0 && (imminent || conflict)) {
    return { attention: 'URGENT', reasonCodes: distinct(reasons), nextUnresolvedWindow, loadBearingUnknownCount: loadBearing.length };
  }

  const byNextGame = nextUnresolvedWindow !== null && WINDOW_ORDER[nextUnresolvedWindow] <= WINDOW_ORDER.NEXT_GAME;
  if (active && ((highBlast && byNextGame) || (conflict && loadBearing.length > 0) || (definition.impactDefinition.affectedPlayerIds.length > 1 && resolution.resolutionState === 'PARTIALLY_RESOLVED'))) {
    return { attention: 'ELEVATED', reasonCodes: distinct(reasons), nextUnresolvedWindow, loadBearingUnknownCount: loadBearing.length };
  }

  const slowPersistenceWaiting = definition.classification.persistenceClass === 'slow'
    && resolution.resolutionState !== 'RESOLVED'
    && (nextUnresolvedWindow === null || nextUnresolvedWindow === 'MULTI_GAME' || nextUnresolvedWindow === 'OPEN');
  if (!active || slowPersistenceWaiting) {
    if (definition.classification.persistenceClass === 'slow') reasons.push('slow_persistence_no_near_witness');
    return { attention: 'BACKGROUND', reasonCodes: distinct(reasons), nextUnresolvedWindow, loadBearingUnknownCount: loadBearing.length };
  }

  if (pending.length > 0 && actionable.length === 0) reasons.push('unavailable_without_actionable_witness');
  return { attention: 'WATCH', reasonCodes: distinct(reasons), nextUnresolvedWindow, loadBearingUnknownCount: loadBearing.length };
}

export function validateScenarioBranchBindingV0(
  definitionInput: SituationDefinitionV0,
  bindingInput: ScenarioBranchBindingV0,
): ScenarioBranchValidationV0 {
  const reasons: string[] = [];
  const definition = SituationDefinitionV0Schema.parse(definitionInput);
  const parsed = ScenarioBranchBindingV0Schema.safeParse(bindingInput);
  if (!parsed.success) return { valid: false, reasonCodes: ['scenario_binding_schema_invalid'] };
  const binding = parsed.data;

  if (binding.situationId !== definition.situationId) reasons.push('situation_id_mismatch');
  if (binding.stateSetCompleteness !== definition.stateSetCompleteness) reasons.push('state_set_completeness_mismatch');
  const declaredStates = new Map(definition.competingStates.map((state) => [state.stateId, state]));
  const declaredPlayers = new Set(definition.identity.playerIds);
  for (const branch of binding.branches) {
    const state = declaredStates.get(branch.stateId);
    if (!state) {
      reasons.push('branch_references_undeclared_state');
      continue;
    }
    if (branch.affectedPlayerIds.some((playerId) => !declaredPlayers.has(playerId))) reasons.push('branch_references_undeclared_player');
    if (state.consequences.scenarioKeys.length > 0 && !state.consequences.scenarioKeys.includes(branch.scenarioKey)) reasons.push('scenario_key_not_declared_by_state');
  }

  if (binding.probabilityBinding.status === 'CALIBRATED') {
    if (definition.stateSetCompleteness !== 'exhaustive') reasons.push('calibrated_binding_requires_exhaustive_state_set');
    const branchStates = new Set(binding.branches.map((branch) => branch.stateId));
    if (branchStates.size !== declaredStates.size || Array.from(declaredStates.keys()).some((stateId) => !branchStates.has(stateId))) reasons.push('calibrated_binding_requires_full_state_coverage');
  }

  return { valid: reasons.length === 0, reasonCodes: distinct(reasons) };
}

export function canReopenSituationV0(trigger: ReevaluationTriggerV0): boolean {
  return REOPEN_TRIGGERS.has(trigger);
}

export function shouldReevaluateSituationV0(
  priorSnapshot: SituationEvaluationSnapshotV0,
  currentInputFingerprint: string,
  trigger: ReevaluationTriggerV0,
): { reevaluate: boolean; materialDelta: 'MATERIAL_CHANGE' | 'NO_MATERIAL_CHANGE' | 'CORRECTION' | 'REOPENED'; reasonCodes: string[] } {
  if (trigger === 'CORRECTION' || trigger === 'SOURCE_CORRECTION') {
    return { reevaluate: true, materialDelta: trigger === 'SOURCE_CORRECTION' && priorSnapshot.resolutionState === 'RESOLVED' ? 'REOPENED' : 'CORRECTION', reasonCodes: ['correction_requires_append_only_reevaluation'] };
  }
  if (priorSnapshot.resolutionState === 'RESOLVED' && canReopenSituationV0(trigger)) {
    return { reevaluate: true, materialDelta: 'REOPENED', reasonCodes: ['allowed_reopen_cause'] };
  }
  if (trigger === 'ROUTINE_NOISE') {
    return { reevaluate: false, materialDelta: 'NO_MATERIAL_CHANGE', reasonCodes: ['routine_noise_cannot_reopen_or_flip_state'] };
  }
  if (currentInputFingerprint !== priorSnapshot.inputFingerprint) {
    return { reevaluate: true, materialDelta: 'MATERIAL_CHANGE', reasonCodes: ['eligible_input_fingerprint_changed'] };
  }
  return { reevaluate: false, materialDelta: 'NO_MATERIAL_CHANGE', reasonCodes: ['eligible_input_fingerprint_unchanged'] };
}
