import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import type { ContractLeagueSnapshotRow } from '@shared/contractLeagueSchema';
import { contractLeagueSnapshotSchema } from './contracts';
import { fingerprintContractLeagueSnapshot } from './persistenceContract';
import { contractLeaguePolicySchema } from './policy';
import { contractLeagueRightsStateSchema } from './rights';

export const CONTRACT_DECISION_EVIDENCE_PACKET_VERSION = 'contract-decision-evidence-packet.v1' as const;

export type ContractDecisionFamily =
  | 'TRANSACTION'
  | 'RESTRUCTURE'
  | 'RE_SIGN'
  | 'TAG'
  | 'OPTION'
  | 'FREE_AGENCY'
  | 'CAP_PLAN';

export type ContractDecisionScoringEvidence = {
  certificationStatus: string;
  fingerprint: string | null;
  asOf: string | null;
};

export type ContractDecisionConsequence = {
  status: 'READY' | 'ABSTAIN';
  engineVersion: string;
  fingerprint: string;
  legal?: boolean;
  [key: string]: unknown;
};

export type BuildContractDecisionEvidencePacketInput = {
  leagueKey: string;
  decisionAt: string;
  decisionFamily: ContractDecisionFamily;
  leagueContextFingerprint: string;
  economicSnapshot: ContractLeagueSnapshotRow;
  policy: unknown;
  rightsState?: unknown | null;
  scoring: ContractDecisionScoringEvidence | null;
  requiresScoring?: boolean;
  action: unknown;
  consequence: unknown;
  materiallyMissingEvidence?: string[];
};

export type ContractDecisionEvidencePacketV1 = {
  schemaVersion: typeof CONTRACT_DECISION_EVIDENCE_PACKET_VERSION;
  leagueKey: string;
  decisionAt: string;
  decisionFamily: ContractDecisionFamily;
  leagueContextFingerprint: string;
  economicSnapshot: {
    id: string;
    schemaVersion: string;
    fingerprint: string;
    validationStatus: string;
    importedAt: string;
    sourceModifiedAt: string | null;
    persistedAt: string;
    supersedesSnapshotId: string | null;
  };
  policy: {
    policyVersion: string | null;
    fingerprint: string;
    validationStatus: string | null;
    effectiveSeason: number | null;
    effectiveFrom: string | null;
    effectiveUntil: string | null;
  };
  rights: null | {
    schemaVersion: string;
    fingerprint: string;
    validationStatus: string;
    asOf: string;
  };
  scoring: ContractDecisionScoringEvidence | null;
  action: unknown;
  consequence: ContractDecisionConsequence | unknown;
  materiallyMissingEvidence: string[];
  readiness: {
    readyForCcf: boolean;
    executable: boolean;
    blockers: string[];
  };
  fingerprint: string;
};

function deterministicFingerprint(value: unknown): string {
  const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null';
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.valueOf()) ? parsed.toISOString() : null;
}

function afterDecision(value: string | null, decisionMs: number): boolean {
  if (!value) return false;
  const parsed = new Date(value).valueOf();
  return Number.isFinite(parsed) && parsed > decisionMs;
}

function consequenceShape(value: unknown): ContractDecisionConsequence | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!['READY', 'ABSTAIN'].includes(String(record.status))) return null;
  if (typeof record.engineVersion !== 'string' || !record.engineVersion.trim()) return null;
  if (typeof record.fingerprint !== 'string' || !record.fingerprint.startsWith('sha256:')) return null;
  return value as ContractDecisionConsequence;
}

/**
 * Freezes the contract-specific evidence/consequence slice that Canonical
 * Decision Packet v1 passes identically to CCF and any challengers.
 *
 * This is a composition layer only: deterministic contract engines continue to
 * own legality/cap math, while CCF remains the sole recommendation authority.
 * The packet never repairs or guesses missing league evidence.
 */
