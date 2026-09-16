import {
  OperatorSituationOverlayV0Schema,
  ScenarioBranchBindingV0Schema,
  SituationDefinitionV0Schema,
  WitnessObservationV0Schema,
  type GovernedRefV0,
  type OperatorSituationOverlayV0,
  type ScenarioBranchBindingV0,
  type SituationDefinitionV0,
  type WitnessObservationV0,
} from '../contracts';
import {
  OpportunityAllocationV0Schema,
  OpportunityConservationConstraintV0Schema,
  type OpportunityAllocationV0,
  type OpportunityConservationConstraintV0,
} from '../conservation';
import { withUsrDigest } from '../canonicalization';

export const FIXTURE_PLAYER_A = 'tbr_p_01H00000000000000000000001';
export const FIXTURE_PLAYER_B = 'tbr_p_01H00000000000000000000002';
export const FIXTURE_PLAYER_C = 'tbr_p_01H00000000000000000000003';

const safeId = (seed: string) => seed.length >= 6 ? seed : `seed_${seed}`;

export function fixtureRef(id: string): GovernedRefV0 {
  return { refType: 'governed', namespace: 'fixture.usr0', id, version: 'v0', digest: null };
}

type DefinitionOptions = {
  persistenceClass?: 'fast' | 'medium' | 'slow';
  primaryClass?: SituationDefinitionV0['classification']['primaryClass'];
  stateSetCompleteness?: SituationDefinitionV0['stateSetCompleteness'];
  blastRadius?: SituationDefinitionV0['impactDefinition']['blastRadius'];
  stateCount?: 2 | 3;
  witnessCount?: 1 | 2 | 3;
  witnessLeads?: number[];
  scope?: SituationDefinitionV0['classification']['scope'];
  witnessWindows?: Array<SituationDefinitionV0['resolutionWitnesses'][number]['window']>;
  coverageRequirements?: Array<SituationDefinitionV0['resolutionWitnesses'][number]['coverageRequirement']>;
};

