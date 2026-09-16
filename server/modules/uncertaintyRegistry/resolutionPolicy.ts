import type {
  ResolutionAssessmentV0,
} from './policyCore';
import {
  classifySituationResolutionV0 as classifyBaseResolutionV0,
} from './policyCore';
import type {
  SituationDefinitionV0,
  SituationEvaluationSnapshotV0,
  WitnessResultV0,
} from './contracts';

function supports(result: WitnessResultV0, stateId: string): boolean {
  const effect = result.effects.find((entry) => entry.stateId === stateId)?.effect;
  return effect === 'supports' || effect === 'strongly_supports';
}

function stronglySupports(result: WitnessResultV0, stateId: string): boolean {
  return result.effects.find((entry) => entry.stateId === stateId)?.effect === 'strongly_supports';
}

function comparableGroups(results: WitnessResultV0[]): Map<string, WitnessResultV0[]> {
  const groups = new Map<string, WitnessResultV0[]>();
  for (const result of results) {
    if (result.comparisonKey === null || result.windowInstanceId === null) continue;
    groups.set(result.comparisonKey, [...(groups.get(result.comparisonKey) ?? []), result]);
  }
  return groups;
}

function uniqueWindowCount(results: WitnessResultV0[]): number {
  return new Set(results.map((result) => result.windowInstanceId).filter((value): value is string => value !== null)).size;
}

function uniqueContextCount(results: WitnessResultV0[]): number {
  return new Set(results.map((result) => result.contextKey).filter((value): value is string => value !== null)).size;
}

function replacePersistenceReason(
  assessment: ResolutionAssessmentV0,
  resolutionState: ResolutionAssessmentV0['resolutionState'],
  reasonCode: string,
): ResolutionAssessmentV0 {
  const filtered = assessment.reasonCodes.filter((reason) => !reason.startsWith('medium_state_') && !reason.startsWith('slow_state_'));
  return {
    ...assessment,
    resolutionState,
    resolvedStateIds: [],
    reasonCodes: Array.from(new Set([...filtered, reasonCode])).sort(),
  };
}

/**
 * Applies the USR-0 persistence/comparability gate on top of the categorical
 * base resolver. Window count alone is never sufficient: repeated evidence
 * must share an explicit comparisonKey before it can satisfy medium/slow
 * persistence. Slow persistence additionally requires context diversity.
 */
export function classifySituationResolutionV0(
  definition: SituationDefinitionV0,
  witnessResults: WitnessResultV0[],
  priorSnapshot: SituationEvaluationSnapshotV0 | null = null,
): ResolutionAssessmentV0 {
  const assessment = classifyBaseResolutionV0(definition, witnessResults, priorSnapshot);
  if (definition.classification.persistenceClass === 'fast') return assessment;
  if (!['RESOLVED', 'PARTIALLY_RESOLVED'].includes(assessment.resolutionState)) return assessment;

  const resolvedStateId = assessment.resolvedStateIds[0];
  if (!resolvedStateId) return assessment;

  const supporting = witnessResults.filter((result) => supports(result, resolvedStateId));
  const groups = comparableGroups(supporting);
  const witnessById = new Map(definition.resolutionWitnesses.map((witness) => [witness.witnessId, witness]));

  if (definition.classification.persistenceClass === 'medium') {
    const repeatedComparable = Array.from(groups.values()).some((group) => uniqueWindowCount(group) >= 2);
    const directSupport = supporting.some((result) => witnessById.get(result.witnessId)?.coverageRequirement === 'DIRECT_AUTHORITATIVE');
    const overwhelmingDeployment = supporting.some((result) => {
      const witness = witnessById.get(result.witnessId);
      return witness?.coverageRequirement !== 'DIRECT_AUTHORITATIVE'
        && (witness?.materiality === 'LOAD_BEARING' || witness?.materiality === 'HIGH')
        && stronglySupports(result, resolvedStateId);
    });
    if (repeatedComparable || (directSupport && overwhelmingDeployment)) return assessment;
    return replacePersistenceReason(assessment, 'LEANING', 'medium_state_comparable_persistence_not_satisfied');
  }

  const slowSatisfied = Array.from(groups.values()).some(
    (group) => uniqueWindowCount(group) >= 3 && uniqueContextCount(group) >= 2,
  );
  if (slowSatisfied) return assessment;

  const hasComparablePair = Array.from(groups.values()).some((group) => uniqueWindowCount(group) >= 2);
  return replacePersistenceReason(
    assessment,
    hasComparablePair ? 'LEANING' : 'UNRESOLVED',
    hasComparablePair
      ? 'slow_state_comparable_windows_support_lead_only'
      : 'slow_state_comparable_persistence_not_satisfied',
  );
}
