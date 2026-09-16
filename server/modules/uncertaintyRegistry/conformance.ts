import {
  OperatorSituationOverlayV0Schema,
  ScenarioBranchBindingV0Schema,
  SituationCorrectionReceiptV0Schema,
  SituationDefinitionV0Schema,
  SituationEvaluationSnapshotV0Schema,
  SituationReopenReceiptV0Schema,
  SituationResolutionReceiptV0Schema,
  type OperatorSituationOverlayV0,
  type ScenarioBranchBindingV0,
  type SituationCorrectionReceiptV0,
  type SituationDefinitionV0,
  type SituationEvaluationSnapshotV0,
  type SituationReopenReceiptV0,
  type SituationResolutionReceiptV0,
  type UsrRecordRefV0,
} from './contracts';
import { assertUsrRecordDigest } from './canonicalization';
import { validateScenarioBranchBindingV0 } from './policy';

export type UsrConformanceResultV0 = {
  valid: boolean;
  reasonCodes: string[];
};

export type UsrHistoryBundleV0 = {
  definitions: SituationDefinitionV0[];
  snapshots: SituationEvaluationSnapshotV0[];
  resolutionReceipts: SituationResolutionReceiptV0[];
  reopenReceipts: SituationReopenReceiptV0[];
  correctionReceipts: SituationCorrectionReceiptV0[];
  scenarioBindings: ScenarioBranchBindingV0[];
  operatorOverlays: OperatorSituationOverlayV0[];
};

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function definitionRecordIdV0(definition: SituationDefinitionV0): string {
  return `${definition.situationId}:definition:v${definition.versionOrdinal}`;
}

export function makeUsrRecordRefV0(
  recordType: UsrRecordRefV0['recordType'],
  recordId: string,
  recordDigest: string,
): UsrRecordRefV0 {
  return { kind: 'usr_record', recordType, recordId, recordDigest };
}

export function definitionRecordRefV0(definition: SituationDefinitionV0): UsrRecordRefV0 {
  return makeUsrRecordRefV0('situation_definition', definitionRecordIdV0(definition), definition.recordDigest);
}

function recordKey(ref: UsrRecordRefV0): string {
  return `${ref.recordType}|${ref.recordId}|${ref.recordDigest}`;
}

function recordIdentity(record: unknown): { recordType: UsrRecordRefV0['recordType']; recordId: string; recordDigest: string } | null {
  const candidate = record as Record<string, unknown>;
  if (candidate.schemaVersion === 'ffcc.usr.situation-definition.v0.1.0') {
    const parsed = SituationDefinitionV0Schema.parse(candidate);
    return { recordType: 'situation_definition', recordId: definitionRecordIdV0(parsed), recordDigest: parsed.recordDigest };
  }
  if (candidate.schemaVersion === 'ffcc.usr.evaluation-snapshot.v0.1.0') {
    const parsed = SituationEvaluationSnapshotV0Schema.parse(candidate);
    return { recordType: 'evaluation_snapshot', recordId: parsed.snapshotId, recordDigest: parsed.recordDigest };
  }
  if (candidate.schemaVersion === 'ffcc.usr.resolution-receipt.v0.1.0') {
    const parsed = SituationResolutionReceiptV0Schema.parse(candidate);
    return { recordType: 'resolution_receipt', recordId: parsed.receiptId, recordDigest: parsed.recordDigest };
  }
  if (candidate.schemaVersion === 'ffcc.usr.reopen-receipt.v0.1.0') {
    const parsed = SituationReopenReceiptV0Schema.parse(candidate);
    return { recordType: 'reopen_receipt', recordId: parsed.receiptId, recordDigest: parsed.recordDigest };
  }
  if (candidate.schemaVersion === 'ffcc.usr.correction-receipt.v0.1.0') {
    const parsed = SituationCorrectionReceiptV0Schema.parse(candidate);
    return { recordType: 'correction_receipt', recordId: parsed.receiptId, recordDigest: parsed.recordDigest };
  }
  if (candidate.schemaVersion === 'ffcc.usr.scenario-branch-binding.v0.1.0') {
    const parsed = ScenarioBranchBindingV0Schema.parse(candidate);
    return { recordType: 'scenario_branch_binding', recordId: parsed.bindingId, recordDigest: parsed.recordDigest };
  }
  if (candidate.schemaVersion === 'ffcc.usr.operator-overlay.v0.1.0') {
    const parsed = OperatorSituationOverlayV0Schema.parse(candidate);
    return { recordType: 'operator_overlay', recordId: parsed.overlayId, recordDigest: parsed.recordDigest };
  }
  return null;
}

