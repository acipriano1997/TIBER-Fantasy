import { z } from 'zod';
import { TIBER_PLAYER_ID_PATTERN } from '../../services/identity/tiberPlayerId';

export const USR_DIGEST_PROFILE = 'ffcc.usr.digest/jcs-sha256-v0' as const;
export const USR_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const USR_RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const nonEmpty = z.string().min(1).max(1024);
const shortText = z.string().min(1).max(256);
const digest = z.string().regex(USR_DIGEST_PATTERN);
export const InstantV0Schema = z.string().regex(USR_RFC3339_PATTERN).refine((value) => Number.isFinite(Date.parse(value)), 'invalid RFC3339 instant');
export const TiberPlayerIdV0Schema = z.string().regex(TIBER_PLAYER_ID_PATTERN);

export const GovernedRefV0Schema = z.object({
  kind: z.literal('governed_ref'),
  namespace: nonEmpty,
  schemaId: nonEmpty,
  objectId: nonEmpty,
  version: nonEmpty,
  digest,
}).strict();
export type GovernedRefV0 = z.infer<typeof GovernedRefV0Schema>;

export const UsrRecordRefV0Schema = z.object({
  kind: z.literal('usr_record'),
  recordType: z.enum([
    'situation_definition',
    'evaluation_snapshot',
    'resolution_receipt',
    'reopen_receipt',
    'correction_receipt',
    'scenario_branch_binding',
    'operator_overlay',
  ]),
  recordId: nonEmpty,
  recordDigest: digest,
}).strict();
export type UsrRecordRefV0 = z.infer<typeof UsrRecordRefV0Schema>;

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

export const SharedAttentionV0Schema = z.enum(['BACKGROUND', 'WATCH', 'ELEVATED', 'URGENT']);
export type SharedAttentionV0 = z.infer<typeof SharedAttentionV0Schema>;

export const ActionTimingV0Schema = z.enum(['ACT_NOW', 'HOLD', 'WAIT_FOR_SPECIFIC_EVIDENCE', 'DEADLINE_BOUND']);
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

export const WitnessDomainV0Schema = z.enum([
  'starter_status',
  'game_status',
  'practice',
  'snap_share',
  'route_share',
  'target_share',
  'first_read_share',
  'carry_share',
  'early_down',
  'third_down',
  'two_minute',
  'short_yardage',
  'inside_five',
  'pass_protection',
  'personnel_usage',
  'scheme_tendency',
  'transaction',
  'team_environment',
  'other_typed',
]);
export type WitnessDomainV0 = z.infer<typeof WitnessDomainV0Schema>;

export const WitnessResolutionUseV0Schema = z.enum(['DIRECT_AUTHORITATIVE', 'DEPLOYMENT', 'CONTEXTUAL']);
export type WitnessResolutionUseV0 = z.infer<typeof WitnessResolutionUseV0Schema>;

export const PlayerRoleChangeV0Schema = z.object({
  playerId: TiberPlayerIdV0Schema,
  roleKey: shortText,
  direction: z.enum(['INCREASED', 'DECREASED', 'LEAD', 'COMMITTEE', 'LIMITED', 'INACTIVE', 'CHANGED', 'UNKNOWN']),
  note: z.string().max(512).nullable(),
}).strict();

export const TeamEnvironmentChangeV0Schema = z.object({
  variableKey: shortText,
  direction: z.enum(['UP', 'DOWN', 'CHANGED', 'UNKNOWN']),
  note: z.string().max(512).nullable(),
}).strict();

export const CompetingStateV0Schema = z.object({
  stateId: shortText,
  label: shortText,
  description: nonEmpty,
  mechanism: nonEmpty,
  requiredConditions: z.array(nonEmpty),
  expectedObservables: z.array(nonEmpty),
  disconfirmingObservables: z.array(nonEmpty),
  supportPolicy: z.object({ supportScale: z.literal('categorical_v0') }).strict(),
  consequences: z.object({
    playerRoleChanges: z.array(PlayerRoleChangeV0Schema),
    teamEnvironmentChanges: z.array(TeamEnvironmentChangeV0Schema),
    scenarioKeys: z.array(shortText),
  }).strict(),
}).strict();
export type CompetingStateV0 = z.infer<typeof CompetingStateV0Schema>;