export function makeDefinition(seed: string, options: DefinitionOptions = {}): SituationDefinitionV0 {
  const idSeed = safeId(seed);
  const stateCount = options.stateCount ?? 2;
  const witnessCount = options.witnessCount ?? 1;
  const players = (stateCount === 3
    ? [FIXTURE_PLAYER_A, FIXTURE_PLAYER_B, FIXTURE_PLAYER_C]
    : [FIXTURE_PLAYER_A, FIXTURE_PLAYER_B]);
  const states = players.slice(0, stateCount).map((id, index) => ({
    stateId: `state:s${index + 1}`,
    label: `Synthetic state ${index + 1}`,
    description: `Synthetic competing state ${index + 1} for ${idSeed}.`,
    mechanism: `Synthetic mechanism ${index + 1}.`,
    requiredConditions: [`condition:${index + 1}`],
    expectedObservables: [`observable:${index + 1}`],
    disconfirmingObservables: [`disconfirm:${index + 1}`],
    supportPolicy: { supportScale: 'categorical_v0' as const },
    consequences: {
      playerRoleChanges: [{ playerId: id, roleKey: 'synthetic_role_share', effect: 'increase' as const, detail: 'Synthetic fixture only.' }],
      teamEnvironmentChanges: [],
      scenarioKeys: [`scenario:${idSeed}:${index + 1}`],
    },
  }));
  const persistenceClass = options.persistenceClass ?? 'medium';
  const defaultWindow = persistenceClass === 'fast' ? 'PRE_LOCK' : persistenceClass === 'slow' ? 'MULTI_GAME' : 'NEXT_GAME';
  const witnesses = Array.from({ length: witnessCount }, (_, index) => {
    const leadIndex = options.witnessLeads?.[index] ?? 0;
    return {
      witnessId: `witness:w${index + 1}`,
      question: `Synthetic witness ${index + 1} for ${idSeed}?`,
      entityRefs: players,
      domain: index === 0 ? 'early_down' as const : index === 1 ? 'two_minute' as const : 'inside_five' as const,
      sourceRequirementRef: fixtureRef(`source:${idSeed}:${index + 1}`),
      metricDefinitionRef: fixtureRef(`metric:${idSeed}:${index + 1}`),
      window: options.witnessWindows?.[index] ?? defaultWindow,
      coverageRequirement: options.coverageRequirements?.[index] ?? 'PARTIAL_ALLOWED' as const,
      materiality: 'LOAD_BEARING' as const,
      stateEffects: states.map((state, stateIndex) => ({
        stateId: state.stateId,
        observedPresent: stateIndex === leadIndex ? 'strongly_supports' as const : 'refutes' as const,
        observedAbsent: stateIndex === leadIndex ? 'refutes' as const : 'supports' as const,
      })),
      absenceSemantics: 'OBSERVABLE_ZERO_ONLY_WITH_COMPLETE_WINDOW' as const,
    };
  });
  const raw = {
    schemaVersion: 'ffcc.usr.situation-definition.v0.1.0' as const,
    situationId: `usr_sit_${idSeed}`,
    recordId: `usr_def_${idSeed}`,
    versionOrdinal: 1,
    season: 2026,
    createdAt: '2026-09-16T12:00:00Z',
    knownAt: '2026-09-16T12:00:00Z',
    identity: {
      primaryTeamRef: fixtureRef(`team:${idSeed}`), relatedTeamRefs: [], playerIds: players,
      positionGroup: options.primaryClass === 'STARTER_IDENTITY' ? 'QB' as const : 'RB' as const,
      gameRefs: [fixtureRef(`game:${idSeed}`)],
    },
    classification: {
      primaryClass: options.primaryClass ?? 'ROLE_ALLOCATION' as const,
      secondaryClasses: [],
      scope: options.scope ?? (stateCount === 3 ? 'multi_entity' as const : 'position_group' as const),
      persistenceClass,
    },
    question: `What is the unresolved synthetic football state for ${idSeed}?`,
    stateSetCompleteness: options.stateSetCompleteness ?? 'exhaustive' as const,
    competingStates: states,
    resolutionWitnesses: witnesses,
    impactDefinition: {
      affectedPlayers: players,
      affectedTeamVariables: ['synthetic_team_variable'],
      affectedDecisionSurfaces: ['lineup' as const, 'waiver' as const],
      blastRadius: options.blastRadius ?? 'HIGH' as const,
    },
    policyRefs: {
      resolutionPolicyRef: fixtureRef('policy:resolution:v0'),
      attentionPolicyRef: fixtureRef('policy:attention:v0'),
      evidenceEligibilityPolicyRef: fixtureRef('policy:eligibility:v0'),
      canonicalizationProfile: 'ffcc.usr.digest/jcs-sha256-v0' as const,
    },
    predecessorDefinitionRef: null,
    warnings: ['synthetic_fixture_only'],
  };
  return SituationDefinitionV0Schema.parse(withUsrDigest(raw as unknown as Record<string, unknown>));
}

type ObservationOptions = {
  observationState?: WitnessObservationV0['observationState'];
  windowState?: WitnessObservationV0['windowState'];
  coverageState?: WitnessObservationV0['coverageState'];
  knownAt?: string;
  observedAt?: string | null;
  windowInstanceId?: string | null;
  comparisonKey?: string | null;
  contextKey?: string | null;
  sourceRequirementRef?: GovernedRefV0;
};