export function validateEvaluationSnapshotAgainstDefinitionV0(
  definitionInput: SituationDefinitionV0,
  snapshotInput: SituationEvaluationSnapshotV0,
): UsrConformanceResultV0 {
  const reasons: string[] = [];
  const definition = SituationDefinitionV0Schema.parse(definitionInput);
  const snapshot = SituationEvaluationSnapshotV0Schema.parse(snapshotInput);
  if (snapshot.situationId !== definition.situationId) reasons.push('snapshot_situation_mismatch');
  if (recordKey(snapshot.definitionRef) !== recordKey(definitionRecordRefV0(definition))) reasons.push('snapshot_definition_ref_mismatch');

  const states = new Set(definition.competingStates.map((state) => state.stateId));
  const witnesses = new Set(definition.resolutionWitnesses.map((witness) => witness.witnessId));
  if (snapshot.stateSupport.some((row) => !states.has(row.stateId))) reasons.push('snapshot_supports_undeclared_state');
  if (snapshot.resolvedStateIds.some((stateId) => !states.has(stateId))) reasons.push('snapshot_resolves_undeclared_state');
  if (snapshot.witnessResults.some((row) => !witnesses.has(row.witnessId))) reasons.push('snapshot_contains_undeclared_witness');

  return { valid: reasons.length === 0, reasonCodes: distinct(reasons) };
}

export function validateUsrHistoryV0(bundleInput: UsrHistoryBundleV0): UsrConformanceResultV0 {
  const reasons: string[] = [];
  const bundle: UsrHistoryBundleV0 = {
    definitions: bundleInput.definitions.map((row) => SituationDefinitionV0Schema.parse(row)),
    snapshots: bundleInput.snapshots.map((row) => SituationEvaluationSnapshotV0Schema.parse(row)),
    resolutionReceipts: bundleInput.resolutionReceipts.map((row) => SituationResolutionReceiptV0Schema.parse(row)),
    reopenReceipts: bundleInput.reopenReceipts.map((row) => SituationReopenReceiptV0Schema.parse(row)),
    correctionReceipts: bundleInput.correctionReceipts.map((row) => SituationCorrectionReceiptV0Schema.parse(row)),
    scenarioBindings: bundleInput.scenarioBindings.map((row) => ScenarioBranchBindingV0Schema.parse(row)),
    operatorOverlays: bundleInput.operatorOverlays.map((row) => OperatorSituationOverlayV0Schema.parse(row)),
  };

  const allRecords: unknown[] = [
    ...bundle.definitions,
    ...bundle.snapshots,
    ...bundle.resolutionReceipts,
    ...bundle.reopenReceipts,
    ...bundle.correctionReceipts,
    ...bundle.scenarioBindings,
    ...bundle.operatorOverlays,
  ];

  const logicalIds = new Map<string, string>();
  const existingRefs = new Set<string>();
  for (const record of allRecords) {
    try {
      assertUsrRecordDigest(record as Record<string, unknown>);
    } catch {
      reasons.push('record_digest_invalid');
    }
    const identity = recordIdentity(record);
    if (!identity) {
      reasons.push('unknown_usr_record_type');
      continue;
    }
    const logicalKey = `${identity.recordType}|${identity.recordId}`;
    const priorDigest = logicalIds.get(logicalKey);
    if (priorDigest && priorDigest !== identity.recordDigest) reasons.push('record_id_reused_with_different_content');
    if (priorDigest && priorDigest === identity.recordDigest) reasons.push('duplicate_record_append');
    logicalIds.set(logicalKey, identity.recordDigest);
    existingRefs.add(`${logicalKey}|${identity.recordDigest}`);
  }

  const definitionsByRef = new Map(bundle.definitions.map((definition) => [recordKey(definitionRecordRefV0(definition)), definition]));
  for (const snapshot of bundle.snapshots) {
    const definition = definitionsByRef.get(recordKey(snapshot.definitionRef));
    if (!definition) {
      reasons.push('snapshot_definition_missing');
      continue;
    }
    reasons.push(...validateEvaluationSnapshotAgainstDefinitionV0(definition, snapshot).reasonCodes);
    if (snapshot.priorSnapshotRef && !existingRefs.has(recordKey(snapshot.priorSnapshotRef))) reasons.push('prior_snapshot_ref_missing');
  }

  for (const receipt of bundle.resolutionReceipts) {
    if (!definitionsByRef.has(recordKey(receipt.definitionRef))) reasons.push('resolution_definition_missing');
    if (!existingRefs.has(recordKey(receipt.finalSnapshotRef))) reasons.push('resolution_final_snapshot_missing');
  }

  for (const receipt of bundle.reopenReceipts) {
    if (!existingRefs.has(recordKey(receipt.priorResolutionReceiptRef))) reasons.push('reopen_resolution_ref_missing');
  }

  for (const receipt of bundle.correctionReceipts) {
    if (!existingRefs.has(recordKey(receipt.targetRecordRef))) reasons.push('correction_target_missing');
    if (!existingRefs.has(recordKey(receipt.replacementRecordRef))) reasons.push('correction_replacement_missing');
    if (recordKey(receipt.targetRecordRef) === recordKey(receipt.replacementRecordRef)) reasons.push('correction_cannot_replace_record_with_itself');
  }

  for (const binding of bundle.scenarioBindings) {
    const definition = definitionsByRef.get(recordKey(binding.definitionRef));
    if (!definition) {
      reasons.push('scenario_definition_missing');
      continue;
    }
    reasons.push(...validateScenarioBranchBindingV0(definition, binding).reasonCodes);
  }

  for (const overlay of bundle.operatorOverlays) {
    if (!bundle.definitions.some((definition) => definition.situationId === overlay.situationId)) reasons.push('overlay_situation_missing');
  }

  return { valid: reasons.length === 0, reasonCodes: distinct(reasons) };
}
