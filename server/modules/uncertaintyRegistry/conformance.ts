import {
  ScenarioBranchBindingV0Schema,
  SituationCorrectionReceiptV0Schema,
  SituationDefinitionV0Schema,
  SituationEvaluationSnapshotV0Schema,
  SituationReopenReceiptV0Schema,
  SituationResolutionReceiptV0Schema,
  UsrRecordV0Schema,
  type ScenarioBranchBindingV0,
  type SituationCorrectionReceiptV0,
  type SituationDefinitionV0,
  type SituationEvaluationSnapshotV0,
  type SituationReopenReceiptV0,
  type SituationResolutionReceiptV0,
  type UsrRecordRefV0,
  type UsrRecordV0,
} from './contracts';
import { usrRecordRef, verifyUsrDigest } from './canonicalization';
import { validateScenarioBranchBindingV0 } from './policy';

export type ConformanceResultV0 = {
  valid: boolean;
  reasonCodes: string[];
};

const RFC3339_CAPTURE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function sameRecordRef(left: UsrRecordRefV0, right: UsrRecordRefV0): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.recordId === right.recordId
    && left.recordDigest === right.recordDigest;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

/** Calendar-valid RFC3339 instant check used by the conformance boundary. */
export function isStrictRfc3339InstantV0(value: string): boolean {
  const match = RFC3339_CAPTURE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === 'Z' ? 0 : Number(match[10]);
  const offsetMinute = match[8] === 'Z' ? 0 : Number(match[11]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return false;
  if (offsetHour < 0 || offsetHour > 23 || offsetMinute < 0 || offsetMinute > 59) return false;
  return true;
}

function recordStableId(record: UsrRecordV0): string {
  switch (record.schemaVersion) {
    case 'ffcc.usr.situation-definition.v0.1.0': return record.recordId;
    case 'ffcc.usr.witness-observation.v0.1.0': return record.observationId;
    case 'ffcc.usr.evaluation-snapshot.v0.1.0': return record.snapshotId;
    case 'ffcc.usr.resolution-receipt.v0.1.0': return record.receiptId;
    case 'ffcc.usr.reopen-receipt.v0.1.0': return record.receiptId;
    case 'ffcc.usr.correction-receipt.v0.1.0': return record.receiptId;
    case 'ffcc.usr.scenario-branch-binding.v0.1.0': return record.bindingId;
    case 'ffcc.usr.operator-overlay.v0.1.0': return record.overlayId;
  }
}

function recordSituationId(record: UsrRecordV0): string {
  return record.situationId;
}

function safeRecordRef(record: UsrRecordV0): UsrRecordRefV0 | null {
  try {
    return usrRecordRef(record as unknown as Record<string, unknown> & { schemaVersion: string; recordDigest: string });
  } catch {
    return null;
  }
}

function temporalIntegrityReasons(record: UsrRecordV0): string[] {
  const values: Array<[string, string | null]> = [];
  switch (record.schemaVersion) {
    case 'ffcc.usr.situation-definition.v0.1.0':
      values.push(['createdAt', record.createdAt], ['knownAt', record.knownAt]);
      break;
    case 'ffcc.usr.witness-observation.v0.1.0':
      values.push(['observedAt', record.observedAt], ['knownAt', record.knownAt], ['recordedAt', record.recordedAt]);
      break;
    case 'ffcc.usr.evaluation-snapshot.v0.1.0':
      values.push(['asOf', record.asOf], ['knownAtCutoff', record.knownAtCutoff], ['recordedAt', record.recordedAt]);
      break;
    case 'ffcc.usr.resolution-receipt.v0.1.0':
      values.push(['resolvedAt', record.resolvedAt], ['knownAt', record.knownAt]);
      break;
    case 'ffcc.usr.reopen-receipt.v0.1.0':
      values.push(['reopenedAt', record.reopenedAt], ['knownAt', record.knownAt]);
      break;
    case 'ffcc.usr.correction-receipt.v0.1.0':
      values.push(['correctedAt', record.correctedAt], ['knownAt', record.knownAt]);
      break;
    case 'ffcc.usr.scenario-branch-binding.v0.1.0':
      values.push(['asOf', record.asOf]);
      break;
    case 'ffcc.usr.operator-overlay.v0.1.0':
      values.push(['asOf', record.asOf], ['nextDecisionBoundary', record.nextDecisionBoundary]);
      break;
  }
  const reasons = values
    .filter(([, value]) => value !== null && !isStrictRfc3339InstantV0(value))
    .map(([field]) => `invalid_rfc3339_instant:${field}`);

  if (record.schemaVersion === 'ffcc.usr.witness-observation.v0.1.0') {
    if (record.observedAt !== null && Date.parse(record.knownAt) < Date.parse(record.observedAt)) {
      reasons.push('observation_known_at_precedes_observed_at');
    }
    if (Date.parse(record.recordedAt) < Date.parse(record.knownAt)) {
      reasons.push('observation_recorded_at_precedes_known_at');
    }
  }
  if (record.schemaVersion === 'ffcc.usr.evaluation-snapshot.v0.1.0') {
    if (Date.parse(record.knownAtCutoff) > Date.parse(record.asOf)) reasons.push('snapshot_cutoff_after_as_of');
    if (Date.parse(record.recordedAt) < Date.parse(record.asOf)) reasons.push('snapshot_recorded_at_precedes_as_of');
  }
  return reasons;
}

export function validateUsrRecordV0(record: unknown): ConformanceResultV0 {
  const parsed = UsrRecordV0Schema.safeParse(record);
  if (!parsed.success) {
    return {
      valid: false,
      reasonCodes: unique(parsed.error.issues.map((issue) => `schema:${issue.message}`)),
    };
  }
  const reasons = temporalIntegrityReasons(parsed.data);
  if (!verifyUsrDigest(parsed.data as unknown as { recordDigest: string } & Record<string, unknown>)) {
    reasons.push('record_digest_mismatch');
  }
  return { valid: reasons.length === 0, reasonCodes: unique(reasons) };
}

export function validateDefinitionSuccessorV0(
  previous: SituationDefinitionV0,
  next: SituationDefinitionV0,
): ConformanceResultV0 {
  const reasons: string[] = [];
  if (!SituationDefinitionV0Schema.safeParse(previous).success || !SituationDefinitionV0Schema.safeParse(next).success) {
    return { valid: false, reasonCodes: ['definition_schema_invalid'] };
  }
  if (previous.situationId !== next.situationId) reasons.push('successor_situation_mismatch');
  if (next.versionOrdinal !== previous.versionOrdinal + 1) reasons.push('successor_version_not_monotonic');
  const previousRef = safeRecordRef(previous);
  if (!previousRef) reasons.push('predecessor_definition_digest_invalid');
  if (next.predecessorDefinitionRef === null) reasons.push('successor_missing_predecessor_ref');
  else if (previousRef && !sameRecordRef(next.predecessorDefinitionRef, previousRef)) reasons.push('successor_predecessor_ref_mismatch');
  return { valid: reasons.length === 0, reasonCodes: unique(reasons) };
}

export function validateEvaluationSnapshotAgainstDefinitionV0(
  definition: SituationDefinitionV0,
  snapshot: SituationEvaluationSnapshotV0,
): ConformanceResultV0 {
  const reasons: string[] = [];
  if (!SituationDefinitionV0Schema.safeParse(definition).success) reasons.push('snapshot_definition_schema_invalid');
  if (!SituationEvaluationSnapshotV0Schema.safeParse(snapshot).success) reasons.push('snapshot_schema_invalid');
  const definitionRef = safeRecordRef(definition);
  if (!definitionRef) reasons.push('snapshot_definition_digest_invalid');
  if (snapshot.situationId !== definition.situationId) reasons.push('snapshot_situation_mismatch');
  if (definitionRef && !sameRecordRef(snapshot.definitionRef, definitionRef)) reasons.push('snapshot_definition_ref_mismatch');
  if (Date.parse(snapshot.knownAtCutoff) > Date.parse(snapshot.asOf)) reasons.push('snapshot_cutoff_after_as_of');

  const declaredStates = new Set(definition.competingStates.map((state) => state.stateId));
  const supportIds = snapshot.stateSupport.map((state) => state.stateId);
  if (new Set(supportIds).size !== supportIds.length) reasons.push('snapshot_duplicate_state_support');
  if (supportIds.some((state) => !declaredStates.has(state))) reasons.push('snapshot_undeclared_state_support');
  if (Array.from(declaredStates).some((state) => !supportIds.includes(state))) reasons.push('snapshot_missing_state_support');
  if (snapshot.resolvedStateIds.some((state) => !declaredStates.has(state))) reasons.push('snapshot_undeclared_resolved_state');

  const declaredWitnesses = new Set(definition.resolutionWitnesses.map((witness) => witness.witnessId));
  for (const result of snapshot.witnessResults) {
    if (!declaredWitnesses.has(result.witnessId)) reasons.push('snapshot_undeclared_witness_result');
    if (result.effects.some((effect) => !declaredStates.has(effect.stateId))) reasons.push('snapshot_witness_effect_undeclared_state');
  }

  const resolvedLike = snapshot.resolutionState === 'RESOLVED' || snapshot.resolutionState === 'PARTIALLY_RESOLVED';
  if (resolvedLike && snapshot.resolvedStateIds.length === 0) reasons.push('snapshot_resolved_state_missing_ids');
  if (!resolvedLike && snapshot.resolvedStateIds.length > 0) reasons.push('snapshot_unresolved_state_carries_resolved_ids');
  return { valid: reasons.length === 0, reasonCodes: unique(reasons) };
}

export function validateResolutionReceiptAgainstSnapshotV0(
  definition: SituationDefinitionV0,
  snapshot: SituationEvaluationSnapshotV0,
  receipt: SituationResolutionReceiptV0,
): ConformanceResultV0 {
  const reasons = [...validateEvaluationSnapshotAgainstDefinitionV0(definition, snapshot).reasonCodes];
  if (!SituationResolutionReceiptV0Schema.safeParse(receipt).success) reasons.push('resolution_receipt_schema_invalid');
  if (receipt.situationId !== definition.situationId || snapshot.situationId !== definition.situationId) reasons.push('resolution_situation_mismatch');

  const definitionRef = safeRecordRef(definition);
  if (!definitionRef) reasons.push('resolution_definition_digest_invalid');
  else if (!sameRecordRef(receipt.definitionRef, definitionRef)) reasons.push('resolution_definition_ref_mismatch');

  if (snapshot.resolutionState !== 'RESOLVED') reasons.push('resolution_receipt_requires_resolved_snapshot');
  const snapshotStates = [...snapshot.resolvedStateIds].sort();
  const receiptStates = [...receipt.resolvedStateIds].sort();
  if (JSON.stringify(snapshotStates) !== JSON.stringify(receiptStates)) reasons.push('resolution_state_ids_mismatch');

  const snapshotRef = safeRecordRef(snapshot);
  if (!snapshotRef) reasons.push('resolution_snapshot_digest_invalid');
  else if (!sameRecordRef(receipt.finalSnapshotRef, snapshotRef)) reasons.push('resolution_final_snapshot_ref_mismatch');

  const declaredStateIds = new Set(definition.competingStates.map((state) => state.stateId));
  if (receipt.resolvedStateIds.some((state) => !declaredStateIds.has(state))) reasons.push('resolution_undeclared_state');
  const observedWitnessIds = new Set(snapshot.witnessResults.map((result) => result.witnessId));
  if (receipt.finalWitnesses.some((id) => !observedWitnessIds.has(id))) reasons.push('resolution_final_witness_missing_from_snapshot');
  if (receipt.resolutionBasis.some((id) => !observedWitnessIds.has(id))) reasons.push('resolution_basis_missing_from_snapshot');
  if (Date.parse(receipt.knownAt) < Date.parse(snapshot.knownAtCutoff)) reasons.push('resolution_known_at_precedes_snapshot_cutoff');
  return { valid: reasons.length === 0, reasonCodes: unique(reasons) };
}

export function validateReopenReceiptV0(
  resolution: SituationResolutionReceiptV0,
  reopen: SituationReopenReceiptV0,
): ConformanceResultV0 {
  const reasons: string[] = [];
  if (!SituationReopenReceiptV0Schema.safeParse(reopen).success) reasons.push('reopen_receipt_schema_invalid');
  if (reopen.situationId !== resolution.situationId) reasons.push('reopen_situation_mismatch');
  const resolutionRef = safeRecordRef(resolution);
  if (!resolutionRef) reasons.push('reopen_resolution_digest_invalid');
  else if (!sameRecordRef(reopen.priorResolutionRef, resolutionRef)) reasons.push('reopen_prior_resolution_ref_mismatch');
  if (!resolution.reopenConditions.includes(reopen.cause)) reasons.push('reopen_cause_not_predeclared');
  if (Date.parse(reopen.knownAt) < Date.parse(resolution.knownAt)) reasons.push('reopen_known_at_precedes_resolution');
  return { valid: reasons.length === 0, reasonCodes: unique(reasons) };
}

export function validateCorrectionReceiptV0(
  correction: SituationCorrectionReceiptV0,
  corrected: UsrRecordV0,
  replacement: UsrRecordV0,
): ConformanceResultV0 {
  const reasons: string[] = [];
  if (!SituationCorrectionReceiptV0Schema.safeParse(correction).success) reasons.push('correction_receipt_schema_invalid');
  if (correction.situationId !== recordSituationId(corrected) || correction.situationId !== recordSituationId(replacement)) {
    reasons.push('correction_situation_mismatch');
  }
  if (corrected.schemaVersion !== replacement.schemaVersion) reasons.push('correction_replacement_schema_mismatch');
  if (recordStableId(corrected) === recordStableId(replacement)) reasons.push('correction_replacement_reuses_record_id');
  if (corrected.recordDigest === replacement.recordDigest) reasons.push('correction_replacement_digest_unchanged');

  const correctedRef = safeRecordRef(corrected);
  const replacementRef = safeRecordRef(replacement);
  if (!correctedRef) reasons.push('correction_corrected_digest_invalid');
  else if (!sameRecordRef(correction.correctedRecordRef, correctedRef)) reasons.push('correction_corrected_ref_mismatch');
  if (!replacementRef) reasons.push('correction_replacement_digest_invalid');
  else if (!sameRecordRef(correction.replacementRecordRef, replacementRef)) reasons.push('correction_replacement_ref_mismatch');
  return { valid: reasons.length === 0, reasonCodes: unique(reasons) };
}

export function validateScenarioBindingConformanceV0(
  definition: SituationDefinitionV0,
  binding: ScenarioBranchBindingV0,
): ConformanceResultV0 {
  const reasons: string[] = [];
  const parsed = ScenarioBranchBindingV0Schema.safeParse(binding);
  if (!parsed.success) reasons.push(...parsed.error.issues.map((issue) => `schema:${issue.message}`));
  if (!verifyUsrDigest(binding as unknown as { recordDigest: string } & Record<string, unknown>)) reasons.push('record_digest_mismatch');
  const definitionRef = safeRecordRef(definition);
  if (!definitionRef) reasons.push('scenario_definition_digest_invalid');
  else if (!sameRecordRef(binding.definitionRef, definitionRef)) reasons.push('scenario_definition_ref_mismatch');
  reasons.push(...validateScenarioBranchBindingV0(definition, binding).reasonCodes);
  return { valid: reasons.length === 0, reasonCodes: unique(reasons) };
}

function referenceKey(ref: UsrRecordRefV0): string {
  return `${ref.schemaVersion}|${ref.recordId}|${ref.recordDigest}`;
}

export function validateUsrAppendOnlySequenceV0(records: UsrRecordV0[]): ConformanceResultV0 {
  const reasons: string[] = [];
  const seenStableIds = new Set<string>();
  const seenDigests = new Set<string>();
  const seenRecords = new Map<string, UsrRecordV0>();

  for (const record of records) {
    const stableId = recordStableId(record);
    const recordValidation = validateUsrRecordV0(record);
    if (!recordValidation.valid) reasons.push(...recordValidation.reasonCodes.map((reason) => `${stableId}:${reason}`));
    if (seenStableIds.has(stableId)) reasons.push(`duplicate_record_id:${stableId}`);
    if (seenDigests.has(record.recordDigest)) reasons.push(`duplicate_record_digest:${record.recordDigest}`);

    if (record.schemaVersion === 'ffcc.usr.situation-definition.v0.1.0' && record.predecessorDefinitionRef) {
      const predecessor = seenRecords.get(referenceKey(record.predecessorDefinitionRef));
      if (!predecessor) reasons.push(`${stableId}:predecessor_definition_not_prior`);
      else if (predecessor.schemaVersion !== 'ffcc.usr.situation-definition.v0.1.0') reasons.push(`${stableId}:predecessor_definition_wrong_type`);
      else reasons.push(...validateDefinitionSuccessorV0(predecessor, record).reasonCodes.map((reason) => `${stableId}:${reason}`));
    }

    if (record.schemaVersion === 'ffcc.usr.evaluation-snapshot.v0.1.0') {
      const definition = seenRecords.get(referenceKey(record.definitionRef));
      if (!definition) reasons.push(`${stableId}:definition_ref_not_prior`);
      else if (definition.schemaVersion !== 'ffcc.usr.situation-definition.v0.1.0') reasons.push(`${stableId}:definition_ref_wrong_type`);
      else reasons.push(...validateEvaluationSnapshotAgainstDefinitionV0(definition, record).reasonCodes.map((reason) => `${stableId}:${reason}`));
      if (record.priorSnapshotRef) {
        const prior = seenRecords.get(referenceKey(record.priorSnapshotRef));
        if (!prior) reasons.push(`${stableId}:prior_snapshot_not_prior`);
        else if (prior.schemaVersion !== 'ffcc.usr.evaluation-snapshot.v0.1.0') reasons.push(`${stableId}:prior_snapshot_wrong_type`);
        else if (prior.situationId !== record.situationId) reasons.push(`${stableId}:prior_snapshot_situation_mismatch`);
      }
    }

    if (record.schemaVersion === 'ffcc.usr.resolution-receipt.v0.1.0') {
      const definition = seenRecords.get(referenceKey(record.definitionRef));
      const snapshot = seenRecords.get(referenceKey(record.finalSnapshotRef));
      if (!definition) reasons.push(`${stableId}:definition_ref_not_prior`);
      if (!snapshot) reasons.push(`${stableId}:final_snapshot_not_prior`);
      if (definition && snapshot) {
        if (definition.schemaVersion !== 'ffcc.usr.situation-definition.v0.1.0') reasons.push(`${stableId}:definition_ref_wrong_type`);
        else if (snapshot.schemaVersion !== 'ffcc.usr.evaluation-snapshot.v0.1.0') reasons.push(`${stableId}:final_snapshot_wrong_type`);
        else reasons.push(...validateResolutionReceiptAgainstSnapshotV0(definition, snapshot, record).reasonCodes.map((reason) => `${stableId}:${reason}`));
      }
    }

    if (record.schemaVersion === 'ffcc.usr.reopen-receipt.v0.1.0') {
      const resolution = seenRecords.get(referenceKey(record.priorResolutionRef));
      if (!resolution) reasons.push(`${stableId}:prior_resolution_not_prior`);
      else if (resolution.schemaVersion !== 'ffcc.usr.resolution-receipt.v0.1.0') reasons.push(`${stableId}:prior_resolution_wrong_type`);
      else reasons.push(...validateReopenReceiptV0(resolution, record).reasonCodes.map((reason) => `${stableId}:${reason}`));
    }

    if (record.schemaVersion === 'ffcc.usr.correction-receipt.v0.1.0') {
      const corrected = seenRecords.get(referenceKey(record.correctedRecordRef));
      const replacement = seenRecords.get(referenceKey(record.replacementRecordRef));
      if (!corrected) reasons.push(`${stableId}:corrected_record_not_prior`);
      if (!replacement) reasons.push(`${stableId}:replacement_record_not_prior`);
      if (corrected && replacement) {
        reasons.push(...validateCorrectionReceiptV0(record, corrected, replacement).reasonCodes.map((reason) => `${stableId}:${reason}`));
      }
    }

    if (record.schemaVersion === 'ffcc.usr.scenario-branch-binding.v0.1.0') {
      const definition = seenRecords.get(referenceKey(record.definitionRef));
      if (!definition) reasons.push(`${stableId}:definition_ref_not_prior`);
      else if (definition.schemaVersion !== 'ffcc.usr.situation-definition.v0.1.0') reasons.push(`${stableId}:definition_ref_wrong_type`);
      else reasons.push(...validateScenarioBindingConformanceV0(definition, record).reasonCodes.map((reason) => `${stableId}:${reason}`));
    }

    seenStableIds.add(stableId);
    seenDigests.add(record.recordDigest);
    const ref = safeRecordRef(record);
    if (ref) seenRecords.set(referenceKey(ref), record);
  }

  return { valid: reasons.length === 0, reasonCodes: unique(reasons) };
}
