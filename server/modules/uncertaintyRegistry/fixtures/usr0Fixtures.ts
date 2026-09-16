import {
  OperatorSituationOverlayV0Schema,
  ScenarioBranchBindingV0Schema,
  SituationDefinitionV0Schema,
  type GovernedRefV0,
  type OperatorSituationOverlayV0,
  type ScenarioBranchBindingV0,
  type SituationDefinitionV0,
  type WitnessObservationV0,
} from '../contracts';
import { digestUsrValue, withUsrRecordDigest } from '../canonicalization';
import { definitionRecordRefV0 } from '../conformance';

export const FIXTURE_PLAYERS = {
  alpha: 'tbr_p_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  beta: 'tbr_p_01ARZ3NDEKTSV4RRFFQ69G5FAW',
  gamma: 'tbr_p_01ARZ3NDEKTSV4RRFFQ69G5FAX',
} as const;

const T0 = '2026-09-16T12:00:00.000Z';
const T1 = '2026-09-16T13:00:00.000Z';
const T2 = '2026-09-17T13:00:00.000Z';
const T3 = '2026-09-24T13:00:00.000Z';

export function fixtureRef(id: string, schemaId = 'fixture.ref.v0'): GovernedRefV0 {
  return {
    kind: 'governed_ref',
    namespace: 'ffcc.synthetic',
    schemaId,
    objectId: id,
    version: 'v1',
    digest: digestUsrValue({ id, schemaId, version: 'v1' }),
  };
}

function state(stateId: string, playerId: string, direction: 'LEAD' | 'COMMITTEE' | 'LIMITED' = 'LEAD') {
  return {
    stateId,
    label: stateId.replace(/_/g, ' '),
    description: `Synthetic state ${stateId}`,
    mechanism: `Synthetic mechanism for ${stateId}`,
    requiredConditions: [`condition:${stateId}`],
    expectedObservables: [`observable:${stateId}`],
    disconfirmingObservables: [`disconfirm:${stateId}`],
    supportPolicy: { supportScale: 'categorical_v0' as const },
    consequences: {
      playerRoleChanges: [{ playerId, roleKey: 'synthetic_role', direction, note: null }],
      teamEnvironmentChanges: [],
      scenarioKeys: [`scenario:${stateId}`],
    },
  };
}

function witness(
  witnessId: string,
  stateIds: string[],
  options: Partial<{
    domain: 'starter_status' | 'game_status' | 'practice' | 'snap_share' | 'route_share' | 'target_share' | 'first_read_share' | 'carry_share' | 'early_down' | 'third_down' | 'two_minute' | 'short_yardage' | 'inside_five' | 'pass_protection' | 'personnel_usage' | 'scheme_tendency' | 'transaction' | 'team_environment' | 'other_typed';
    resolutionUse: 'DIRECT_AUTHORITATIVE' | 'DEPLOYMENT' | 'CONTEXTUAL';
    window: 'PRE_LOCK' | 'SAME_DAY' | 'NEXT_PRACTICE_CYCLE' | 'NEXT_GAME' | 'ONE_TO_TWO_GAMES' | 'MULTI_GAME' | 'OPEN';
    materiality: 'LOAD_BEARING' | 'HIGH' | 'MEDIUM' | 'LOW';
    requiredForResolution: boolean;
    comparabilityKey: string | null;
    sourceId: string;
    strong: boolean;
    absenceSemantics: 'NOT_EVIDENCE' | 'OBSERVABLE_ZERO_ONLY_WITH_COMPLETE_WINDOW';
  }> = {},
) {
  const leading = stateIds[0];
  return {
    witnessId,
    question: `Synthetic witness ${witnessId}`,
    entityRefs: ['fixture:entity:1'],
    domain: options.domain ?? 'carry_share',
    resolutionUse: options.resolutionUse ?? 'DEPLOYMENT',
    sourceRequirementRef: fixtureRef(options.sourceId ?? `source:${witnessId}`, 'fixture.source.v0'),
    metricDefinitionRef: fixtureRef(`metric:${witnessId}`, 'fixture.metric.v0'),
    window: options.window ?? 'NEXT_GAME',
    coverageRequirement: 'COMPLETE_REQUIRED' as const,
    materiality: options.materiality ?? 'LOAD_BEARING',
    requiredForResolution: options.requiredForResolution ?? true,
    comparabilityKey: options.comparabilityKey === undefined ? 'synthetic-role-comparable' : options.comparabilityKey,
    stateEffects: stateIds.map((stateId) => ({
      stateId,
      observedPresent: stateId === leading
        ? (options.strong === false ? 'supports' as const : 'strongly_supports' as const)
        : 'refutes' as const,
      observedAbsent: stateId === leading ? 'refutes' as const : 'supports' as const,
    })),
    absenceSemantics: options.absenceSemantics ?? 'OBSERVABLE_ZERO_ONLY_WITH_COMPLETE_WINDOW',
  };
}

