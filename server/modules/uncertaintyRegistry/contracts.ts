import { z } from 'zod';
import { TIBER_PLAYER_ID_PATTERN } from '../../services/identity/tiberPlayerId';

export const USR_DIGEST_PROFILE = 'ffcc.usr.digest/jcs-sha256-v0' as const;
export const USR_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const RFC3339_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const opaque = z.string().min(1).max(512);
const instant = z.string().regex(RFC3339_INSTANT_PATTERN);
const digest = z.string().regex(USR_DIGEST_PATTERN);
const playerId = z.string().regex(TIBER_PLAYER_ID_PATTERN);
const situationId = z.string().regex(/^usr_sit_[A-Za-z0-9_-]{6,128}$/);
const stateId = z.string().regex(/^state:[A-Za-z0-9._-]{1,128}$/);
const witnessId = z.string().regex(/^witness:[A-Za-z0-9._-]{1,128}$/);
const recordId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}[A-Za-z0-9_-]{6,128}$`));

export const SituationClassV0Schema = z.enum([
  'ROLE_ALLOCATION',
  'AVAILABILITY_READINESS',
  'STARTER_IDENTITY',
  'TARGET_HIERARCHY',
  'PERSONNEL_INTEGRATION',
  'OFFENSIVE_REGIME',
  'SCHEME_USAGE',
  'TEAM_ENVIRONMENT',
  'DEPTH_CHART_TRANSITION',
  'RETURN_FROM_ABSENCE',
  'TRANSACTION_CONTINGENCY',
]);
export type SituationClassV0 = z.infer<typeof SituationClassV0Schema>;

export const PersistenceClassV0Schema = z.enum(['fast', 'medium', 'slow']);
export type PersistenceClassV0 = z.infer<typeof PersistenceClassV0Schema>;

export const StateSupportV0Schema = z.enum([
  'UNASSESSED',
  'PLAUSIBLE',
  'SUPPORTED',
  'LEADING',
  'CONTRADICTED',
  'RULED_OUT',
]);
export type StateSupportV0 = z.infer<typeof StateSupportV0Schema>;

export const ResolutionStateV0Schema = z.enum([
  'UNRESOLVED',
  'CONTESTED',
  'LEANING',
  'PARTIALLY_RESOLVED',
  'RESOLVED',
]);
export type ResolutionStateV0 = z.infer<typeof ResolutionStateV0Schema>;

export const ReadinessStateV0Schema = z.enum([
  'READY',
  'PARTIAL',
  'STALE',
  'CONFLICTING',
  'UNAVAILABLE',
  'IDENTITY_UNRESOLVED',
]);
export type ReadinessStateV0 = z.infer<typeof ReadinessStateV0Schema>;

export const MaterialDeltaV0Schema = z.enum([
  'NEW',
  'MATERIAL_CHANGE',
  'NO_MATERIAL_CHANGE',
  'CORRECTION',
  'REOPENED',
]);
export type MaterialDeltaV0 = z.infer<typeof MaterialDeltaV0Schema>;

export const SharedAttentionV0Schema = z.enum(['BACKGROUND', 'WATCH', 'ELEVATED', 'URGENT']);
export type SharedAttentionV0 = z.infer<typeof SharedAttentionV0Schema>;

export const WitnessWindowV0Schema = z.enum([
  'PRE_LOCK',
  'SAME_DAY',
  'NEXT_PRACTICE_CYCLE',
  'NEXT_GAME',
  'ONE_TO_TWO_GAMES',
  'MULTI_GAME',
  'OPEN',
]);
export type WitnessWindowV0 = z.infer<typeof WitnessWindowV0Schema>;

export const WitnessMaterialityV0Schema = z.enum(['LOAD_BEARING', 'HIGH', 'MEDIUM', 'LOW']);
export type WitnessMaterialityV0 = z.infer<typeof WitnessMaterialityV0Schema>;

export const ActionTimingV0Schema = z.enum([
  'ACT_NOW',
  'HOLD',
  'WAIT_FOR_SPECIFIC_EVIDENCE',
  'DEADLINE_BOUND',
]);
export type ActionTimingV0 = z.infer<typeof ActionTimingV0Schema>;

export const WitnessEffectV0Schema = z.enum([
  'supports',
  'strongly_supports',
  'refutes',
  'rules_out',
  'no_change',
  'indeterminate',
]);
export type WitnessEffectV0 = z.infer<typeof WitnessEffectV0Schema>;

export const GovernedRefV0Schema = z.object({
  refType: z.literal('governed'),
  namespace: opaque,
  id: opaque,
  version: opaque.nullable(),
  digest: digest.nullable(),
}).strict();
export type GovernedRefV0 = z.infer<typeof GovernedRefV0Schema>;

export const UsrRecordRefV0Schema = z.object({
  schemaVersion: opaque,
  recordId: opaque,
  recordDigest: digest,
}).strict();
export type UsrRecordRefV0 = z.infer<typeof UsrRecordRefV0Schema>;

export const EntityRefV0Schema = z.union([playerId, GovernedRefV0Schema]);

export const PlayerRoleChangeV0Schema = z.object({
  playerId,
  roleKey: opaque,
  effect: z.enum(['increase', 'decrease', 'owns', 'loses', 'unchanged', 'unknown']),
  detail: z.string().min(1).max(2000).nullable(),
}).strict();

export const TeamEnvironmentChangeV0Schema = z.object({
  variableKey: opaque,
  effect: z.enum(['increase', 'decrease', 'changes', 'unchanged', 'unknown']),
  detail: z.string().min(1).max(2000).nullable(),
}).strict();

export const CompetingStateV0Schema = z.object({
  stateId,
  label: opaque,
  description: z.string().min(1).max(4000),
  mechanism: z.string().min(1).max(4000),
  requiredConditions: z.array(opaque),
  expectedObservables: z.array(opaque),
  disconfirmingObservables: z.array(opaque),
  supportPolicy: z.object({ supportScale: z.literal('categorical_v0') }).strict(),
  consequences: z.object({
    playerRoleChanges: z.array(PlayerRoleChangeV0Schema),
    teamEnvironmentChanges: z.array(TeamEnvironmentChangeV0Schema),
    scenarioKeys: z.array(opaque),
  }).strict(),
}).strict();
export type CompetingStateV0 = z.infer<typeof CompetingStateV0Schema>;

export const ResolutionWitnessDefinitionV0Schema = z.object({
  witnessId,
  question: z.string().min(1).max(4000),
  entityRefs: z.array(EntityRefV0Schema).min(1),
  domain: z.enum([
    'starter_status', 'game_status', 'practice', 'snap_share', 'route_share', 'target_share',
    'first_read_share', 'carry_share', 'early_down', 'third_down', 'two_minute', 'short_yardage',
    'inside_five', 'pass_protection', 'personnel_usage', 'scheme_tendency', 'transaction',
    'team_environment', 'other_typed',
  ]),
  sourceRequirementRef: GovernedRefV0Schema,
  metricDefinitionRef: GovernedRefV0Schema.nullable(),
  window: WitnessWindowV0Schema,
  coverageRequirement: z.enum(['COMPLETE_REQUIRED', 'PARTIAL_ALLOWED', 'DIRECT_AUTHORITATIVE']),
  materiality: WitnessMaterialityV0Schema,
  stateEffects: z.array(z.object({
    stateId,
    observedPresent: WitnessEffectV0Schema,
    observedAbsent: WitnessEffectV0Schema,
  }).strict()).min(1),
  absenceSemantics: z.enum(['NOT_EVIDENCE', 'OBSERVABLE_ZERO_ONLY_WITH_COMPLETE_WINDOW']),
}).strict();
export type ResolutionWitnessDefinitionV0 = z.infer<typeof ResolutionWitnessDefinitionV0Schema>;

export const ImpactDefinitionV0Schema = z.object({
  affectedPlayers: z.array(playerId),
  affectedTeamVariables: z.array(opaque),
  affectedDecisionSurfaces: z.array(z.enum([
    'lineup', 'waiver', 'trade', 'dynasty', 'keeper', 'draft', 'portfolio', 'player_intelligence',
  ])),
  blastRadius: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']),
}).strict();

export const SituationDefinitionV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.situation-definition.v0.1.0'),
  situationId,
  recordId: recordId('usr_def_'),
  versionOrdinal: z.number().int().positive(),
  season: z.number().int().min(2000).max(2200),
  createdAt: instant,
  knownAt: instant,
  identity: z.object({
    primaryTeamRef: GovernedRefV0Schema.nullable(),
    relatedTeamRefs: z.array(GovernedRefV0Schema),
    playerIds: z.array(playerId),
    positionGroup: z.enum(['QB', 'RB', 'WR', 'TE']).nullable(),
    gameRefs: z.array(GovernedRefV0Schema),
  }).strict(),
  classification: z.object({
    primaryClass: SituationClassV0Schema,
    secondaryClasses: z.array(SituationClassV0Schema),
    scope: z.enum(['player', 'position_group', 'team', 'game', 'multi_entity']),
    persistenceClass: PersistenceClassV0Schema,
  }).strict(),
  question: z.string().min(1).max(4000),
  stateSetCompleteness: z.enum(['exhaustive', 'partial', 'unknown']),
  competingStates: z.array(CompetingStateV0Schema).min(2),
  resolutionWitnesses: z.array(ResolutionWitnessDefinitionV0Schema).min(1),
  impactDefinition: ImpactDefinitionV0Schema,
  policyRefs: z.object({
    resolutionPolicyRef: GovernedRefV0Schema,
    attentionPolicyRef: GovernedRefV0Schema,
    evidenceEligibilityPolicyRef: GovernedRefV0Schema,
    canonicalizationProfile: z.literal(USR_DIGEST_PROFILE),
  }).strict(),
  predecessorDefinitionRef: UsrRecordRefV0Schema.nullable(),
  warnings: z.array(opaque),
  recordDigest: digest,
}).strict().superRefine((value, ctx) => {
  const stateIds = value.competingStates.map((state) => state.stateId);
  const stateSet = new Set(stateIds);
  if (stateSet.size !== stateIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['competingStates'], message: 'duplicate stateId' });
  }
  const witnessIds = value.resolutionWitnesses.map((witness) => witness.witnessId);
  if (new Set(witnessIds).size !== witnessIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['resolutionWitnesses'], message: 'duplicate witnessId' });
  }
  for (const witness of value.resolutionWitnesses) {
    const effectIds = witness.stateEffects.map((effect) => effect.stateId);
    if (new Set(effectIds).size !== effectIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate state effect in ${witness.witnessId}` });
    }
    for (const effect of witness.stateEffects) {
      if (!stateSet.has(effect.stateId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `witness ${witness.witnessId} references undeclared state ${effect.stateId}` });
      }
    }
  }
  const identityPlayers = new Set(value.identity.playerIds);
  for (const impacted of value.impactDefinition.affectedPlayers) {
    if (!identityPlayers.has(impacted)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `affected player ${impacted} is not declared in situation identity` });
    }
  }
  for (const state of value.competingStates) {
    for (const change of state.consequences.playerRoleChanges) {
      if (!identityPlayers.has(change.playerId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `state ${state.stateId} changes undeclared player ${change.playerId}` });
      }
    }
  }
  if (value.versionOrdinal === 1 && value.predecessorDefinitionRef !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'initial definition cannot have predecessorDefinitionRef' });
  }
  if (value.versionOrdinal > 1 && value.predecessorDefinitionRef === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'successor definition requires predecessorDefinitionRef' });
  }
  if (
    value.identity.playerIds.length === 0
    && value.identity.primaryTeamRef === null
    && value.identity.relatedTeamRefs.length === 0
    && value.identity.gameRefs.length === 0
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'situation requires at least one declared entity' });
  }
});
export type SituationDefinitionV0 = z.infer<typeof SituationDefinitionV0Schema>;