export const ResolutionWitnessDefinitionV0Schema = z.object({
  witnessId: shortText,
  question: nonEmpty,
  entityRefs: z.array(nonEmpty).min(1),
  domain: WitnessDomainV0Schema,
  resolutionUse: WitnessResolutionUseV0Schema,
  sourceRequirementRef: GovernedRefV0Schema,
  metricDefinitionRef: GovernedRefV0Schema.nullable(),
  window: WitnessWindowV0Schema,
  coverageRequirement: z.enum(['COMPLETE_REQUIRED', 'PARTIAL_ALLOWED', 'DIRECT_AUTHORITATIVE']),
  materiality: WitnessMaterialityV0Schema,
  requiredForResolution: z.boolean(),
  comparabilityKey: z.string().min(1).max(256).nullable(),
  stateEffects: z.array(z.object({
    stateId: shortText,
    observedPresent: WitnessEffectV0Schema,
    observedAbsent: WitnessEffectV0Schema,
  }).strict()).min(1),
  absenceSemantics: z.enum(['NOT_EVIDENCE', 'OBSERVABLE_ZERO_ONLY_WITH_COMPLETE_WINDOW']),
}).strict();
export type ResolutionWitnessDefinitionV0 = z.infer<typeof ResolutionWitnessDefinitionV0Schema>;

export const ImpactDefinitionV0Schema = z.object({
  affectedPlayerIds: z.array(TiberPlayerIdV0Schema),
  affectedTeamVariables: z.array(shortText),
  affectedDecisionSurfaces: z.array(z.enum(['LINEUP', 'WAIVER', 'TRADE', 'DYNASTY', 'KEEPER', 'PORTFOLIO', 'DRAFT'])),
  blastRadius: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']),
}).strict();
export type ImpactDefinitionV0 = z.infer<typeof ImpactDefinitionV0Schema>;

export const SituationDefinitionV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.situation-definition.v0.1.0'),
  situationId: z.string().regex(/^usr_sit_[A-Za-z0-9_-]{8,128}$/),
  versionOrdinal: z.number().int().positive(),
  season: z.number().int().min(2000).max(2200),
  createdAt: InstantV0Schema,
  knownAt: InstantV0Schema,
  identity: z.object({
    primaryTeamRef: GovernedRefV0Schema.nullable(),
    relatedTeamRefs: z.array(GovernedRefV0Schema),
    playerIds: z.array(TiberPlayerIdV0Schema),
    positionGroup: z.enum(['QB', 'RB', 'WR', 'TE']).nullable(),
    gameRefs: z.array(GovernedRefV0Schema),
  }).strict(),
  classification: z.object({
    primaryClass: SituationClassV0Schema,
    secondaryClasses: z.array(SituationClassV0Schema),
    scope: z.enum(['player', 'position_group', 'team', 'game', 'multi_entity']),
    persistenceClass: PersistenceClassV0Schema,
  }).strict(),
  question: nonEmpty,
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
  warnings: z.array(nonEmpty),
  recordDigest: digest,
}).strict().superRefine((value, ctx) => {
  const stateIds = value.competingStates.map((state) => state.stateId);
  const witnessIds = value.resolutionWitnesses.map((witness) => witness.witnessId);
  if (new Set(stateIds).size !== stateIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['competingStates'], message: 'duplicate stateId' });
  if (new Set(witnessIds).size !== witnessIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['resolutionWitnesses'], message: 'duplicate witnessId' });
  if (new Set(value.identity.playerIds).size !== value.identity.playerIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['identity', 'playerIds'], message: 'duplicate playerId' });
  if (new Set(value.classification.secondaryClasses).size !== value.classification.secondaryClasses.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['classification', 'secondaryClasses'], message: 'duplicate secondary class' });
  if (value.versionOrdinal === 1 && value.predecessorDefinitionRef !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['predecessorDefinitionRef'], message: 'initial definition cannot have predecessor' });
  if (value.versionOrdinal > 1 && value.predecessorDefinitionRef === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['predecessorDefinitionRef'], message: 'successor definition requires predecessor' });
  const declaredPlayers = new Set(value.identity.playerIds);
  value.competingStates.forEach((state, stateIndex) => {
    state.consequences.playerRoleChanges.forEach((role) => {
      if (!declaredPlayers.has(role.playerId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['competingStates', stateIndex, 'consequences', 'playerRoleChanges'], message: 'state consequence references undeclared player' });
    });
  });
  value.resolutionWitnesses.forEach((witness, witnessIndex) => {
    const effectIds = witness.stateEffects.map((effect) => effect.stateId);
    if (new Set(effectIds).size !== effectIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['resolutionWitnesses', witnessIndex, 'stateEffects'], message: 'duplicate state effect' });
    effectIds.forEach((stateId) => {
      if (!stateIds.includes(stateId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['resolutionWitnesses', witnessIndex, 'stateEffects'], message: 'witness effect references undeclared state' });
    });
  });
  value.impactDefinition.affectedPlayerIds.forEach((playerId) => {
    if (!declaredPlayers.has(playerId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['impactDefinition', 'affectedPlayerIds'], message: 'impact references undeclared player' });
  });
}).refine((value) => new Date(value.knownAt).getTime() >= new Date(value.createdAt).getTime(), { path: ['knownAt'], message: 'knownAt cannot precede createdAt' });
export type SituationDefinitionV0 = z.infer<typeof SituationDefinitionV0Schema>;