type DefinitionOptions = {
  id: string;
  persistence?: 'fast' | 'medium' | 'slow';
  blast?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  states?: ReturnType<typeof state>[];
  witnesses?: ReturnType<typeof witness>[];
  completeness?: 'exhaustive' | 'partial' | 'unknown';
  players?: string[];
  primaryClass?: 'ROLE_ALLOCATION' | 'AVAILABILITY_READINESS' | 'STARTER_IDENTITY' | 'TARGET_HIERARCHY' | 'PERSONNEL_INTEGRATION' | 'OFFENSIVE_REGIME' | 'SCHEME_USAGE' | 'TEAM_ENVIRONMENT' | 'DEPTH_CHART_TRANSITION' | 'RETURN_FROM_ABSENCE' | 'TRANSACTION_CONTINGENCY';
};

export function makeDefinition(options: DefinitionOptions): SituationDefinitionV0 {
  const players = options.players ?? [FIXTURE_PLAYERS.alpha, FIXTURE_PLAYERS.beta];
  const states = options.states ?? [state('state_a', players[0]), state('state_b', players[1] ?? players[0], 'COMMITTEE')];
  const witnesses = options.witnesses ?? [witness('role_deployment', states.map((entry) => entry.stateId))];
  const base = {
    schemaVersion: 'ffcc.usr.situation-definition.v0.1.0' as const,
    situationId: `usr_sit_${options.id}`,
    versionOrdinal: 1,
    season: 2026,
    createdAt: T0,
    knownAt: T0,
    identity: {
      primaryTeamRef: fixtureRef(`team:${options.id}`, 'fixture.team.v0'),
      relatedTeamRefs: [],
      playerIds: players,
      positionGroup: 'RB' as const,
      gameRefs: [],
    },
    classification: {
      primaryClass: options.primaryClass ?? 'ROLE_ALLOCATION' as const,
      secondaryClasses: [],
      scope: players.length > 1 ? 'multi_entity' as const : 'player' as const,
      persistenceClass: options.persistence ?? 'medium' as const,
    },
    question: `Synthetic uncertainty question ${options.id}`,
    stateSetCompleteness: options.completeness ?? 'exhaustive' as const,
    competingStates: states,
    resolutionWitnesses: witnesses,
    impactDefinition: {
      affectedPlayerIds: players,
      affectedTeamVariables: ['role_allocation'],
      affectedDecisionSurfaces: ['LINEUP', 'WAIVER'] as const,
      blastRadius: options.blast ?? 'HIGH' as const,
    },
    policyRefs: {
      resolutionPolicyRef: fixtureRef('policy:resolution', 'fixture.policy.v0'),
      attentionPolicyRef: fixtureRef('policy:attention', 'fixture.policy.v0'),
      evidenceEligibilityPolicyRef: fixtureRef('policy:eligibility', 'fixture.policy.v0'),
      canonicalizationProfile: 'ffcc.usr.digest/jcs-sha256-v0' as const,
    },
    predecessorDefinitionRef: null,
    warnings: [],
  };
  return SituationDefinitionV0Schema.parse(withUsrRecordDigest(base));
}