export const WitnessObservationV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.witness-observation.v0.1.0'),
  observationId: recordId('usr_obs_'),
  situationId,
  witnessId,
  observedAt: instant.nullable(),
  knownAt: instant,
  recordedAt: instant,
  windowState: z.enum(['open', 'closed', 'unknown']),
  observationState: z.enum(['unobserved', 'observed_present', 'observed_absent', 'unavailable', 'contradicted']),
  coverageState: z.enum(['complete', 'incomplete', 'unknown']),
  sourceRequirementRef: GovernedRefV0Schema,
  metricDefinitionRef: GovernedRefV0Schema.nullable(),
  basisRefs: z.array(GovernedRefV0Schema),
  coverageRefs: z.array(GovernedRefV0Schema),
  contradictionRefs: z.array(GovernedRefV0Schema),
  windowInstanceId: opaque.nullable(),
  comparisonKey: opaque.nullable(),
  contextKey: opaque.nullable(),
  recordDigest: digest,
}).strict().superRefine((value, ctx) => {
  if (value.coverageState === 'complete' && value.coverageRefs.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'complete coverage requires coverageRefs' });
  }
  if (['observed_present', 'observed_absent', 'contradicted'].includes(value.observationState) && value.basisRefs.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'observed or contradicted state requires basisRefs' });
  }
  if (value.observationState === 'contradicted' && value.contradictionRefs.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'contradicted observation requires contradictionRefs' });
  }
});
export type WitnessObservationV0 = z.infer<typeof WitnessObservationV0Schema>;

