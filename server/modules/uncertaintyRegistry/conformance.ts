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

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function sameRecordRef(left: UsrRecordRefV0, right: UsrRecordRefV0): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.recordId === right.recordId
    && left.recordDigest === right.recordDigest;
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

export function validateUsrRecordV0(record: unknown): ConformanceResultV0 {
  const parsed = UsrRecordV0Schema.safeParse(record);
  if (!parsed.success) {
    return {
      valid: false,
      reasonCodes: unique(parsed.error.issues.map((issue) => `schema:${issue.message}`)),
    };
  }
  if (!verifyUsrDigest(parsed.data as unknown as { recordDigest: string } & Record<string, unknown>)) {
    return { valid: false, reasonCodes: ['record_digest_mismatch'] };
  }
  return { valid: true, reasonCodes: [] };
}

export function validateDefinitionSuccessorV0(
  previous: SituationDefinitionV0,
  next: SituationDefinitionV0,
): ConformanceResultV0 {
  const reasons: string[] = [];
  if (!SituationDefinitionV0Schema.safeParse(previous).success || !SituationDefinitionV0Schema.safeParse(next).success) {
    reasons.push('definition_schema_invalid');
    return { valid: false, reasonCodes: reasons };
  }
  if (previous.situationId !== next.situationId) reasons.push('successor_situation_mismatch');
  if (next.versionOrdinal !== previous.versionOrdinal + 1) reasons.push('successor_version_not_monotonic');
  if (next.predecessorDefinitionRef === null) reasons.push('successor_missing_predecessor_ref');
  else if (!sameRecordRef(next.predecessorDefinitionRef, usrRecordRef(previous as unknown as Record<string, unknown> & { schemaVersion: string; recordDigest: string }))) {
    reasons.push('successor_predecessor_ref_mismatch');
  }
  return { valid: reasons.length === 0, reasonCodes: unique(reasons) };
}

export function validateResolutionReceiptAgainstSnapshotV0(
  definition: SituationDefinitionV0,
  snapshot: SituationEvaluationSnapshotV0,
  receipt: SituationResolutionReceiptV0,
): ConformanceResultV0 {
  const reasons: string[] = [];
  if (!SituationResolutionReceiptV0Schema.safeParse(receipt).success) reasons.push('resolution_receipt_schema_invalid');
  if (!SituationEvaluationSnapshotV0Schema.safeParse(snapshot).success) reasons.push('resolution_snapshot_schema_invalid');
  if (receipt.situationId !== definition.situationId || snapshot.situationId !== definition.situationId) {
    reasons.push('resolution_situation_mismatch');
  }
  if (snapshot.resolutionState !== 'RESOLVED') reasons.push('resolution_receipt_requires_resolved_snapshot');
  const snapshotStates = [...snapshot.resolvedStateIds].sort();
  const receiptStates = [...receipt.resolvedStateIds].sort();
  if (JSON.stringify(snapshotStates) !== JSON.stringify(receiptStates)) reasons.push('resolution_state_ids_mismatch');
  const snapshotRef = usrRecordRef(snapshot as unknown as Record<string, unknown> & { schemaVersion: string; recordDigest: string });
  if (!sameRecordRef(receipt.finalSnapshotRef, snapshotRef)) reasons.push('resolution_final_snapshot_ref_mismatch');
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
  const resolutionRef = usrRecordRef(resolution as unknown as Record<string, unknown> & { schemaVersion: string; recordDigest: string });
  if (!sameRecordRef(reopen.priorResolutionRef, resolutionRef)) reasons.push('reopen_prior_resolution_ref_mismatch');
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
  if (recordStableId(corrected) === recordStableId(replacement)) reasons.push('correction_replacement_reuses_record_id');
  if (corrected.recordDigest === replacement.recordDigest) reasons.push('correction_replacement_digest_unchanged');
  if (!sameRecordRef(correction.correctedRecordRef, usrRecordRef(corrected as unknown as Record<string, unknown> & { schemaVersion: string; recordDigest: string }))) {
    reasons.push('correction_corrected_ref_mismatch');
  }
  if (!sameRecordRef(correction.replacementRecordRef, usrRecordRef(replacement as unknown as Record<string, unknown> & { schemaVersion: string; recordDigest: string }))) {
    reasons.push('correction_replacement_ref_mismatch');
  }
  return { valid: reasons.length === 0, reasonCodes: unique(reasons) };
}