export function observation(
  definition: SituationDefinitionV0,
  witnessId: string,
  options: Partial<{
    observationId: string;
    windowId: string;
    contextKey: string | null;
    knownAt: string;
    observedAt: string | null;
    windowState: 'OPEN' | 'CLOSED' | 'UNKNOWN';
    observationState: 'UNOBSERVED' | 'OBSERVED_PRESENT' | 'OBSERVED_ABSENT' | 'UNAVAILABLE' | 'CONTRADICTED';
    coverageState: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';
    sourceRequirementRef: GovernedRefV0;
  }> = {},
): WitnessObservationV0 {
  const witnessDefinition = definition.resolutionWitnesses.find((candidate) => candidate.witnessId === witnessId);
  if (!witnessDefinition) throw new Error(`fixture witness missing: ${witnessId}`);
  const knownAt = options.knownAt ?? T1;
  return {
    observationId: options.observationId ?? `${witnessId}:${options.windowId ?? 'w1'}`,
    witnessId,
    windowId: options.windowId ?? 'w1',
    contextKey: options.contextKey === undefined ? 'neutral' : options.contextKey,
    sourceRequirementRef: options.sourceRequirementRef ?? witnessDefinition.sourceRequirementRef,
    observedAt: options.observedAt === undefined ? knownAt : options.observedAt,
    knownAt,
    windowState: options.windowState ?? 'CLOSED',
    observationState: options.observationState ?? 'OBSERVED_PRESENT',
    coverageState: options.coverageState ?? 'COMPLETE',
    evidenceRefs: ['UNOBSERVED', 'UNAVAILABLE'].includes(options.observationState ?? 'OBSERVED_PRESENT')
      ? []
      : [fixtureRef(`evidence:${witnessId}:${options.windowId ?? 'w1'}`, 'fixture.evidence.v0')],
  };
}

export function makeScenarioBinding(
  definition: SituationDefinitionV0,
  options: Partial<{ calibrated: boolean; completeness: 'exhaustive' | 'partial' | 'unknown'; omitLastState: boolean }> = {},
): ScenarioBranchBindingV0 {
  const branches = (options.omitLastState ? definition.competingStates.slice(0, -1) : definition.competingStates).map((stateRow) => ({
    stateId: stateRow.stateId,
    scenarioKey: stateRow.consequences.scenarioKeys[0],
    affectedPlayerIds: definition.identity.playerIds,
    affectedTeamVariables: definition.impactDefinition.affectedTeamVariables,
    forecastScenarioRef: fixtureRef(`forecast:${stateRow.stateId}`, 'fixture.forecast-scenario.v0'),
  }));
  const calibrated = options.calibrated ?? false;
  return ScenarioBranchBindingV0Schema.parse(withUsrRecordDigest({
    schemaVersion: 'ffcc.usr.scenario-branch-binding.v0.1.0' as const,
    bindingId: `usr_scn_${definition.situationId.replace('usr_sit_', '')}`,
    situationId: definition.situationId,
    definitionRef: definitionRecordRefV0(definition),
    asOf: T1,
    stateSetCompleteness: options.completeness ?? definition.stateSetCompleteness,
    branches,
    probabilityBinding: calibrated ? {
      status: 'CALIBRATED' as const,
      producerRef: fixtureRef('probability-producer', 'fixture.producer.v0'),
      calibrationRef: fixtureRef('probability-calibration', 'fixture.calibration.v0'),
      horizonRef: fixtureRef('probability-horizon', 'fixture.horizon.v0'),
    } : {
      status: 'QUALITATIVE_ONLY' as const,
      producerRef: null,
      calibrationRef: null,
      horizonRef: null,
    },
  }));
}