export const WitnessObservationV0Schema = z.object({
  observationId: shortText,
  witnessId: shortText,
  windowId: shortText,
  contextKey: z.string().min(1).max(256).nullable(),
  sourceRequirementRef: GovernedRefV0Schema,
  observedAt: InstantV0Schema.nullable(),
  knownAt: InstantV0Schema,
  windowState: z.enum(['OPEN', 'CLOSED', 'UNKNOWN']),
  observationState: z.enum(['UNOBSERVED', 'OBSERVED_PRESENT', 'OBSERVED_ABSENT', 'UNAVAILABLE', 'CONTRADICTED']),
  coverageState: z.enum(['COMPLETE', 'PARTIAL', 'UNKNOWN']),
  evidenceRefs: z.array(GovernedRefV0Schema),
}).strict().superRefine((value, ctx) => {
  if (['OBSERVED_PRESENT', 'OBSERVED_ABSENT', 'CONTRADICTED'].includes(value.observationState) && value.evidenceRefs.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceRefs'], message: 'observed or contradicted witness requires evidence refs' });
  }
  if (value.observedAt !== null && new Date(value.knownAt).getTime() < new Date(value.observedAt).getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['knownAt'], message: 'knownAt cannot precede observedAt' });
  }
});
export type WitnessObservationV0 = z.infer<typeof WitnessObservationV0Schema>;

export const WitnessResultV0Schema = z.object({
  observationId: shortText,
  witnessId: shortText,
  windowId: shortText,
  contextKey: z.string().min(1).max(256).nullable(),
  status: z.enum(['ADMISSIBLE', 'INDETERMINATE', 'SOURCE_MISMATCH', 'FUTURE_EVIDENCE', 'UNKNOWN_WITNESS']),
  observationState: z.enum(['UNOBSERVED', 'OBSERVED_PRESENT', 'OBSERVED_ABSENT', 'UNAVAILABLE', 'CONTRADICTED']),
  coverageState: z.enum(['COMPLETE', 'PARTIAL', 'UNKNOWN']),
  materiality: WitnessMaterialityV0Schema.nullable(),
  resolutionUse: WitnessResolutionUseV0Schema.nullable(),
  requiredForResolution: z.boolean(),
  comparabilityKey: z.string().min(1).max(256).nullable(),
  stateEffects: z.array(z.object({ stateId: shortText, effect: WitnessEffectV0Schema }).strict()),
  evidenceRefs: z.array(GovernedRefV0Schema),
  reasonCodes: z.array(shortText),
}).strict();
export type WitnessResultV0 = z.infer<typeof WitnessResultV0Schema>;

export const StateSupportAssessmentV0Schema = z.object({
  stateId: shortText,
  support: StateSupportV0Schema,
  basisWitnessIds: z.array(shortText),
  contradictionWitnessIds: z.array(shortText),
}).strict();

export const ResolutionAssessmentV0Schema = z.object({
  resolutionState: ResolutionStateV0Schema,
  stateSupport: z.array(StateSupportAssessmentV0Schema),
  resolvedStateIds: z.array(shortText),
  leadingStateId: shortText.nullable(),
  remainingRequiredWitnessIds: z.array(shortText),
  reasonCodes: z.array(shortText),
}).strict();
export type ResolutionAssessmentV0 = z.infer<typeof ResolutionAssessmentV0Schema>;