export function validateScenarioBindingConformanceV0(
  definition: SituationDefinitionV0,
  binding: ScenarioBranchBindingV0,
): ConformanceResultV0 {
  const parsed = ScenarioBranchBindingV0Schema.safeParse(binding);
  if (!parsed.success) {
    return { valid: false, reasonCodes: unique(parsed.error.issues.map((issue) => `schema:${issue.message}`)) };
  }
  if (!verifyUsrDigest(binding as unknown as { recordDigest: string } & Record<string, unknown>)) {
    return { valid: false, reasonCodes: ['record_digest_mismatch'] };
  }
  return validateScenarioBranchBindingV0(definition, binding);
}

function referenceKey(ref: UsrRecordRefV0): string {
  return `${ref.schemaVersion}|${ref.recordId}|${ref.recordDigest}`;
}

export function validateUsrAppendOnlySequenceV0(records: UsrRecordV0[]): ConformanceResultV0 {
  const reasons: string[] = [];
  const seenStableIds = new Set<string>();
  const seenDigests = new Set<string>();
  const seenRefs = new Set<string>();

  for (const record of records) {
    const recordValidation = validateUsrRecordV0(record);
    if (!recordValidation.valid) reasons.push(...recordValidation.reasonCodes.map((reason) => `${recordStableId(record)}:${reason}`));

    const stableId = recordStableId(record);
    if (seenStableIds.has(stableId)) reasons.push(`duplicate_record_id:${stableId}`);
    if (seenDigests.has(record.recordDigest)) reasons.push(`duplicate_record_digest:${record.recordDigest}`);

    if (record.schemaVersion === 'ffcc.usr.situation-definition.v0.1.0' && record.predecessorDefinitionRef) {
      if (!seenRefs.has(referenceKey(record.predecessorDefinitionRef))) reasons.push(`${stableId}:predecessor_definition_not_prior`);
    }
    if (record.schemaVersion === 'ffcc.usr.evaluation-snapshot.v0.1.0') {
      if (!seenRefs.has(referenceKey(record.definitionRef))) reasons.push(`${stableId}:definition_ref_not_prior`);
      if (record.priorSnapshotRef && !seenRefs.has(referenceKey(record.priorSnapshotRef))) reasons.push(`${stableId}:prior_snapshot_not_prior`);
    }
    if (record.schemaVersion === 'ffcc.usr.resolution-receipt.v0.1.0') {
      if (!seenRefs.has(referenceKey(record.definitionRef))) reasons.push(`${stableId}:definition_ref_not_prior`);
      if (!seenRefs.has(referenceKey(record.finalSnapshotRef))) reasons.push(`${stableId}:final_snapshot_not_prior`);
    }
    if (record.schemaVersion === 'ffcc.usr.reopen-receipt.v0.1.0') {
      if (!seenRefs.has(referenceKey(record.priorResolutionRef))) reasons.push(`${stableId}:prior_resolution_not_prior`);
    }
    if (record.schemaVersion === 'ffcc.usr.correction-receipt.v0.1.0') {
      if (!seenRefs.has(referenceKey(record.correctedRecordRef))) reasons.push(`${stableId}:corrected_record_not_prior`);
      if (!seenRefs.has(referenceKey(record.replacementRecordRef))) reasons.push(`${stableId}:replacement_record_not_prior`);
    }
    if (record.schemaVersion === 'ffcc.usr.scenario-branch-binding.v0.1.0') {
      if (!seenRefs.has(referenceKey(record.definitionRef))) reasons.push(`${stableId}:definition_ref_not_prior`);
    }

    seenStableIds.add(stableId);
    seenDigests.add(record.recordDigest);
    seenRefs.add(referenceKey(usrRecordRef(record as unknown as Record<string, unknown> & { schemaVersion: string; recordDigest: string })));
  }

  return { valid: reasons.length === 0, reasonCodes: unique(reasons) };
}