export function makeObservation(
  definition: SituationDefinitionV0,
  witnessId: string,
  seed: string,
  options: ObservationOptions = {},
): WitnessObservationV0 {
  const idSeed = safeId(seed);
  const witness = definition.resolutionWitnesses.find((candidate) => candidate.witnessId === witnessId);
  if (!witness) throw new Error(`fixture witness not found: ${witnessId}`);
  const observationState = options.observationState ?? 'observed_present';
  const coverageState = options.coverageState
    ?? (observationState === 'observed_present' || observationState === 'observed_absent' ? 'complete' : 'unknown');
  const observed = ['observed_present', 'observed_absent', 'contradicted'].includes(observationState);
  const raw = {
    schemaVersion: 'ffcc.usr.witness-observation.v0.1.0' as const,
    observationId: `usr_obs_${idSeed}`,
    situationId: definition.situationId,
    witnessId: witness.witnessId,
    observedAt: options.observedAt === undefined ? (observed ? '2026-09-16T13:00:00Z' : null) : options.observedAt,
    knownAt: options.knownAt ?? '2026-09-16T13:05:00Z',
    recordedAt: '2026-09-16T13:06:00Z',
    windowState: options.windowState ?? (observed ? 'closed' as const : 'unknown' as const),
    observationState,
    coverageState,
    sourceRequirementRef: options.sourceRequirementRef ?? witness.sourceRequirementRef,
    metricDefinitionRef: witness.metricDefinitionRef,
    basisRefs: observed ? [fixtureRef(`basis:${idSeed}`)] : [],
    coverageRefs: coverageState === 'complete' ? [fixtureRef(`coverage:${idSeed}`)] : [],
    contradictionRefs: observationState === 'contradicted' ? [fixtureRef(`contradiction:${idSeed}`)] : [],
    windowInstanceId: options.windowInstanceId ?? (observed ? `window:${idSeed}` : null),
    comparisonKey: options.comparisonKey ?? 'synthetic-comparable',
    contextKey: options.contextKey ?? 'synthetic-context-a',
  };
  return WitnessObservationV0Schema.parse(withUsrDigest(raw as unknown as Record<string, unknown>));
}

export function makeScenarioBinding(
  definition: SituationDefinitionV0,
  seed: string,
  status: ScenarioBranchBindingV0['probabilityBinding']['status'] = 'QUALITATIVE_ONLY',
): ScenarioBranchBindingV0 {
  const idSeed = safeId(seed);
  const calibrated = status === 'CALIBRATED';
  const probability = calibrated ? 1 / definition.competingStates.length : null;
  const raw = {
    schemaVersion: 'ffcc.usr.scenario-branch-binding.v0.1.0' as const,
    bindingId: `usr_branch_${idSeed}`,
    situationId: definition.situationId,
    definitionRef: { schemaVersion: definition.schemaVersion, recordId: definition.recordId, recordDigest: definition.recordDigest },
    asOf: '2026-09-16T14:00:00Z',
    stateSetCompleteness: definition.stateSetCompleteness,
    branches: definition.competingStates.map((state) => ({
      stateId: state.stateId,
      scenarioKey: state.consequences.scenarioKeys[0],
      affectedPlayerIds: definition.identity.playerIds,
      affectedTeamVariables: definition.impactDefinition.affectedTeamVariables,
      forecastScenarioRef: null,
      stateProbability: probability,
    })),
    probabilityBinding: {
      status,
      producerRef: calibrated ? fixtureRef(`producer:${idSeed}`) : null,
      calibrationRef: calibrated ? fixtureRef(`calibration:${idSeed}`) : null,
      horizonRef: calibrated ? fixtureRef(`horizon:${idSeed}`) : null,
    },
  };
  return ScenarioBranchBindingV0Schema.parse(withUsrDigest(raw as unknown as Record<string, unknown>));
}

export function makeOverlay(definition: SituationDefinitionV0, seed: string): OperatorSituationOverlayV0 {
  const idSeed = safeId(seed);
  return OperatorSituationOverlayV0Schema.parse(withUsrDigest({
    schemaVersion: 'ffcc.usr.operator-overlay.v0.1.0',
    overlayId: `usr_overlay_${idSeed}`,
    situationId: definition.situationId,
    leagueContextRef: fixtureRef(`league:${idSeed}`),
    rosterContextRef: fixtureRef(`roster:${idSeed}`),
    scoringProfileRef: fixtureRef(`scoring:${idSeed}`),
    asOf: '2026-09-16T14:00:00Z',
    rosteredAffectedPlayerIds: [definition.identity.playerIds[0]],
    availableAffectedPlayerIds: definition.identity.playerIds.slice(1),
    decisionSurfaceRefs: [fixtureRef(`decision:${idSeed}`)],
    nextDecisionBoundary: '2026-09-17T00:00:00Z',
    operatorPosture: 'balanced',
    linkedHypothesisRefs: [], linkedDecisionRefs: [],
    actionTiming: 'WAIT_FOR_SPECIFIC_EVIDENCE',
    requiredEvidenceBeforeAction: [definition.resolutionWitnesses[0].witnessId],
  }));
}