export const SituationEvaluationSnapshotV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.evaluation-snapshot.v0.1.0'),
  snapshotId: z.string().regex(/^usr_snap_[A-Za-z0-9_-]{8,128}$/),
  situationId: z.string().regex(/^usr_sit_[A-Za-z0-9_-]{8,128}$/),
  definitionRef: UsrRecordRefV0Schema,
  asOf: InstantV0Schema,
  knownAtCutoff: InstantV0Schema,
  recordedAt: InstantV0Schema,
  priorSnapshotRef: UsrRecordRefV0Schema.nullable(),
  inputFingerprint: digest,
  policyVersion: shortText,
  evidenceRefs: z.array(GovernedRefV0Schema),
  evidenceReadiness: z.object({ state: ReadinessStateV0Schema, reasonCodes: z.array(shortText) }).strict(),
  witnessResults: z.array(WitnessResultV0Schema),
  stateSupport: z.array(StateSupportAssessmentV0Schema),
  resolutionState: ResolutionStateV0Schema,
  resolvedStateIds: z.array(shortText),
  remainingUnknowns: z.array(shortText),
  materialDelta: MaterialDeltaV0Schema,
  sharedAttention: SharedAttentionV0Schema,
  attentionReasons: z.array(shortText),
  scenarioBranchBindingRefs: z.array(UsrRecordRefV0Schema),
  recordDigest: digest,
}).strict().superRefine((value, ctx) => {
  if (new Set(value.witnessResults.map((row) => row.observationId)).size !== value.witnessResults.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['witnessResults'], message: 'duplicate observationId' });
  if (new Set(value.stateSupport.map((row) => row.stateId)).size !== value.stateSupport.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stateSupport'], message: 'duplicate state support' });
  if (new Date(value.knownAtCutoff).getTime() > new Date(value.asOf).getTime()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['knownAtCutoff'], message: 'knownAtCutoff cannot exceed asOf' });
  if (new Date(value.recordedAt).getTime() < new Date(value.asOf).getTime()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recordedAt'], message: 'recordedAt cannot precede asOf' });
});
export type SituationEvaluationSnapshotV0 = z.infer<typeof SituationEvaluationSnapshotV0Schema>;

export const SituationResolutionReceiptV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.resolution-receipt.v0.1.0'),
  receiptId: z.string().regex(/^usr_res_[A-Za-z0-9_-]{8,128}$/),
  situationId: z.string().regex(/^usr_sit_[A-Za-z0-9_-]{8,128}$/),
  definitionRef: UsrRecordRefV0Schema,
  finalSnapshotRef: UsrRecordRefV0Schema,
  resolvedStateIds: z.array(shortText).min(1),
  resolvedAt: InstantV0Schema,
  knownAt: InstantV0Schema,
  resolutionBasisWitnessIds: z.array(shortText).min(1),
  residualUnknowns: z.array(shortText),
  reopenConditions: z.array(z.enum(['INJURY', 'TRANSACTION', 'COACHING_CHANGE', 'RETURN_FROM_ABSENCE', 'MEANINGFUL_ROLE_REVERSAL', 'REPEATED_DEPLOYMENT_CHANGE', 'SOURCE_CORRECTION'])),
  recordDigest: digest,
}).strict();
export type SituationResolutionReceiptV0 = z.infer<typeof SituationResolutionReceiptV0Schema>;

export const SituationReopenReceiptV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.reopen-receipt.v0.1.0'),
  receiptId: z.string().regex(/^usr_reopen_[A-Za-z0-9_-]{8,128}$/),
  situationId: z.string().regex(/^usr_sit_[A-Za-z0-9_-]{8,128}$/),
  priorResolutionReceiptRef: UsrRecordRefV0Schema,
  reopenedAt: InstantV0Schema,
  knownAt: InstantV0Schema,
  cause: z.enum(['INJURY', 'TRANSACTION', 'COACHING_CHANGE', 'RETURN_FROM_ABSENCE', 'MEANINGFUL_ROLE_REVERSAL', 'REPEATED_DEPLOYMENT_CHANGE', 'SOURCE_CORRECTION']),
  evidenceRefs: z.array(GovernedRefV0Schema).min(1),
  recordDigest: digest,
}).strict();
export type SituationReopenReceiptV0 = z.infer<typeof SituationReopenReceiptV0Schema>;

