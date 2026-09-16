import type {
  SharedAttentionV0,
  SituationDefinitionV0,
  WitnessResultV0,
} from './contracts';
import type {
  ResolutionAssessmentV0,
  SharedAttentionAssessmentV0,
} from './policyCore';

export function classifySharedAttentionV0(
  definition: SituationDefinitionV0,
  resolution: ResolutionAssessmentV0,
  witnessResults: WitnessResultV0[],
): SharedAttentionAssessmentV0 {
  const reasons: string[] = [];
  const unresolved = resolution.resolutionState !== 'RESOLVED';
  const highBlast = definition.impactDefinition.blastRadius === 'HIGH'
    || definition.impactDefinition.blastRadius === 'VERY_HIGH';
  if (definition.impactDefinition.blastRadius === 'HIGH') reasons.push('high_blast_radius');
  if (definition.impactDefinition.blastRadius === 'VERY_HIGH') reasons.push('very_high_blast_radius');

  const resultsByWitness = new Map<string, WitnessResultV0[]>();
  for (const result of witnessResults) {
    resultsByWitness.set(result.witnessId, [...(resultsByWitness.get(result.witnessId) ?? []), result]);
  }

  const unresolvedWitnesses = definition.resolutionWitnesses.filter((witness) => {
    const matching = resultsByWitness.get(witness.witnessId) ?? [];
    return matching.length === 0 || matching.every((result) => result.effects.every(
      (effect) => effect.effect === 'indeterminate' || effect.effect === 'no_change',
    ));
  });
  const loadBearingUnknown = unresolvedWitnesses.some((witness) => witness.materiality === 'LOAD_BEARING');
  if (loadBearingUnknown) reasons.push('load_bearing_unknown');

  const imminent = unresolvedWitnesses.some((witness) => (
    witness.window === 'PRE_LOCK'
    || witness.window === 'SAME_DAY'
    || witness.window === 'NEXT_PRACTICE_CYCLE'
  ));
  const byNextGame = unresolvedWitnesses.some((witness) => (
    witness.window === 'PRE_LOCK'
    || witness.window === 'SAME_DAY'
    || witness.window === 'NEXT_PRACTICE_CYCLE'
    || witness.window === 'NEXT_GAME'
  ));
  if (imminent) reasons.push('imminent_resolution_witness');

  const loadBearingConflict = resolution.resolutionState === 'CONTESTED'
    && definition.resolutionWitnesses.some((witness) => witness.materiality === 'LOAD_BEARING');
  if (loadBearingConflict) reasons.push('load_bearing_conflict');

  const multiPlayerImpact = definition.impactDefinition.affectedPlayers.length >= 2
    || definition.classification.scope === 'multi_entity';
  if (multiPlayerImpact) reasons.push('multi_player_scenario_impact');

  const whollyUnavailable = witnessResults.length > 0 && witnessResults.every(
    (result) => result.observationState === 'unavailable' || result.observationState === 'unobserved',
  );
  const noActionableWitness = unresolvedWitnesses.every(
    (witness) => witness.window === 'MULTI_GAME' || witness.window === 'OPEN',
  );
  const unavailableWithoutActionableWitness = whollyUnavailable && noActionableWitness;
  if (unavailableWithoutActionableWitness) reasons.push('unavailable_without_actionable_witness');

  const slowOpen = definition.classification.persistenceClass === 'slow'
    && definition.resolutionWitnesses.every(
      (witness) => witness.window === 'MULTI_GAME' || witness.window === 'OPEN',
    )
    && !loadBearingConflict;

  const result = (sharedAttention: SharedAttentionV0): SharedAttentionAssessmentV0 => ({
    sharedAttention,
    reasonCodes: Array.from(new Set(reasons)).sort(),
  });

  if (
    unresolved
    && highBlast
    && loadBearingUnknown
    && (imminent || loadBearingConflict)
    && !unavailableWithoutActionableWitness
  ) {
    return result('URGENT');
  }

  // Slow, open-ended regime questions remain background unless a real
  // near-term/conflict trigger exists. Broad blast radius alone cannot turn a
  // long-horizon uncertainty into an elevated alert.
  if (slowOpen) {
    reasons.push('slow_persistence_no_near_witness');
    return result('BACKGROUND');
  }

  if (
    unresolved
    && ((highBlast && byNextGame) || loadBearingConflict || (highBlast && multiPlayerImpact))
  ) {
    return result('ELEVATED');
  }

  return result(unresolved ? 'WATCH' : 'BACKGROUND');
}
