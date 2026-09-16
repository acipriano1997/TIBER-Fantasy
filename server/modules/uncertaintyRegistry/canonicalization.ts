import { createHash } from 'node:crypto';
import { USR_DIGEST_PATTERN, USR_DIGEST_PROFILE, type GovernedRefV0 } from './contracts';

export class UsrCanonicalizationError extends Error {
  constructor(
    public readonly code:
      | 'non_json_value'
      | 'non_finite_number'
      | 'invalid_timestamp'
      | 'duplicate_set_member'
      | 'digest_mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'UsrCanonicalizationError';
  }
}

const SET_LIKE_ARRAY_KEYS = new Set([
  'relatedTeamRefs',
  'playerIds',
  'gameRefs',
  'secondaryClasses',
  'competingStates',
  'resolutionWitnesses',
  'requiredConditions',
  'expectedObservables',
  'disconfirmingObservables',
  'playerRoleChanges',
  'teamEnvironmentChanges',
  'scenarioKeys',
  'entityRefs',
  'stateEffects',
  'affectedPlayerIds',
  'affectedTeamVariables',
  'affectedDecisionSurfaces',
  'warnings',
  'evidenceRefs',
  'witnessResults',
  'stateSupport',
  'resolvedStateIds',
  'remainingUnknowns',
  'attentionReasons',
  'scenarioBranchBindingRefs',
  'resolutionBasisWitnessIds',
  'residualUnknowns',
  'reopenConditions',
  'reasonCodes',
  'branches',
  'rosteredAffectedPlayerIds',
  'availableAffectedPlayerIds',
  'decisionSurfaceRefs',
  'linkedHypothesisRefs',
  'linkedDecisionRefs',
  'requiredEvidenceBeforeAction',
  'basisWitnessIds',
  'contradictionWitnessIds',
]);

const TIMESTAMP_KEYS = new Set([
  'createdAt',
  'knownAt',
  'observedAt',
  'asOf',
  'knownAtCutoff',
  'recordedAt',
  'resolvedAt',
  'reopenedAt',
  'correctedAt',
  'nextDecisionBoundary',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function normalizeTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new UsrCanonicalizationError('invalid_timestamp', `invalid timestamp: ${value}`);
  return new Date(parsed).toISOString();
}

function stableString(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new UsrCanonicalizationError('non_finite_number', 'USR canonical JSON rejects non-finite numbers');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableString).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableString(value[key])}`).join(',')}}`;
  }
  throw new UsrCanonicalizationError('non_json_value', 'USR canonicalization accepts plain JSON values only');
}

function normalize(value: unknown, key: string | null = null): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new UsrCanonicalizationError('non_finite_number', 'USR canonical JSON rejects non-finite numbers');
    return value;
  }
  if (typeof value === 'string') {
    if (key && TIMESTAMP_KEYS.has(key)) return normalizeTimestamp(value);
    return value.normalize('NFC');
  }
  if (Array.isArray(value)) {
    const members = value.map((member) => normalize(member, null));
    if (!key || !SET_LIKE_ARRAY_KEYS.has(key)) return members;
    const keyed = members.map((member) => ({ member, key: stableString(member) })).sort((a, b) => a.key.localeCompare(b.key));
    for (let i = 1; i < keyed.length; i += 1) {
      if (keyed[i - 1].key === keyed[i].key) throw new UsrCanonicalizationError('duplicate_set_member', `duplicate semantic member in ${key}`);
    }
    return keyed.map((entry) => entry.member);
  }
  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const objectKey of Object.keys(value).sort()) {
      if (value[objectKey] === undefined) throw new UsrCanonicalizationError('non_json_value', `undefined is not valid JSON at ${objectKey}`);
      output[objectKey] = normalize(value[objectKey], objectKey);
    }
    return output;
  }
  throw new UsrCanonicalizationError('non_json_value', 'USR canonicalization accepts plain JSON values only');
}

export function canonicalUsrJson(value: unknown): string {
  return stableString(normalize(value));
}

export function digestUsrValue(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalUsrJson(value), 'utf8').digest('hex')}`;
}

export function digestUsrRecord<T extends Record<string, unknown>>(record: T): string {
  const { recordDigest: _recordDigest, ...content } = record;
  return digestUsrValue(content);
}

export function withUsrRecordDigest<T extends Record<string, unknown>>(record: T): T & { recordDigest: string } {
  const recordDigest = digestUsrValue(record);
  return { ...record, recordDigest };
}

export function assertUsrRecordDigest(record: Record<string, unknown>): void {
  const current = record.recordDigest;
  if (typeof current !== 'string' || !USR_DIGEST_PATTERN.test(current)) {
    throw new UsrCanonicalizationError('digest_mismatch', 'recordDigest missing or malformed');
  }
  if (digestUsrRecord(record) !== current) {
    throw new UsrCanonicalizationError('digest_mismatch', 'recordDigest does not match canonical record content');
  }
}

export function governedRefKey(ref: GovernedRefV0): string {
  return canonicalUsrJson(ref);
}

export const USR_CANONICALIZATION_PROFILE = USR_DIGEST_PROFILE;