export const WitnessResultV0Schema = z.object({
  witnessId,
  observationId: opaque,
  windowState: z.enum(['open', 'closed', 'unknown']),
  observationState: z.enum(['unobserved', 'observed_present', 'observed_absent', 'unavailable', 'contradicted']),
  coverageState: z.enum(['complete', 'incomplete', 'unknown']),
  materiality: WitnessMaterialityV0Schema,
  sourceMatched: z.boolean(),
  effects: z.array(z.object({ stateId, effect: WitnessEffectV0Schema }).strict()),
  reasonCodes: z.array(opaque),
  basisRefs: z.array(GovernedRefV0Schema),
  windowInstanceId: opaque.nullable(),
  comparisonKey: opaque.nullable(),
  contextKey: opaque.nullable(),
}).strict();
export type WitnessResultV0 = z.infer<typeof WitnessResultV0Schema>;

export const SituationEvaluationSnapshotV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.evaluation-snapshot.v0.1.0'),
  snapshotId: recordId('usr_eval_'),
  situationId,
  definitionRef: UsrRecordRefV0Schema,
  asOf: instant,
  knownAtCutoff: instant,
  recordedAt: instant,
  priorSnapshotRef: UsrRecordRefV0Schema.nullable(),
  inputFingerprint: digest,
  policyVersion: opaque,
  evidenceRefs: z.array(GovernedRefV0Schema),
  evidenceReadiness: z.object({
    state: ReadinessStateV0Schema,
    reasonCodes: z.array(opaque),
  }).strict(),
  witnessResults: z.array(WitnessResultV0Schema),
  stateSupport: z.array(z.object({
    stateId,
    support: StateSupportV0Schema,
    basisWitnessIds: z.array(witnessId),
    contradictionWitnessIds: z.array(witnessId),
  }).strict()),
  resolutionState: ResolutionStateV0Schema,
  resolvedStateIds: z.array(stateId),
  remainingUnknowns: z.array(opaque),
  materialDelta: MaterialDeltaV0Schema,
  sharedAttention: SharedAttentionV0Schema,
  attentionReasons: z.array(opaque),
  scenarioBranchBindingRefs: z.array(UsrRecordRefV0Schema),
  recordDigest: digest,
}).strict();
export type SituationEvaluationSnapshotV0 = z.infer<typeof SituationEvaluationSnapshotV0Schema>;