export function makeOperatorOverlay(definition: SituationDefinitionV0): OperatorSituationOverlayV0 {
  return OperatorSituationOverlayV0Schema.parse(withUsrRecordDigest({
    schemaVersion: 'ffcc.usr.operator-overlay.v0.1.0' as const,
    overlayId: `usr_ovr_${definition.situationId.replace('usr_sit_', '')}`,
    situationId: definition.situationId,
    leagueContextRef: fixtureRef('league:operator', 'fixture.league.v0'),
    rosterContextRef: fixtureRef('roster:operator', 'fixture.roster.v0'),
    scoringProfileRef: fixtureRef('scoring:ppr', 'fixture.scoring.v0'),
    asOf: T1,
    rosteredAffectedPlayerIds: [definition.identity.playerIds[0]],
    availableAffectedPlayerIds: definition.identity.playerIds.slice(1),
    decisionSurfaceRefs: [fixtureRef('decision:waiver', 'fixture.decision.v0')],
    nextDecisionBoundary: T2,
    operatorPosture: 'balanced' as const,
    linkedHypothesisRefs: [],
    linkedDecisionRefs: [],
    actionTiming: 'WAIT_FOR_SPECIFIC_EVIDENCE' as const,
    requiredEvidenceBeforeAction: ['role_deployment'],
  }));
}

export type Usr0GoldenTrace = {
  id: string;
  description: string;
  definition: SituationDefinitionV0;
  observations: WitnessObservationV0[];
  asOf: string;
  expectedResolution?: 'UNRESOLVED' | 'CONTESTED' | 'LEANING' | 'PARTIALLY_RESOLVED' | 'RESOLVED';
  expectedAttention?: 'BACKGROUND' | 'WATCH' | 'ELEVATED' | 'URGENT';
  scenarioBinding?: ScenarioBranchBindingV0;
  expectedScenarioValid?: boolean;
  operatorOverlay?: OperatorSituationOverlayV0;
  assertion:
    | 'resolution'
    | 'scenario'
    | 'overlay'
    | 'future_evidence'
    | 'absence'
    | 'reopen'
    | 'correction'
    | 'conservation'
    | 'qualitative_not_probability';
};

const threeBackDefinition = makeDefinition({
  id: 'T01_three_back',
  players: [FIXTURE_PLAYERS.alpha, FIXTURE_PLAYERS.beta, FIXTURE_PLAYERS.gamma],
  states: [
    state('alpha_lead', FIXTURE_PLAYERS.alpha),
    state('beta_lead', FIXTURE_PLAYERS.beta),
    state('three_way_split', FIXTURE_PLAYERS.gamma, 'COMMITTEE'),
  ],
  witnesses: [
    witness('early_down', ['alpha_lead', 'beta_lead', 'three_way_split'], { comparabilityKey: 'early-down', requiredForResolution: true }),
    witness('two_minute', ['alpha_lead', 'beta_lead', 'three_way_split'], { domain: 'two_minute', comparabilityKey: 'two-minute', requiredForResolution: true, window: 'NEXT_GAME' }),
  ],
});