export type Usr0GoldenTraceV0 = {
  id: string;
  purpose: string;
  definition: SituationDefinitionV0;
  observations: WitnessObservationV0[];
  scenarioBinding?: ScenarioBranchBindingV0;
  overlay?: OperatorSituationOverlayV0;
  conservation?: { constraint: OpportunityConservationConstraintV0; allocation: OpportunityAllocationV0 };
  expectedInvariant: string;
};

const defs = {
  t01: makeDefinition('trace01', { stateCount: 3, witnessCount: 2, persistenceClass: 'medium' }),
  t02: makeDefinition('trace02', { persistenceClass: 'medium' }),
  t03: makeDefinition('trace03', { stateCount: 3, persistenceClass: 'fast', primaryClass: 'STARTER_IDENTITY', coverageRequirements: ['DIRECT_AUTHORITATIVE'] }),
  t04: makeDefinition('trace04', { persistenceClass: 'medium', witnessCount: 2, witnessLeads: [0, 1] }),
  t05: makeDefinition('trace05', { persistenceClass: 'slow', primaryClass: 'OFFENSIVE_REGIME', witnessWindows: ['MULTI_GAME'] }),
  t06: makeDefinition('trace06', { persistenceClass: 'medium', primaryClass: 'RETURN_FROM_ABSENCE', witnessCount: 2 }),
  t07: makeDefinition('trace07', { persistenceClass: 'medium' }),
  t08: makeDefinition('trace08', { stateSetCompleteness: 'partial', stateCount: 3 }),
  t09: makeDefinition('trace09', { persistenceClass: 'medium' }),
  t10: makeDefinition('trace10', { persistenceClass: 'fast', primaryClass: 'STARTER_IDENTITY', coverageRequirements: ['DIRECT_AUTHORITATIVE'] }),
  t11: makeDefinition('trace11', { persistenceClass: 'medium' }),
  t12: makeDefinition('trace12', { persistenceClass: 'medium', primaryClass: 'RETURN_FROM_ABSENCE' }),
  t13: makeDefinition('trace13', { persistenceClass: 'medium' }),
  t14: makeDefinition('trace14', { stateCount: 3, persistenceClass: 'medium' }),
  t15: makeDefinition('trace15', { persistenceClass: 'medium' }),
};

const conservationConstraint = OpportunityConservationConstraintV0Schema.parse({
  constraintId: 'constraint:backfield_share', resourceKey: 'backfield_opportunity_share',
  participantPlayerIds: defs.t14.identity.playerIds, capacity: 1, mode: 'SUM_EQ', tolerance: 0.000001,
});
const conservationAllocation = OpportunityAllocationV0Schema.parse({
  constraintId: conservationConstraint.constraintId,
  allocations: defs.t14.identity.playerIds.map((id) => ({ playerId: id, value: 0.5 })),
});
const baseBadBinding = makeScenarioBinding(defs.t15, 'trace15bad', 'QUALITATIVE_ONLY');
const qualitativeProbabilityBinding = ScenarioBranchBindingV0Schema.parse(withUsrDigest({
  ...baseBadBinding,
  branches: baseBadBinding.branches.map((branch, index) => ({ ...branch, stateProbability: index === 0 ? 0.5 : null })),
  recordDigest: undefined,
}));