export const SituationResolutionReceiptV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.resolution-receipt.v0.1.0'),
  receiptId: recordId('usr_res_'),
  situationId,
  definitionRef: UsrRecordRefV0Schema,
  finalSnapshotRef: UsrRecordRefV0Schema,
  resolvedStateIds: z.array(stateId).min(1),
  resolvedAt: instant,
  knownAt: instant,
  resolutionBasis: z.array(witnessId).min(1),
  finalWitnesses: z.array(witnessId).min(1),
  residualUncertainty: z.array(opaque),
  priorStateCount: z.number().int().min(2),
  reopenConditions: z.array(z.enum([
    'injury', 'transaction', 'coaching_change', 'meaningful_role_reversal', 'returning_player',
    'repeated_deployment_change', 'source_correction',
  ])),
  recordDigest: digest,
}).strict();
export type SituationResolutionReceiptV0 = z.infer<typeof SituationResolutionReceiptV0Schema>;

export const SituationReopenReceiptV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.reopen-receipt.v0.1.0'),
  receiptId: recordId('usr_reopen_'),
  situationId,
  priorResolutionRef: UsrRecordRefV0Schema,
  reopenedAt: instant,
  knownAt: instant,
  cause: z.enum([
    'injury', 'transaction', 'coaching_change', 'meaningful_role_reversal', 'returning_player',
    'repeated_deployment_change', 'source_correction',
  ]),
  evidenceRefs: z.array(GovernedRefV0Schema).min(1),
  recordDigest: digest,
}).strict();
export type SituationReopenReceiptV0 = z.infer<typeof SituationReopenReceiptV0Schema>;

