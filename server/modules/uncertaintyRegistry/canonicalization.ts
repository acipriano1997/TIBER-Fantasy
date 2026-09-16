import { createHash } from 'crypto';
import type { UsrRecordRefV0 } from './contracts';
import { USR_DIGEST_PROFILE, USR_DIGEST_PATTERN } from './contracts';

const SET_LIKE_ARRAY_KEYS = new Set([
  'relatedTeamRefs',
  'playerIds',
  'gameRefs',
  'secondaryClasses',
  'requiredConditions',
  'expectedObservables',
  'disconfirmingObservables',
  'playerRoleChanges',
  'teamEnvironmentChanges',
  'scenarioKeys',
  'entityRefs',
  'stateEffects',
  'affectedPlayers',
  'affectedTeamVariables',
  'affectedDecisionSurfaces',
  'basisRefs',
  'coverageRefs',
  'contradictionRefs',
  'evidenceRefs',
  'witnessResults',
  'stateSupport',
  'basisWitnessIds',
  'contradictionWitnessIds',
  'resolvedStateIds',
  'remainingUnknowns',
  'attentionReasons',
  'scenarioBranchBindingRefs',
  'resolutionBasis',
  'finalWitnesses',
  'residualUncertainty',
  'reopenConditions',
  'branches',
  'affectedPlayerIds',
  'rosteredAffectedPlayerIds',
  'availableAffectedPlayerIds',
  'decisionSurfaceRefs',
  'linkedHypothesisRefs',
  'linkedDecisionRefs',
  'requiredEvidenceBeforeAction',
  'warnings',
  'reasonCodes',
]);

function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('USR canonicalization rejects non-finite numbers');
  }
  return Object.is(value, -0) ? 0 : value;
}

function canonicalSortKey(value: unknown): string {
  return JSON.stringify(value);
}

function normalize(value: unknown, key: string | null = null): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return normalizeNumber(value);
  if (Array.isArray(value)) {
    const normalized = value.map((member) => normalize(member));
    if (key && SET_LIKE_ARRAY_KEYS.has(key)) {
      return [...normalized].sort((a, b) => canonicalSortKey(a).localeCompare(canonicalSortKey(b)));
    }
    return normalized;
  }
  if (typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const childKey of Object.keys(input).sort()) {
      if (childKey === 'recordDigest') continue;
      const childValue = input[childKey];
      if (childValue === undefined) continue;
      output[childKey] = normalize(childValue, childKey);
    }
    return output;
  }
  throw new Error(`USR canonicalization rejects unsupported value type: ${typeof value}`);
}

export function canonicalUsrValue(value: unknown): unknown {
  return normalize(value);
}

export function canonicalUsrJson(value: unknown): string {
  return JSON.stringify(canonicalUsrValue(value));
}

export function digestUsrValue(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalUsrJson(value), 'utf8').digest('hex')}`;
}

export function withUsrDigest<T extends Record<string, unknown>>(value: T): T & { recordDigest: string } {
  const recordDigest = digestUsrValue(value);
  return { ...value, recordDigest };
}

export function verifyUsrDigest(value: { recordDigest: string } & Record<string, unknown>): boolean {
  if (!USR_DIGEST_PATTERN.test(value.recordDigest)) return false;
  return digestUsrValue(value) === value.recordDigest;
}

export function usrRecordRef(
  record: { schemaVersion: string; recordDigest: string } & Record<string, unknown>,
): UsrRecordRefV0 {
  const candidateId = record.recordId
    ?? record.snapshotId
    ?? record.receiptId
    ?? record.bindingId
    ?? record.overlayId
    ?? record.observationId;
  if (typeof candidateId !== 'string' || candidateId.length === 0) {
    throw new Error('USR record reference requires a stable record identifier');
  }
  if (!verifyUsrDigest(record)) {
    throw new Error('USR record reference requires a valid record digest');
  }
  return {
    schemaVersion: record.schemaVersion,
    recordId: candidateId,
    recordDigest: record.recordDigest,
  };
}

export function usrDigestProfile(): typeof USR_DIGEST_PROFILE {
  return USR_DIGEST_PROFILE;
}