const workloadDefinition = makeDefinition({ id: 'T02_workload', persistence: 'medium', completeness: 'partial' });
const qbCascadeDefinition = makeDefinition({ id: 'T03_qb_cascade', persistence: 'fast', primaryClass: 'STARTER_IDENTITY', completeness: 'exhaustive' });
const routeTargetDefinition = makeDefinition({
  id: 'T04_route_target',
  primaryClass: 'TARGET_HIERARCHY',
  witnesses: [
    witness('routes', ['state_a', 'state_b'], { domain: 'route_share', sourceId: 'routes-source', strong: false }),
    witness('targets', ['state_b', 'state_a'], { domain: 'target_share', sourceId: 'targets-source', strong: false }),
  ],
});
const regimeDefinition = makeDefinition({
  id: 'T05_regime',
  persistence: 'slow',
  primaryClass: 'OFFENSIVE_REGIME',
  witnesses: [witness('scheme', ['state_a', 'state_b'], { domain: 'scheme_tendency', resolutionUse: 'CONTEXTUAL', window: 'MULTI_GAME', comparabilityKey: 'scheme-regime' })],
});
const returningDefinition = makeDefinition({ id: 'T06_return', primaryClass: 'RETURN_FROM_ABSENCE' });
const conflictDefinition = makeDefinition({ id: 'T07_conflict' });
const incompleteDefinition = makeDefinition({ id: 'T08_incomplete', completeness: 'partial' });
const overlayDefinition = makeDefinition({ id: 'T09_overlay' });
const futureDefinition = makeDefinition({ id: 'T10_future' });
const correctionDefinition = makeDefinition({ id: 'T11_correction' });
const reopenDefinition = makeDefinition({ id: 'T12_reopen' });
const absenceDefinition = makeDefinition({
  id: 'T13_absence',
  witnesses: [witness('absence_witness', ['state_a', 'state_b'], { absenceSemantics: 'OBSERVABLE_ZERO_ONLY_WITH_COMPLETE_WINDOW' })],
});
const conservationDefinition = makeDefinition({ id: 'T14_conservation', completeness: 'exhaustive' });
const qualitativeDefinition = makeDefinition({ id: 'T15_qualitative', completeness: 'exhaustive' });