export const SituationCorrectionReceiptV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.correction-receipt.v0.1.0'),
  receiptId: recordId('usr_corr_'),
  situationId,
  correctedRecordRef: UsrRecordRefV0Schema,
  replacementRecordRef: UsrRecordRefV0Schema,
  correctedAt: instant,
  knownAt: instant,
  reasonCodes: z.array(opaque).min(1),
  evidenceRefs: z.array(GovernedRefV0Schema).min(1),
  recordDigest: digest,
}).strict().superRefine((value, ctx) => {
  if (value.correctedRecordRef.recordDigest === value.replacementRecordRef.recordDigest) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'correction replacement must differ from corrected record' });
  }
});
export type SituationCorrectionReceiptV0 = z.infer<typeof SituationCorrectionReceiptV0Schema>;

export const ScenarioBranchBindingV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.scenario-branch-binding.v0.1.0'),
  bindingId: recordId('usr_branch_'),
  situationId,
  definitionRef: UsrRecordRefV0Schema,
  asOf: instant,
  stateSetCompleteness: z.enum(['exhaustive', 'partial', 'unknown']),
  branches: z.array(z.object({
    stateId,
    scenarioKey: opaque,
    affectedPlayerIds: z.array(playerId),
    affectedTeamVariables: z.array(opaque),
    forecastScenarioRef: GovernedRefV0Schema.nullable(),
    stateProbability: z.number().min(0).max(1).nullable(),
  }).strict()).min(1),
  probabilityBinding: z.object({
    status: z.enum(['UNAVAILABLE', 'QUALITATIVE_ONLY', 'CALIBRATED']),
    producerRef: GovernedRefV0Schema.nullable(),
    calibrationRef: GovernedRefV0Schema.nullable(),
    horizonRef: GovernedRefV0Schema.nullable(),
  }).strict(),
  recordDigest: digest,
}).strict();
export type ScenarioBranchBindingV0 = z.infer<typeof ScenarioBranchBindingV0Schema>;

export const OperatorSituationOverlayV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.operator-overlay.v0.1.0'),
  overlayId: recordId('usr_overlay_'),
  situationId,
  leagueContextRef: GovernedRefV0Schema,
  rosterContextRef: GovernedRefV0Schema,
  scoringProfileRef: GovernedRefV0Schema,
  asOf: instant,
  rosteredAffectedPlayerIds: z.array(playerId),
  availableAffectedPlayerIds: z.array(playerId),
  decisionSurfaceRefs: z.array(GovernedRefV0Schema),
  nextDecisionBoundary: instant.nullable(),
  operatorPosture: z.enum(['unset', 'protect_downside', 'balanced', 'chase_spike']),
  linkedHypothesisRefs: z.array(GovernedRefV0Schema),
  linkedDecisionRefs: z.array(GovernedRefV0Schema),
  actionTiming: ActionTimingV0Schema.nullable(),
  requiredEvidenceBeforeAction: z.array(witnessId),
  recordDigest: digest,
}).strict();
export type OperatorSituationOverlayV0 = z.infer<typeof OperatorSituationOverlayV0Schema>;

export const UsrRecordV0Schema = z.union([
  SituationDefinitionV0Schema,
  WitnessObservationV0Schema,
  SituationEvaluationSnapshotV0Schema,
  SituationResolutionReceiptV0Schema,
  SituationReopenReceiptV0Schema,
  SituationCorrectionReceiptV0Schema,
  ScenarioBranchBindingV0Schema,
  OperatorSituationOverlayV0Schema,
]);
export type UsrRecordV0 = z.infer<typeof UsrRecordV0Schema>;