export const USR0_GOLDEN_TRACES: readonly Usr0GoldenTraceV0[] = [
  { id: 'USR0-T01-three-back-partial-resolution', purpose: 'Resolve one role while another load-bearing role remains unknown.', definition: defs.t01, observations: [makeObservation(defs.t01, 'witness:w1', 't01g1', { windowInstanceId: 'game:1' }), makeObservation(defs.t01, 'witness:w1', 't01g2', { windowInstanceId: 'game:2' }), makeObservation(defs.t01, 'witness:w2', 't01tm', { observationState: 'unavailable', coverageState: 'unknown', windowState: 'unknown' })], expectedInvariant: 'PARTIALLY_RESOLVED' },
  { id: 'USR0-T02-workload-management-no-probability', purpose: 'Qualitative workload branch without calibrated state probabilities.', definition: defs.t02, observations: [makeObservation(defs.t02, 'witness:w1', 't02g1')], scenarioBinding: makeScenarioBinding(defs.t02, 'trace02', 'QUALITATIVE_ONLY'), expectedInvariant: 'No numeric probability' },
  { id: 'USR0-T03-qb-cascade-joint-branches', purpose: 'QB state branches all affected players jointly.', definition: defs.t03, observations: [makeObservation(defs.t03, 'witness:w1', 't03status')], scenarioBinding: makeScenarioBinding(defs.t03, 'trace03', 'QUALITATIVE_ONLY'), expectedInvariant: 'Joint branches' },
  { id: 'USR0-T04-route-target-hierarchy-conflict', purpose: 'Conflicting route/target hierarchy evidence.', definition: defs.t04, observations: [makeObservation(defs.t04, 'witness:w1', 't04routes'), makeObservation(defs.t04, 'witness:w2', 't04targets')], expectedInvariant: 'CONTESTED' },
  { id: 'USR0-T05-one-game-regime-not-resolved', purpose: 'One game never resolves a slow regime.', definition: defs.t05, observations: [makeObservation(defs.t05, 'witness:w1', 't05game1', { windowInstanceId: 'game:1', contextKey: 'opponent:a' })], expectedInvariant: 'UNRESOLVED' },
  { id: 'USR0-T06-returning-player-reopen', purpose: 'Returning player may materially reopen.', definition: defs.t06, observations: [makeObservation(defs.t06, 'witness:w1', 't06return')], expectedInvariant: 'Append-only reopen' },
  { id: 'USR0-T07-source-conflict-preserved', purpose: 'Source contradiction is preserved.', definition: defs.t07, observations: [makeObservation(defs.t07, 'witness:w1', 't07conflict', { observationState: 'contradicted' })], expectedInvariant: 'CONTESTED' },
  { id: 'USR0-T08-incomplete-state-set-no-mixture', purpose: 'Partial state set cannot be calibrated mixture.', definition: defs.t08, observations: [], scenarioBinding: makeScenarioBinding(defs.t08, 'trace08', 'CALIBRATED'), expectedInvariant: 'Reject calibrated mixture' },
  { id: 'USR0-T09-operator-overlay-does-not-mutate-shared', purpose: 'Operator urgency stays separate.', definition: defs.t09, observations: [makeObservation(defs.t09, 'witness:w1', 't09game1')], overlay: makeOverlay(defs.t09, 'trace09'), expectedInvariant: 'Shared truth unchanged' },
  { id: 'USR0-T10-point-in-time-future-witness-rejected', purpose: 'Future-known evidence is ineligible.', definition: defs.t10, observations: [makeObservation(defs.t10, 'witness:w1', 't10future', { knownAt: '2026-09-18T13:05:00Z' })], expectedInvariant: 'Future leakage rejected' },
  { id: 'USR0-T11-correction-preserves-prior-belief', purpose: 'Corrections append rather than rewrite.', definition: defs.t11, observations: [makeObservation(defs.t11, 'witness:w1', 't11orig')], expectedInvariant: 'Prior digest immutable' },
  { id: 'USR0-T12-valid-material-reopen', purpose: 'Only material causes reopen.', definition: defs.t12, observations: [makeObservation(defs.t12, 'witness:w1', 't12base')], expectedInvariant: 'No noise-driven reopen' },
  { id: 'USR0-T13-observed-absence-needs-complete-window', purpose: 'Absence needs closed complete coverage.', definition: defs.t13, observations: [makeObservation(defs.t13, 'witness:w1', 't13absent', { observationState: 'observed_absent', windowState: 'open', coverageState: 'incomplete' })], expectedInvariant: 'Indeterminate absence' },
  { id: 'USR0-T14-conservation-constraint-rejection', purpose: 'Impossible simultaneous role shares fail.', definition: defs.t14, observations: [], conservation: { constraint: conservationConstraint, allocation: conservationAllocation }, expectedInvariant: 'Capacity violation rejected' },
  { id: 'USR0-T15-qualitative-support-cannot-be-probability', purpose: 'Qualitative support is not probability.', definition: defs.t15, observations: [], scenarioBinding: qualitativeProbabilityBinding, expectedInvariant: 'Numeric qualitative probability rejected' },
] as const;

export const USR0_GOLDEN_TRACE_IDS = USR0_GOLDEN_TRACES.map((trace) => trace.id);
