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

export function fixtureRef(id: string): GovernedRefV0 {
  return {
    refType: 'governed',
    namespace: 'fixture.usr0',
    id,
    version: 'v0',
    digest: null,
  };
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
  const stateCount = options.stateCount ?? 2;
  const witnessCount = options.witnessCount ?? 1;
  const players = stateCount === 3
    ? [FIXTURE_PLAYER_A, FIXTURE_PLAYER_B, FIXTURE_PLAYER_C]
    : [FIXTURE_PLAYER_A, FIXTURE_PLAYER_B];
  const states = players.slice(0, stateCount).map((id, index) => ({
    stateId: `state:s${index + 1}`,
    label: `Synthetic state ${index + 1}`,
    description: `Synthetic competing state ${index + 1} for ${seed}.`,
    mechanism: `Synthetic mechanism ${index + 1}.`,
    requiredConditions: [`condition:${index + 1}`],
    expectedObservables: [`observable:${index + 1}`],
    disconfirmingObservables: [`disconfirm:${index + 1}`],
    supportPolicy: { supportScale: 'categorical_v0' as const },
    consequences: {
      playerRoleChanges: [{
        playerId: id,
        roleKey: 'synthetic_role_share',
        effect: 'increase' as const,
        detail: 'Synthetic fixture only.',
      }],
      teamEnvironmentChanges: [],
      scenarioKeys: [`scenario:${seed}:${index + 1}`],
    },
  }));

  const persistenceClass = options.persistenceClass ?? 'medium';
  const defaultWindow = persistenceClass === 'fast' ? 'PRE_LOCK' : persistenceClass === 'slow' ? 'MULTI_GAME' : 'NEXT_GAME';
  const witnesses = Array.from({ length: witnessCount }, (_, witnessIndex) => {
    const leadIndex = options.witnessLeads?.[witnessIndex] ?? 0;
    return {
      witnessId: `witness:w${witnessIndex + 1}`,
      question: `Synthetic witness ${witnessIndex + 1} for ${seed}?`,
      entityRefs: players,
      domain: witnessIndex === 0 ? 'early_down' as const : witnessIndex === 1 ? 'two_minute' as const : 'inside_five' as const,
      sourceRequirementRef: fixtureRef(`source:${seed}:${witnessIndex + 1}`),
      metricDefinitionRef: fixtureRef(`metric:${seed}:${witnessIndex + 1}`),
      window: options.witnessWindows?.[witnessIndex] ?? defaultWindow,
      coverageRequirement: options.coverageRequirements?.[witnessIndex] ?? 'PARTIAL_ALLOWED' as const,
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
    situationId: `usr_sit_${seed}`,
    recordId: `usr_def_${seed}`,
    versionOrdinal: 1,
    season: 2026,
    createdAt: '2026-09-16T12:00:00Z',
    knownAt: '2026-09-16T12:00:00Z',
    identity: {
      primaryTeamRef: fixtureRef(`team:${seed}`),
      relatedTeamRefs: [],
      playerIds: players,
      positionGroup: options.primaryClass === 'STARTER_IDENTITY' ? 'QB' as const : 'RB' as const,
      gameRefs: [fixtureRef(`game:${seed}`)],
    },
    classification: {
      primaryClass: options.primaryClass ?? 'ROLE_ALLOCATION' as const,
      secondaryClasses: [],
      scope: options.scope ?? (stateCount === 3 ? 'multi_entity' as const : 'position_group' as const),
      persistenceClass,
    },
    question: `What is the unresolved synthetic football state for ${seed}?`,
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
  const witness = definition.resolutionWitnesses.find((candidate) => candidate.witnessId === witnessId);
  if (!witness) throw new Error(`fixture witness not found: ${witnessId}`);
  const observationState = options.observationState ?? 'observed_present';
  const coverageState = options.coverageState
    ?? (observationState === 'observed_present' || observationState === 'observed_absent' ? 'complete' : 'unknown');
  const observed = observationState === 'observed_present' || observationState === 'observed_absent' || observationState === 'contradicted';
  const raw = {
    schemaVersion: 'ffcc.usr.witness-observation.v0.1.0' as const,
    observationId: `usr_obs_${seed}`,
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
    basisRefs: observed ? [fixtureRef(`basis:${seed}`)] : [],
    coverageRefs: coverageState === 'complete' ? [fixtureRef(`coverage:${seed}`)] : [],
    contradictionRefs: observationState === 'contradicted' ? [fixtureRef(`contradiction:${seed}`)] : [],
    windowInstanceId: options.windowInstanceId ?? (observed ? `window:${seed}` : null),
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
  const calibrated = status === 'CALIBRATED';
  const probability = calibrated ? 1 / definition.competingStates.length : null;
  const raw = {
    schemaVersion: 'ffcc.usr.scenario-branch-binding.v0.1.0' as const,
    bindingId: `usr_branch_${seed}`,
    situationId: definition.situationId,
    definitionRef: {
      schemaVersion: definition.schemaVersion,
      recordId: definition.recordId,
      recordDigest: definition.recordDigest,
    },
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
      producerRef: calibrated ? fixtureRef(`producer:${seed}`) : null,
      calibrationRef: calibrated ? fixtureRef(`calibration:${seed}`) : null,
      horizonRef: calibrated ? fixtureRef(`horizon:${seed}`) : null,
    },
  };
  return ScenarioBranchBindingV0Schema.parse(withUsrDigest(raw as unknown as Record<string, unknown>));
}

export function makeOverlay(definition: SituationDefinitionV0, seed: string): OperatorSituationOverlayV0 {
  const raw = {
    schemaVersion: 'ffcc.usr.operator-overlay.v0.1.0' as const,
    overlayId: `usr_overlay_${seed}`,
    situationId: definition.situationId,
    leagueContextRef: fixtureRef(`league:${seed}`),
    rosterContextRef: fixtureRef(`roster:${seed}`),
    scoringProfileRef: fixtureRef(`scoring:${seed}`),
    asOf: '2026-09-16T14:00:00Z',
    rosteredAffectedPlayerIds: [definition.identity.playerIds[0]],
    availableAffectedPlayerIds: definition.identity.playerIds.slice(1),
    decisionSurfaceRefs: [fixtureRef(`decision:${seed}`)],
    nextDecisionBoundary: '2026-09-17T00:00:00Z',
    operatorPosture: 'balanced' as const,
    linkedHypothesisRefs: [],
    linkedDecisionRefs: [],
    actionTiming: 'WAIT_FOR_SPECIFIC_EVIDENCE' as const,
    requiredEvidenceBeforeAction: [definition.resolutionWitnesses[0].witnessId],
  };
  return OperatorSituationOverlayV0Schema.parse(withUsrDigest(raw as unknown as Record<string, unknown>));
}

export type Usr0GoldenTraceV0 = {
  id: string;
  purpose: string;
  definition: SituationDefinitionV0;
  observations: WitnessObservationV0[];
  scenarioBinding?: ScenarioBranchBindingV0;
  overlay?: OperatorSituationOverlayV0;
  conservation?: {
    constraint: OpportunityConservationConstraintV0;
    allocation: OpportunityAllocationV0;
  };
  expectedInvariant: string;
};

const t01 = makeDefinition('trace01', { stateCount: 3, witnessCount: 2, persistenceClass: 'medium' });
const t02 = makeDefinition('trace02', { persistenceClass: 'medium', witnessCount: 1 });
const t03 = makeDefinition('trace03', { stateCount: 3, persistenceClass: 'fast', primaryClass: 'STARTER_IDENTITY', coverageRequirements: ['DIRECT_AUTHORITATIVE'] });
const t04 = makeDefinition('trace04', { persistenceClass: 'medium', witnessCount: 2, witnessLeads: [0, 1] });
const t05 = makeDefinition('trace05', { persistenceClass: 'slow', primaryClass: 'OFFENSIVE_REGIME', witnessCount: 1, witnessWindows: ['MULTI_GAME'] });
const t06 = makeDefinition('trace06', { persistenceClass: 'medium', primaryClass: 'RETURN_FROM_ABSENCE', witnessCount: 2 });
const t07 = makeDefinition('trace07', { persistenceClass: 'medium', witnessCount: 1 });
const t08 = makeDefinition('trace08', { stateSetCompleteness: 'partial', stateCount: 3 });
const t09 = makeDefinition('trace09', { persistenceClass: 'medium' });
const t10 = makeDefinition('trace10', { persistenceClass: 'fast', primaryClass: 'STARTER_IDENTITY', coverageRequirements: ['DIRECT_AUTHORITATIVE'] });
const t11 = makeDefinition('trace11', { persistenceClass: 'medium' });
const t12 = makeDefinition('trace12', { persistenceClass: 'medium', primaryClass: 'RETURN_FROM_ABSENCE' });
const t13 = makeDefinition('trace13', { persistenceClass: 'medium' });
const t14 = makeDefinition('trace14', { stateCount: 3, persistenceClass: 'medium' });
const t15 = makeDefinition('trace15', { persistenceClass: 'medium' });

const trace14Constraint = OpportunityConservationConstraintV0Schema.parse({
  constraintId: 'constraint:backfield_share',
  resourceKey: 'backfield_opportunity_share',
  participantPlayerIds: t14.identity.playerIds,
  capacity: 1,
  mode: 'SUM_EQ',
  tolerance: 0.000001,
});
const trace14Allocation = OpportunityAllocationV0Schema.parse({
  constraintId: trace14Constraint.constraintId,
  allocations: t14.identity.playerIds.map((id) => ({ playerId: id, value: 0.5 })),
});

const trace15BadBinding = makeScenarioBinding(t15, 'trace15bad', 'QUALITATIVE_ONLY');
trace15BadBinding.branches[0].stateProbability = 0.5;

export const USR0_GOLDEN_TRACES: readonly Usr0GoldenTraceV0[] = [
  {
    id: 'USR0-T01-three-back-partial-resolution',
    purpose: 'Repeated early-down evidence may resolve one role while a second load-bearing role remains unknown.',
    definition: t01,
    observations: [
      makeObservation(t01, 'witness:w1', 't01g1', { windowInstanceId: 'game:1', contextKey: 'neutral-script' }),
      makeObservation(t01, 'witness:w1', 't01g2', { windowInstanceId: 'game:2', contextKey: 'neutral-script' }),
      makeObservation(t01, 'witness:w2', 't01tm', { observationState: 'unavailable', coverageState: 'unknown', windowState: 'unknown' }),
    ],
    expectedInvariant: 'PARTIALLY_RESOLVED, never full resolution while the second load-bearing role is unavailable.',
  },
  {
    id: 'USR0-T02-workload-management-no-probability',
    purpose: 'A workload-management branch remains qualitative when no calibrated state producer exists.',
    definition: t02,
    observations: [makeObservation(t02, 'witness:w1', 't02g1')],
    scenarioBinding: makeScenarioBinding(t02, 't02', 'QUALITATIVE_ONLY'),
    expectedInvariant: 'No numeric state probability exists or is inferred from support labels.',
  },
  {
    id: 'USR0-T03-qb-cascade-joint-branches',
    purpose: 'One quarterback state branches all affected teammates together rather than independently.',
    definition: t03,
    observations: [makeObservation(t03, 'witness:w1', 't03status')],
    scenarioBinding: makeScenarioBinding(t03, 't03', 'QUALITATIVE_ONLY'),
    expectedInvariant: 'All declared states are represented jointly in one branch binding.',
  },
  {
    id: 'USR0-T04-route-target-hierarchy-conflict',
    purpose: 'Route and target evidence can point to different receiving hierarchies without forced certainty.',
    definition: t04,
    observations: [
      makeObservation(t04, 'witness:w1', 't04routes'),
      makeObservation(t04, 'witness:w2', 't04targets'),
    ],
    expectedInvariant: 'Conflicting load-bearing witness effects remain contested.',
  },
  {
    id: 'USR0-T05-one-game-regime-not-resolved',
    purpose: 'One game can support a regime hypothesis but cannot resolve a slow-persistence question.',
    definition: t05,
    observations: [makeObservation(t05, 'witness:w1', 't05g1', { windowInstanceId: 'game:1', contextKey: 'opponent:a' })],
    expectedInvariant: 'Slow persistence remains UNRESOLVED after one game.',
  },
  {
    id: 'USR0-T06-returning-player-reopen',
    purpose: 'A returning player is an allowed material cause for reopening a previously resolved role state.',
    definition: t06,
    observations: [makeObservation(t06, 'witness:w1', 't06return')],
    expectedInvariant: 'Reopening is append-only and requires an allowed material cause.',
  },
  {
    id: 'USR0-T07-source-conflict-preserved',
    purpose: 'Contradicted source evidence remains conflict rather than being averaged away.',
    definition: t07,
    observations: [makeObservation(t07, 'witness:w1', 't07conflict', { observationState: 'contradicted' })],
    expectedInvariant: 'Contradicted source evidence cannot produce a resolved state.',
  },
  {
    id: 'USR0-T08-incomplete-state-set-no-mixture',
    purpose: 'A partial state set cannot carry a calibrated probability mixture.',
    definition: t08,
    observations: [],
    scenarioBinding: makeScenarioBinding(t08, 't08', 'CALIBRATED'),
    expectedInvariant: 'Scenario validation rejects calibrated mixing for a non-exhaustive state set.',
  },
  {
    id: 'USR0-T09-operator-overlay-does-not-mutate-shared',
    purpose: 'Operator exposure changes decision timing only, never shared football-state support.',
    definition: t09,
    observations: [makeObservation(t09, 'witness:w1', 't09g1')],
    overlay: makeOverlay(t09, 't09'),
    expectedInvariant: 'Overlay contains no field capable of rewriting shared support or resolution.',
  },
  {
    id: 'USR0-T10-point-in-time-future-witness-rejected',
    purpose: 'Evidence known after the decision cutoff cannot alter the frozen historical state.',
    definition: t10,
    observations: [makeObservation(t10, 'witness:w1', 't10future', { knownAt: '2026-09-18T13:05:00Z' })],
    expectedInvariant: 'Future-known evidence is ineligible at an earlier as-of boundary.',
  },
  {
    id: 'USR0-T11-correction-preserves-prior-belief',
    purpose: 'A source correction appends a new evaluation/correction receipt rather than rewriting history.',
    definition: t11,
    observations: [makeObservation(t11, 'witness:w1', 't11original')],
    expectedInvariant: 'Prior evaluation digest remains immutable after correction.',
  },
  {
    id: 'USR0-T12-valid-material-reopen',
    purpose: 'Injury, transaction, coaching change, role reversal, return, repeated deployment change, or source correction may reopen.',
    definition: t12,
    observations: [makeObservation(t12, 'witness:w1', 't12base')],
    expectedInvariant: 'Routine one-game noise is not a valid reopen cause.',
  },
  {
    id: 'USR0-T13-observed-absence-needs-complete-window',
    purpose: 'Missing/unobserved/unavailable is never silently converted to an observed zero.',
    definition: t13,
    observations: [makeObservation(t13, 'witness:w1', 't13absent', {
      observationState: 'observed_absent',
      windowState: 'open',
      coverageState: 'incomplete',
    })],
    expectedInvariant: 'Open/incomplete observed absence remains indeterminate.',
  },
  {
    id: 'USR0-T14-conservation-constraint-rejection',
    purpose: 'Competing-player scenario allocations cannot exceed the conserved opportunity resource.',
    definition: t14,
    observations: [],
    conservation: { constraint: trace14Constraint, allocation: trace14Allocation },
    expectedInvariant: 'Three 0.5 shares cannot coexist under a capacity-one SUM_EQ constraint.',
  },
  {
    id: 'USR0-T15-qualitative-support-cannot-be-probability',
    purpose: 'Qualitative state support cannot be serialized as a numeric state probability.',
    definition: t15,
    observations: [],
    scenarioBinding: trace15BadBinding,
    expectedInvariant: 'Scenario validation rejects numeric probability under QUALITATIVE_ONLY.',
  },
] as const;

export const USR0_GOLDEN_TRACE_IDS = USR0_GOLDEN_TRACES.map((trace) => trace.id);