export const SituationCorrectionReceiptV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.correction-receipt.v0.1.0'),
  receiptId: z.string().regex(/^usr_corr_[A-Za-z0-9_-]{8,128}$/),
  situationId: z.string().regex(/^usr_sit_[A-Za-z0-9_-]{8,128}$/),
  targetRecordRef: UsrRecordRefV0Schema,
  replacementRecordRef: UsrRecordRefV0Schema,
  correctedAt: InstantV0Schema,
  knownAt: InstantV0Schema,
  reasonCodes: z.array(shortText).min(1),
  evidenceRefs: z.array(GovernedRefV0Schema).min(1),
  recordDigest: digest,
}).strict();
export type SituationCorrectionReceiptV0 = z.infer<typeof SituationCorrectionReceiptV0Schema>;

export const ScenarioBranchBindingV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.scenario-branch-binding.v0.1.0'),
  bindingId: z.string().regex(/^usr_scn_[A-Za-z0-9_-]{8,128}$/),
  situationId: z.string().regex(/^usr_sit_[A-Za-z0-9_-]{8,128}$/),
  definitionRef: UsrRecordRefV0Schema,
  asOf: InstantV0Schema,
  stateSetCompleteness: z.enum(['exhaustive', 'partial', 'unknown']),
  branches: z.array(z.object({
    stateId: shortText,
    scenarioKey: shortText,
    affectedPlayerIds: z.array(TiberPlayerIdV0Schema),
    affectedTeamVariables: z.array(shortText),
    forecastScenarioRef: GovernedRefV0Schema.nullable(),
  }).strict()).min(1),
  probabilityBinding: z.object({
    status: z.enum(['UNAVAILABLE', 'QUALITATIVE_ONLY', 'CALIBRATED']),
    producerRef: GovernedRefV0Schema.nullable(),
    calibrationRef: GovernedRefV0Schema.nullable(),
    horizonRef: GovernedRefV0Schema.nullable(),
  }).strict(),
  recordDigest: digest,
}).strict().superRefine((value, ctx) => {
  const stateIds = value.branches.map((branch) => branch.stateId);
  if (new Set(stateIds).size !== stateIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['branches'], message: 'duplicate state branch' });
  const refs = value.probabilityBinding;
  if (refs.status === 'CALIBRATED' && (!refs.producerRef || !refs.calibrationRef || !refs.horizonRef)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['probabilityBinding'], message: 'calibrated binding requires producer, calibration, and horizon refs' });
  if (refs.status !== 'CALIBRATED' && (refs.producerRef || refs.calibrationRef || refs.horizonRef)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['probabilityBinding'], message: 'non-calibrated binding cannot carry calibration refs' });
});
export type ScenarioBranchBindingV0 = z.infer<typeof ScenarioBranchBindingV0Schema>;

export const OperatorSituationOverlayV0Schema = z.object({
  schemaVersion: z.literal('ffcc.usr.operator-overlay.v0.1.0'),
  overlayId: z.string().regex(/^usr_ovr_[A-Za-z0-9_-]{8,128}$/),
  situationId: z.string().regex(/^usr_sit_[A-Za-z0-9_-]{8,128}$/),
  leagueContextRef: GovernedRefV0Schema,
  rosterContextRef: GovernedRefV0Schema,
  scoringProfileRef: GovernedRefV0Schema,
  asOf: InstantV0Schema,
  rosteredAffectedPlayerIds: z.array(TiberPlayerIdV0Schema),
  availableAffectedPlayerIds: z.array(TiberPlayerIdV0Schema),
  decisionSurfaceRefs: z.array(GovernedRefV0Schema),
  nextDecisionBoundary: InstantV0Schema.nullable(),
  operatorPosture: z.enum(['unset', 'protect_downside', 'balanced', 'chase_spike']),
  linkedHypothesisRefs: z.array(GovernedRefV0Schema),
  linkedDecisionRefs: z.array(GovernedRefV0Schema),
  actionTiming: ActionTimingV0Schema.nullable(),
  requiredEvidenceBeforeAction: z.array(shortText),
  recordDigest: digest,
}).strict();
export type OperatorSituationOverlayV0 = z.infer<typeof OperatorSituationOverlayV0Schema>;

export type ReopenCauseV0 = SituationReopenReceiptV0['cause'];