export function buildContractDecisionEvidencePacket(
  input: BuildContractDecisionEvidencePacketInput,
): ContractDecisionEvidencePacketV1 {
  const blockers: string[] = [];
  const leagueKey = input.leagueKey.trim();
  if (!leagueKey) blockers.push('LEAGUE_KEY_REQUIRED');

  const decisionAt = iso(input.decisionAt);
  const decisionMs = decisionAt ? new Date(decisionAt).valueOf() : Number.NaN;
  if (!decisionAt) blockers.push('DECISION_TIME_INVALID');

  if (!input.leagueContextFingerprint.trim()) blockers.push('LEAGUE_CONTEXT_FINGERPRINT_REQUIRED');
  if (input.economicSnapshot.leagueKey !== leagueKey) blockers.push('ECONOMIC_SNAPSHOT_LEAGUE_MISMATCH');
  if (input.economicSnapshot.validationStatus !== 'VALID') blockers.push('ECONOMIC_SNAPSHOT_NOT_VALID');

  const snapshotResult = contractLeagueSnapshotSchema.safeParse(input.economicSnapshot.snapshotPayload);
  if (!snapshotResult.success) {
    blockers.push('ECONOMIC_SNAPSHOT_PAYLOAD_INVALID');
  } else {
    const computed = fingerprintContractLeagueSnapshot(snapshotResult.data);
    if (computed !== input.economicSnapshot.fingerprint) blockers.push('ECONOMIC_SNAPSHOT_FINGERPRINT_MISMATCH');
    if (snapshotResult.data.validation.status !== 'VALID') blockers.push('ECONOMIC_SNAPSHOT_PAYLOAD_NOT_VALID');
    if (Number.isFinite(decisionMs)) {
      if (afterDecision(snapshotResult.data.provenance.importedAt, decisionMs)) blockers.push('ECONOMIC_SNAPSHOT_IMPORTED_AFTER_DECISION');
      if (afterDecision(snapshotResult.data.provenance.sourceModifiedAt, decisionMs)) blockers.push('ECONOMIC_SNAPSHOT_SOURCE_MODIFIED_AFTER_DECISION');
    }
  }

  const policyResult = contractLeaguePolicySchema.safeParse(input.policy);
  const policyFingerprint = deterministicFingerprint(policyResult.success ? policyResult.data : input.policy);
  if (!policyResult.success) blockers.push('POLICY_INVALID');
  if (policyResult.success) {
    if (policyResult.data.validation.status !== 'VALID') blockers.push('POLICY_NOT_VALID');
    if (snapshotResult.success && policyResult.data.effective.season !== snapshotResult.data.league.season) {
      blockers.push('POLICY_SEASON_MISMATCH');
    }
    if (Number.isFinite(decisionMs)) {
      if (afterDecision(policyResult.data.provenance.importedAt, decisionMs)) blockers.push('POLICY_IMPORTED_AFTER_DECISION');
      if (afterDecision(policyResult.data.provenance.sourceModifiedAt, decisionMs)) blockers.push('POLICY_SOURCE_MODIFIED_AFTER_DECISION');
      const from = iso(policyResult.data.effective.effectiveFrom);
      const until = iso(policyResult.data.effective.effectiveUntil);
      if (!from || new Date(from).valueOf() > decisionMs || (until && new Date(until).valueOf() <= decisionMs)) {
        blockers.push('POLICY_NOT_EFFECTIVE');
      }
    }
  }

  const rightsResult = input.rightsState == null
    ? null
    : contractLeagueRightsStateSchema.safeParse(input.rightsState);
  if (rightsResult && !rightsResult.success) blockers.push('RIGHTS_STATE_INVALID');
  if (rightsResult?.success) {
    if (rightsResult.data.validation.status !== 'VALID') blockers.push('RIGHTS_STATE_NOT_VALID');
    if (rightsResult.data.leagueKey !== leagueKey) blockers.push('RIGHTS_STATE_LEAGUE_MISMATCH');
    if (Number.isFinite(decisionMs)) {
      if (afterDecision(rightsResult.data.asOf, decisionMs)) blockers.push('RIGHTS_STATE_AS_OF_AFTER_DECISION');
      if (afterDecision(rightsResult.data.provenance.importedAt, decisionMs)) blockers.push('RIGHTS_STATE_IMPORTED_AFTER_DECISION');
      if (afterDecision(rightsResult.data.provenance.sourceModifiedAt, decisionMs)) blockers.push('RIGHTS_STATE_SOURCE_MODIFIED_AFTER_DECISION');
    }
  }

  if (input.requiresScoring) {
    if (!input.scoring || input.scoring.certificationStatus !== 'certified' || !input.scoring.fingerprint) {
      blockers.push('SCORING_NOT_CERTIFIED');
    } else if (Number.isFinite(decisionMs) && afterDecision(input.scoring.asOf, decisionMs)) {
      blockers.push('SCORING_AS_OF_AFTER_DECISION');
    }
  }

  const consequence = consequenceShape(input.consequence);
  if (!consequence) blockers.push('CONSEQUENCE_INVALID');
  if (consequence?.status === 'ABSTAIN') blockers.push('CONSEQUENCE_ABSTAINED');

  const materiallyMissingEvidence = [...new Set((input.materiallyMissingEvidence ?? []).map((item) => item.trim()).filter(Boolean))];
  if (materiallyMissingEvidence.length > 0) blockers.push('MATERIALLY_MISSING_EVIDENCE');

  const economicImportedAt = iso(input.economicSnapshot.importedAt) ?? String(input.economicSnapshot.importedAt);
  const economicPersistedAt = iso(input.economicSnapshot.persistedAt) ?? String(input.economicSnapshot.persistedAt);
  const sourceModifiedAt = iso(input.economicSnapshot.sourceModifiedAt);

  const payload = {
    schemaVersion: CONTRACT_DECISION_EVIDENCE_PACKET_VERSION,
    leagueKey,
    decisionAt: decisionAt ?? input.decisionAt,
    decisionFamily: input.decisionFamily,
    leagueContextFingerprint: input.leagueContextFingerprint,
    economicSnapshot: {
      id: input.economicSnapshot.id,
      schemaVersion: input.economicSnapshot.schemaVersion,
      fingerprint: input.economicSnapshot.fingerprint,
      validationStatus: input.economicSnapshot.validationStatus,
      importedAt: economicImportedAt,
      sourceModifiedAt,
      persistedAt: economicPersistedAt,
      supersedesSnapshotId: input.economicSnapshot.supersedesSnapshotId,
    },
    policy: {
      policyVersion: policyResult.success ? policyResult.data.provenance.policyVersion : null,
      fingerprint: policyFingerprint,
      validationStatus: policyResult.success ? policyResult.data.validation.status : null,
      effectiveSeason: policyResult.success ? policyResult.data.effective.season : null,
      effectiveFrom: policyResult.success ? policyResult.data.effective.effectiveFrom : null,
      effectiveUntil: policyResult.success ? policyResult.data.effective.effectiveUntil : null,
    },
    rights: rightsResult?.success ? {
      schemaVersion: rightsResult.data.schemaVersion,
      fingerprint: deterministicFingerprint(rightsResult.data),
      validationStatus: rightsResult.data.validation.status,
      asOf: rightsResult.data.asOf,
    } : null,
    scoring: input.scoring ? { ...input.scoring } : null,
    action: input.action,
    consequence: input.consequence,
    materiallyMissingEvidence,
    readiness: {
      readyForCcf: blockers.length === 0,
      executable: blockers.length === 0 && consequence?.status === 'READY' && consequence.legal !== false,
      blockers: [...new Set(blockers)],
    },
  };

  return {
    ...payload,
    fingerprint: deterministicFingerprint(payload),
  };
}

export function assertContractDecisionEvidencePacketReady(
  packet: ContractDecisionEvidencePacketV1,
): void {
  if (!packet.readiness.readyForCcf) {
    throw new Error(`Contract decision evidence is not CCF-ready; abstain. ${packet.readiness.blockers.join(' ')}`);
  }
}