export const USR0_GOLDEN_TRACES: Usr0GoldenTrace[] = [
  {
    id: 'USR0-T01-three-back-partial-resolution',
    description: 'Early-down ownership can lean while two-minute ownership remains unresolved.',
    definition: threeBackDefinition,
    observations: [observation(threeBackDefinition, 'early_down', { windowId: 'game-1' }), observation(threeBackDefinition, 'early_down', { observationId: 'early_down:game-2', windowId: 'game-2' })],
    asOf: T3,
    expectedResolution: 'PARTIALLY_RESOLVED',
    expectedAttention: 'ELEVATED',
    assertion: 'resolution',
  },
  {
    id: 'USR0-T02-workload-management-no-probability',
    description: 'Workload-management ambiguity remains categorical when the state set is incomplete.',
    definition: workloadDefinition,
    observations: [observation(workloadDefinition, 'role_deployment', { windowId: 'game-1' })],
    asOf: T2,
    expectedResolution: 'LEANING',
    assertion: 'qualitative_not_probability',
  },
  {
    id: 'USR0-T03-qb-cascade-joint-branches',
    description: 'One QB-state branch binds correlated teammate consequences together.',
    definition: qbCascadeDefinition,
    observations: [],
    asOf: T1,
    scenarioBinding: makeScenarioBinding(qbCascadeDefinition),
    expectedScenarioValid: true,
    assertion: 'scenario',
  },
  {
    id: 'USR0-T04-route-target-hierarchy-conflict',
    description: 'Route and target evidence can support competing receiver hierarchies without forced closure.',
    definition: routeTargetDefinition,
    observations: [observation(routeTargetDefinition, 'routes', { windowId: 'game-1' }), observation(routeTargetDefinition, 'targets', { windowId: 'game-1' })],
    asOf: T2,
    expectedResolution: 'CONTESTED',
    assertion: 'resolution',
  },
  {
    id: 'USR0-T05-one-game-regime-not-resolved',
    description: 'One offensive-regime game cannot resolve a slow-persistence claim.',
    definition: regimeDefinition,
    observations: [observation(regimeDefinition, 'scheme', { windowId: 'game-1', contextKey: 'neutral-script' })],
    asOf: T2,
    expectedResolution: 'LEANING',
    expectedAttention: 'BACKGROUND',
    assertion: 'resolution',
  },
  {
    id: 'USR0-T06-returning-player-reopen',
    description: 'A returning player is a legitimate reopen cause after resolution.',
    definition: returningDefinition,
    observations: [],
    asOf: T2,
    assertion: 'reopen',
  },
  {
    id: 'USR0-T07-source-conflict-preserved',
    description: 'Contradicted source evidence remains indeterminate and keeps the situation contested.',
    definition: conflictDefinition,
    observations: [observation(conflictDefinition, 'role_deployment', { observationState: 'CONTRADICTED', windowId: 'game-1' })],
    asOf: T2,
    expectedResolution: 'CONTESTED',
    assertion: 'resolution',
  },
  {
    id: 'USR0-T08-incomplete-state-set-no-mixture',
    description: 'An incomplete state set cannot accept a calibrated mixture binding.',
    definition: incompleteDefinition,
    observations: [],
    asOf: T1,
    scenarioBinding: makeScenarioBinding(incompleteDefinition, { calibrated: true, completeness: 'partial' }),
    expectedScenarioValid: false,
    assertion: 'scenario',
  },
  {
    id: 'USR0-T09-operator-overlay-does-not-mutate-shared',
    description: 'Operator urgency is separate from shared football truth.',
    definition: overlayDefinition,
    observations: [],
    asOf: T1,
    operatorOverlay: makeOperatorOverlay(overlayDefinition),
    assertion: 'overlay',
  },
  {
    id: 'USR0-T10-point-in-time-future-witness-rejected',
    description: 'Evidence known after the decision cutoff is ineligible.',
    definition: futureDefinition,
    observations: [observation(futureDefinition, 'role_deployment', { knownAt: T3, observedAt: T3 })],
    asOf: T1,
    assertion: 'future_evidence',
  },
  {
    id: 'USR0-T11-correction-preserves-prior-belief',
    description: 'Corrections append a new lineage record instead of mutating the prior snapshot.',
    definition: correctionDefinition,
    observations: [],
    asOf: T2,
    assertion: 'correction',
  },
  {
    id: 'USR0-T12-valid-material-reopen',
    description: 'Material role reversal can reopen a resolved situation while routine noise cannot.',
    definition: reopenDefinition,
    observations: [],
    asOf: T2,
    assertion: 'reopen',
  },
  {
    id: 'USR0-T13-observed-absence-needs-complete-window',
    description: 'Observed absence is not evidence without a closed complete coverage window.',
    definition: absenceDefinition,
    observations: [observation(absenceDefinition, 'absence_witness', { observationState: 'OBSERVED_ABSENT', windowState: 'OPEN', coverageState: 'PARTIAL' })],
    asOf: T2,
    assertion: 'absence',
  },
  {
    id: 'USR0-T14-conservation-constraint-rejection',
    description: 'Scenario binding rejects undeclared players so teammate role branches cannot create impossible opportunity.',
    definition: conservationDefinition,
    observations: [],
    asOf: T1,
    scenarioBinding: ScenarioBranchBindingV0Schema.parse(withUsrRecordDigest({
      ...makeScenarioBinding(conservationDefinition),
      branches: makeScenarioBinding(conservationDefinition).branches.map((branch, index) => index === 0 ? { ...branch, affectedPlayerIds: [FIXTURE_PLAYERS.gamma] } : branch),
      recordDigest: undefined as never,
    } as never)),
    expectedScenarioValid: false,
    assertion: 'conservation',
  },
  {
    id: 'USR0-T15-qualitative-support-cannot-be-probability',
    description: 'Qualitative state support has no numeric probability field or implicit mapping.',
    definition: qualitativeDefinition,
    observations: [observation(qualitativeDefinition, 'role_deployment', { windowId: 'game-1' })],
    asOf: T2,
    scenarioBinding: makeScenarioBinding(qualitativeDefinition, { calibrated: false }),
    expectedScenarioValid: true,
    assertion: 'qualitative_not_probability',
  },
];

export const USR0_FIXTURE_TIMES = { T0, T1, T2, T3 } as const;
